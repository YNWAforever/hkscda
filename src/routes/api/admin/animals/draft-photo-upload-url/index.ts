import { createFileRoute } from "@tanstack/react-router";
import { createAnimalPhotoUploadHandlers } from "../../../../../lib/animals/photoUpload.http.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/animals/draft-photo-upload-url/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const c = createSupabaseServiceClient();
        const h = createAnimalPhotoUploadHandlers({
          bucket: "animal-draft-images",
          requireAnimalAdmin: (r) => requireAdmin(r, ["staff", "admin"], c),
          async createSignedUpload(bucket, path) {
            const { data, error } = await c.storage.from(bucket).createSignedUploadUrl(path);
            if (error) throw error;
            return { ...data, path: data.path };
          },
        });
        return h.createUploadUrl({ request });
      },
    },
  },
});
