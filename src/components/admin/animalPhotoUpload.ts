import { supabase } from "../../lib/supabase";
import {
  ANIMAL_IMAGE_BUCKET,
  ANIMAL_IMAGE_MAX_BYTES,
  ANIMAL_IMAGE_MIME_TYPES,
} from "../../lib/animals/photoUpload";
import { fetchAdminJson } from "../../lib/admin/http";

export type AnimalPhotoUploadResult = { ok: true; path: string; publicUrl: string } | { ok: false };

type UploadUrlResponse = {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
};

export type UploadAnimalPhotoDeps = {
  requestUploadUrl?: (animalId: string, file: File) => Promise<UploadUrlResponse>;
  uploadToSignedUrl?: (
    bucket: string,
    path: string,
    token: string,
    file: File,
  ) => Promise<{ error: unknown }>;
  publicUrlFor?: (bucket: string, path: string) => string;
};

/**
 * Uploads one animal photograph to a new immutable object path.
 *
 * The previous implementation wrote to `${animalId}.jpg` with `upsert: true`
 * straight from the browser, destroying the animal's existing photograph before
 * the database row was even attempted. Here the server chooses the path, the
 * upload is authorised by a signed URL rather than by storage RLS, and nothing
 * is ever written over an existing object -- so the live photo survives a
 * failed upload, a failed save, and a replacement alike.
 *
 * The client-side format and size checks are a courtesy that avoids a pointless
 * round trip. The server validates the same rules again, and the bucket itself
 * enforces them a third time; the constants are imported from the shared module
 * so the three cannot drift apart.
 */
export async function uploadAnimalPhoto(
  input: { animalId: string; file: File },
  deps: UploadAnimalPhotoDeps = {},
): Promise<AnimalPhotoUploadResult> {
  const { file, animalId } = input;

  if (!(ANIMAL_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return { ok: false };
  if (file.size <= 0 || file.size > ANIMAL_IMAGE_MAX_BYTES) return { ok: false };

  const requestUploadUrl =
    deps.requestUploadUrl ??
    ((id: string, f: File) =>
      fetchAdminJson<UploadUrlResponse>("/api/admin/animals/draft-photo-upload-url", {
        method: "POST",
        body: JSON.stringify({
          animalId: id,
          photo: { fileName: f.name, mimeType: f.type, sizeBytes: f.size },
        }),
      }));

  const uploadToSignedUrl =
    deps.uploadToSignedUrl ??
    (async (bucket: string, path: string, token: string, f: File) =>
      supabase.storage.from(bucket).uploadToSignedUrl(path, token, f));

  const publicUrlFor =
    deps.publicUrlFor ??
    ((bucket: string, path: string) =>
      supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);

  let target: UploadUrlResponse;
  try {
    target = await requestUploadUrl(animalId, file);
  } catch {
    return { ok: false };
  }

  const bucket = "animal-draft-images";
  const { error } = await uploadToSignedUrl(bucket, target.path, target.token, file);
  if (error) return { ok: false };

  return { ok: true, path: target.path, publicUrl: "" };
}
