import { createAnimalDraftPhotoUploadHandler } from "../../../../lib/animals/draftUpload.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAnimalDraftPhotoUploadHandler({
    client,
    requireAnimalAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
  });
}
