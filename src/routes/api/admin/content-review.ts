import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import { createContentReviewService } from "../../../lib/contentReview/service";
import { createContentReviewRepository } from "../../../lib/contentReview/repository.server";
import { createContentReviewHttp } from "../../../lib/contentReview/http.server";
function handle(request: Request) {
  const client = createSupabaseServiceClient();
  return createContentReviewHttp({
    authenticate: async (request) =>
      (await requireAdmin(request, ["staff", "admin"], client)).authUserId,
    service: createContentReviewService(createContentReviewRepository(client)),
  })(request);
}
export const Route = createFileRoute("/api/admin/content-review")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
