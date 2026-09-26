import { createFileRoute } from "@tanstack/react-router";
import { readBoundedText } from "../../lib/http/boundedBody.server";

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

/**
 * Violations kept from a single request. The byte cap alone bounds nothing
 * useful here: a minimal Reporting-API entry is ~34 bytes, so 16 KiB holds ~468
 * of them, and one log line each turns a single POST into hundreds of records in
 * a billed log stream. Real batches from a browser are small.
 */
const MAX_REPORTS_PER_REQUEST = 20;

/**
 * The two content types the reporting machinery actually sends. Neither is
 * CORS-safelisted, so requiring one of them forces a preflight on any
 * cross-origin POST — and with no OPTIONS handler that preflight fails. Without
 * this check the endpoint accepts `text/plain`, which is safelisted, letting any
 * third-party page forge violations from a visitor's browser and skew the
 * allow-list this data is collected to tune.
 */
const ALLOWED_CONTENT_TYPES = ["application/csp-report", "application/reports+json"];

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

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).type === "csp-violation"
      ) {
        const body = (entry as Record<string, unknown>).body;
        if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === "object") {
    const legacy = (payload as Record<string, unknown>)["csp-report"];
    if (legacy && typeof legacy === "object") bodies.push(legacy as Record<string, unknown>);
  }

  return bodies.slice(0, MAX_REPORTS_PER_REQUEST).map((body) => ({
    // report-uri uses kebab-case keys; report-to uses camelCase. Accept both.
    documentUri: str(body["document-uri"] ?? body.documentURL),
    blockedUri: str(body["blocked-uri"] ?? body.blockedURL),
    violatedDirective: str(body["violated-directive"] ?? body.violatedDirective),
    effectiveDirective: str(body["effective-directive"] ?? body.effectiveDirective),
    disposition: str(body.disposition),
    sourceFile: str(body["source-file"] ?? body.sourceFile),
    lineNumber: num(body["line-number"]) ?? num(body.lineNumber),
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

        // Only the real reporting content types. Anything else is either a
        // misconfiguration or a cross-origin forgery attempt riding a
        // CORS-safelisted type; see ALLOWED_CONTENT_TYPES.
        const contentType = (request.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
          return new Response(null, { status: 415 });
        }

        const raw = await readBoundedText(request, MAX_REPORT_BYTES);
        if (raw === null) return new Response(null, { status: 413 });

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response(null, { status: 400 });
        }

        const violations = normalizeCspReports(payload);
        if (violations.length > 0) {
          // console.error so it lands in Vercel's error stream, where the CSP
          // allow-list can actually be reviewed before enforcing the policy. One
          // line per request, not per violation — see MAX_REPORTS_PER_REQUEST.
          console.error("CSP violations", violations);
        }

        // 204: the browser ignores the body, and returning nothing keeps this
        // endpoint useless as a reflection surface.
        return new Response(null, { status: 204 });
      },
    },
  },
});
