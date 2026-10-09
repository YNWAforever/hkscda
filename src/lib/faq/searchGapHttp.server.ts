import { z } from "zod";

import { readBoundedText } from "../http/boundedBody.server";
import { retryAfterSeconds, type RateLimitResult } from "../security/rate-limit.server";

// POST /api/help/search-gap: a telemetry beacon fired by the public help search
// when it found no answer (or a weak one). There is no form, so there is no
// Turnstile token to check; the control is a rate limit, a JSON-only content
// type (not CORS-safelisted, so a cross-origin page cannot forge one without a
// preflight that this route never answers) and a tiny body cap.
//
// The browser cannot act on the outcome, so every non-client-error ends in 204
// and a storage failure is logged rather than surfaced.

/** A valid beacon is about 60 bytes; anything near this is not one. */
const MAX_BEACON_BYTES = 1024;

type SearchGapBeaconHandlerDeps = {
  rateLimit(request: Request): Promise<RateLimitResult>;
  record(input: unknown): Promise<"recorded" | "dropped">;
  log?: Pick<Console, "error">;
};

export function createSearchGapBeaconHandler({
  rateLimit,
  record,
  log = console,
}: SearchGapBeaconHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleSearchGapBeacon(request) {
    const limit = await rateLimit(request);
    if (!limit.ok) {
      return new Response(null, {
        status: 429,
        headers: { "retry-after": String(retryAfterSeconds(limit)) },
      });
    }

    const contentType = (request.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") return new Response(null, { status: 415 });

    const raw = await readBoundedText(request, MAX_BEACON_BYTES);
    if (raw === null) return new Response(null, { status: 413 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }

    try {
      await record(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) return new Response(null, { status: 400 });
      log.error("FAQ search gap record failed", error);
    }

    // 204 for recorded, dropped and storage-failed alike: nothing to reflect.
    return new Response(null, { status: 204 });
  };
}
