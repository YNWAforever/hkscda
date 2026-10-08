import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { createSearchGapBeaconHandler } from "../../../lib/faq/searchGapHttp.server";
import { createSupabaseSearchGapRepository } from "../../../lib/faq/searchGapRepository.server";
import { createSearchGapService } from "../../../lib/faq/searchGaps";
import { enforceRateLimit, getClientIp } from "../../../lib/security/rate-limit.server";

// Beacon from the public help search when a query found no (or only a weak)
// answer. Carries only a topic the browser has already sanitised and this route
// sanitises again, so it is rate limited, JSON-only and size-capped rather than
// Turnstile-verified. See lib/faq/searchGapHttp.server.ts.
const handleSearchGapBeacon = createSearchGapBeaconHandler({
  rateLimit: (request) =>
    enforceRateLimit(getClientIp(request), {
      prefix: "help-search-gap",
      max: 30,
      window: "1 m",
    }),
  // The client is built per call so a failure to create it is caught with the
  // other storage errors and answered with 204 instead of an unhandled 500.
  record: (input) =>
    createSearchGapService({
      repo: createSupabaseSearchGapRepository(createSupabaseServiceClient()),
    }).record(input),
});

export const Route = createFileRoute("/api/help/search-gap")({
  server: {
    handlers: {
      POST: ({ request }) => handleSearchGapBeacon(request),
    },
  },
});
