import { Image, Upload, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { cn } from "../../../lib/utils";
import { PHOTO_MIME_TYPES, type AdoptionPhotoCategory } from "../../../lib/publicAdoption/schemas";
import {
  PHOTO_CATEGORY_LABELS,
  validateSelectedFile,
  type SelectedPhoto,
} from "./photoUploaderLogic";

const PHOTO_CATEGORIES: Array<{
  id: AdoptionPhotoCategory;
  helper: string;
}> = [
  { id: "home", helper: "客廳、走廊或動物主要休息位置。" },
  { id: "window", helper: "窗網、門閘、露台或其他防走失位置。" },
  { id: "living", helper: "食水、貓砂盆、睡墊或預備活動範圍。" },
];

type PhotoUploaderProps = {
  photos: SelectedPhoto[];
  onPhotosChange: (photos: SelectedPhoto[]) => void;
};

export function PhotoUploader({ photos, onPhotosChange }: PhotoUploaderProps) {
  const [message, setMessage] = useState<string | null>(null);

  function handleFileChange(category: AdoptionPhotoCategory, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const result = validateSelectedFile(category, file);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onPhotosChange([...photos.filter((photo) => photo.category !== category), result.photo]);
      setMessage(`${PHOTO_CATEGORY_LABELS[category].zh}已加入，提交前可再更換。`);
    } catch {
      setMessage("相片分類無效，請重新選擇。");
    }
  }

  function removePhoto(category: AdoptionPhotoCategory) {
    onPhotosChange(photos.filter((photo) => photo.category !== category));
    setMessage(`${PHOTO_CATEGORY_LABELS[category].zh}已移除。`);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
        草稿只會儲存文字答案；相片會留在這個瀏覽器分頁，關閉或重新整理後需要重新選擇。
      </div>

      <div className="grid gap-3">
        {PHOTO_CATEGORIES.map((category) => {
          const selected = photos.find((photo) => photo.category === category.id);
          const label = PHOTO_CATEGORY_LABELS[category.id];

          return (
            <div
              key={category.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--color-panel)]">
                    {label.zh}
                    <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
                      {label.en}
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{category.helper}</p>
                </div>

                <label
                  className={cn(
                    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    "bg-[var(--color-panel)] text-[var(--color-text-inverse)] hover:bg-[var(--color-panel-2)]",
                  )}
                >
                  <Upload className="h-4 w-4" />
                  {selected ? "更換" : "選擇"}
                  <input
                    type="file"
                    accept={PHOTO_MIME_TYPES.join(",")}
                    className="sr-only"
                    onChange={(event) => handleFileChange(category.id, event)}
                  />
                </label>
              </div>

              {selected ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--color-surface-offset)] px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2 text-[var(--color-panel)]">
                    <Image className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <span className="truncate">{selected.file.name}</span>
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                      {(selected.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(category.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-primary-highlight)] hover:text-[var(--color-primary)]"
                    aria-label={`移除${label.zh}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {message ? (
        <p className="text-sm text-[var(--color-text-muted)]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
