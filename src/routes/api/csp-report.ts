import { createFileRoute } from "@tanstack/react-router";

import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../lib/security/rate-limit.server";

// Browsers POST here when the Report-Only policy in lib/security-headers.ts is
// violated. This endpoint exists so the allow-list can be tuned against real
// traffic before CSP is switched from Report-Only to enforcing — without a
// collector, violations only surface in the console of whoever has devtools open.
//
// The body is attacker-influenced (any page can be made to emit a report), so it
// is rate limited, size-capped, and only ever logged — never persisted or trusted.

/** Reports larger than this are almost certainly not genuine browser reports. */
const MAX_REPORT_BYTES = 16 * 1024;

/** Fields worth keeping. Everything else in the report is noise or unbounded. */
type CspViolation = {
  documentUri?: string;
  blockedUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  disposition?: string;
  sourceFile?: string;
  lineNumber?: number;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 512) : undefined;
}

/**
 * Normalise the two wire formats into one shape:
 * - `report-uri` sends `{ "csp-report": {...} }` as application/csp-report
 * - `report-to` sends `[{ type: "csp-violation", body: {...} }]` as application/reports+json
 */
export function normalizeCspReports(payload: unknown): CspViolation[] {
  const bodies: Record<string, unknown>[] = [];

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (entry && typeof entry === "object") {
        const body = (entry as Record<string, unknown>).body;
        if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === "object") {
    const legacy = (payload as Record<string, unknown>)["csp-report"];
    if (legacy && typeof legacy === "object") bodies.push(legacy as Record<string, unknown>);
  }

  return bodies.map((body) => ({
    // report-uri uses kebab-case keys; report-to uses camelCase. Accept both.
    documentUri: str(body["document-uri"] ?? body.documentURL ?? body.documentUri),
    blockedUri: str(body["blocked-uri"] ?? body.blockedURL ?? body.blockedUri),
    violatedDirective: str(body["violated-directive"] ?? body.violatedDirective),
    effectiveDirective: str(body["effective-directive"] ?? body.effectiveDirective),
    disposition: str(body.disposition),
    sourceFile: str(body["source-file"] ?? body.sourceFile),
    lineNumber: typeof body["line-number"] === "number" ? body["line-number"] : undefined,
  }));
}

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "csp-report",
          max: 60,
          window: "1 m",
        });
        if (!limit.ok) {
          return new Response(null, {
            status: 429,
            headers: { "retry-after": String(retryAfterSeconds(limit)) },
          });
        }

        const raw = await request.text();
        if (raw.length > MAX_REPORT_BYTES) return new Response(null, { status: 413 });

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response(null, { status: 400 });
        }

        for (const violation of normalizeCspReports(payload)) {
          // console.error so it lands in Vercel's error stream, where the CSP
          // allow-list can actually be reviewed before enforcing the policy.
          console.error("CSP violation", violation);
        }

        // 204: the browser ignores the body, and returning nothing keeps this
        // endpoint useless as a reflection surface.
        return new Response(null, { status: 204 });
      },
    },
  },
});
