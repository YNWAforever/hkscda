import { createFileRoute } from "@tanstack/react-router";
import { loadCurrentSponsorshipTerms } from "../../../lib/sponsorship/terms.server";

export function createSponsorshipTermsHandler(
  loadTerms = loadCurrentSponsorshipTerms,
  logger: Pick<Console, "error"> = console,
) {
  return async (request: Request) => {
    const language = new URL(request.url).searchParams.get("language") === "en" ? "en" : "zh-HK";
    try {
      const terms = await loadTerms(language);
      return Response.json(terms ? { available: true, terms } : { available: false }, {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      logger.error("Sponsorship terms unavailable", error);
      return Response.json(
        { available: false, error: "Could not load sponsorship terms" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  };
}

export const Route = createFileRoute("/api/sponsorships/terms")({
  server: { handlers: { GET: ({ request }) => createSponsorshipTermsHandler()(request) } },
});
