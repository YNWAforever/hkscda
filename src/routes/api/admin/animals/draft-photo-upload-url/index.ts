import { createFileRoute } from "@tanstack/react-router";
import { createAnimalDraftPhotoUploadHandler } from "../../../../../lib/animals/draftUpload.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/animals/draft-photo-upload-url/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const c = createSupabaseServiceClient();
        const h = createAnimalDraftPhotoUploadHandler({
          client: c,
          requireAnimalAdmin: (r) => requireAdmin(r, ["staff", "admin"], c),
        });
        return h.createUploadUrl({ request });
      },
    },
  },
});
