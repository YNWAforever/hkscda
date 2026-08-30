import {
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  photoCategorySchema,
  type AdoptionPhotoCategory,
} from "../../../lib/publicAdoption/schemas";
import { getSupabaseClient } from "../../../lib/supabase";

export type PhotoUploadStatus = "idle" | "uploading" | "done" | "error";

export type SelectedPhoto = {
  id: string;
  category: AdoptionPhotoCategory;
  file: File;
  status: PhotoUploadStatus;
  storagePath?: string;
  errorMessage?: string;
};

export const PHOTO_CATEGORY_LABELS: Record<AdoptionPhotoCategory, { zh: string; en: string }> = {
  home: { zh: "家居全景", en: "Home view" },
  window: { zh: "窗門安全", en: "Window safety" },
  living: { zh: "主要活動空間", en: "Living area" },
};

export function validateSelectedFile(category: string, file: File) {
  const parsedCategory = photoCategorySchema.parse(category);
  if (!PHOTO_MIME_TYPES.includes(file.type as (typeof PHOTO_MIME_TYPES)[number])) {
    return { ok: false as const, message: "只接受 JPG、PNG 或 WebP 圖片。" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false as const, message: "每張相片不可超過 8MB。" };
  }
  return {
    ok: true as const,
    photo: {
      id: `${parsedCategory}:${file.name}:${file.size}`,
      category: parsedCategory,
      file,
      status: "idle" as const,
    },
  };
}

export async function uploadPhotoDirectly(
  photo: SelectedPhoto,
  applicationId: string,
  signedUrl: { path: string; token: string },
): Promise<{ ok: true; storagePath: string } | { ok: false; message: string }> {
  const client = getSupabaseClient();
  const { error } = await client.storage
    .from("adoption-application-photos")
    .uploadToSignedUrl(signedUrl.path, signedUrl.token, photo.file, {
      contentType: photo.file.type,
    });
  if (error) {
    return { ok: false, message: "上傳失敗，請重試。" };
  }
  return { ok: true, storagePath: signedUrl.path };
}

export type PhotoUploadUrlsResponse = {
  applicationId: string;
  uploads: Array<{ category: string; path: string; signedUrl: string; token: string }>;
};

export async function requestPhotoUploadUrls(
  photos: SelectedPhoto[],
): Promise<PhotoUploadUrlsResponse> {
  const response = await fetch("/api/adoption/applications/photo-upload-urls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      photos: photos.map((photo) => ({
        category: photo.category,
        fileName: photo.file.name,
        mimeType: photo.file.type,
        sizeBytes: photo.file.size,
      })),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "無法準備相片上傳。");
  }
  return result as PhotoUploadUrlsResponse;
}

export async function uploadAllPhotos(photos: SelectedPhoto[]): Promise<{
  applicationId: string;
  uploaded: Array<{
    category: AdoptionPhotoCategory;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }>;
}> {
  const { applicationId, uploads } = await requestPhotoUploadUrls(photos);

  const uploaded: Array<{
    category: AdoptionPhotoCategory;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }> = [];
  for (const photo of photos) {
    const signedUrl = uploads.find((upload) => upload.category === photo.category);
    if (!signedUrl) throw new Error(`Missing signed upload URL for ${photo.category}`);
    const result = await uploadPhotoDirectly(photo, applicationId, signedUrl);
    if (!result.ok) throw new Error(result.message);
    uploaded.push({
      category: photo.category,
      fileName: photo.file.name,
      mimeType: photo.file.type,
      sizeBytes: photo.file.size,
      storagePath: result.storagePath,
    });
  }

  return { applicationId, uploaded };
}
