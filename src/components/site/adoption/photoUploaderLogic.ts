import {
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  photoCategorySchema,
  type AdoptionPhotoCategory,
} from "../../../lib/publicAdoption/schemas";

export type SelectedPhoto = {
  id: string;
  category: AdoptionPhotoCategory;
  file: File;
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
    },
  };
}
