import { createAnimalPhotoUploadHandlers } from "../../../../lib/animals/photoUpload.http.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAnimalPhotoUploadHandlers({
    // Staff maintain animal records; the same role pair the documents surface uses.
    requireAnimalAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    async createSignedUpload(bucket, path) {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error) throw error;
      if (!data) throw new Error(`Missing signed upload data for ${path}`);
      return { path: data.path, signedUrl: data.signedUrl, token: data.token };
    },
  });
}
