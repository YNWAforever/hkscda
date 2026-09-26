import { createFileRoute } from "@tanstack/react-router";
import { internshipHandlers } from "../../../lib/internships/handlers.server";
import { enforceRateLimit, getClientIp } from "../../../lib/security/rate-limit.server";
export const Route = createFileRoute("/api/internships/")({
  server: {
    handlers: {
      GET: () => internshipHandlers().get(),
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "internship-intake",
          max: 20,
          window: "1 m",
          requireAvailability: true,
        });
        if (limit.unavailable) {
          return Response.json(
            { error: "Submission temporarily unavailable. Please try again later." },
            { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } },
          );
        }
        if (!limit.ok) return Response.json({ error: "請稍後再試" }, { status: 429 });
        return internshipHandlers().post(request);
      },
    },
  },
});
