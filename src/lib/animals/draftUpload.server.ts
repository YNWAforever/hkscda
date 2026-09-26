import type { SupabaseClient } from "@supabase/supabase-js";

import { createAnimalPhotoUploadHandlers } from "./photoUpload.http.server";

type DraftUploadClient = Pick<SupabaseClient, "rpc" | "storage">;

export function createAnimalDraftPhotoUploadHandler({
  client,
  requireAnimalAdmin,
  newVersion,
}: {
  client: DraftUploadClient;
  requireAnimalAdmin: (request: Request) => Promise<unknown>;
  newVersion?: () => string;
}) {
  return createAnimalPhotoUploadHandlers({
    bucket: "animal-draft-images",
    requireAnimalAdmin,
    newVersion,
    async createSignedUpload(bucket, path) {
      const animalId = path.slice(0, path.indexOf("/"));
      const { error: intentError } = await client.rpc("reserve_animal_draft_image_upload", {
        p_animal_id: animalId,
        p_storage_path: path,
      });
      if (intentError) throw intentError;

      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error) throw error;
      return { ...data, path: data.path };
    },
  });
}
