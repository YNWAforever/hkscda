import { useState } from "react";
import { Cat, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";

/** The portrait and its fallback occupy the same space, including after a load failure. */
export function AnimalPhoto({ animal, detail = false }: { animal: Animal; detail?: boolean }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const failed = (url: string) => failedUrls.includes(url);
  const markFailed = (url: string) =>
    setFailedUrls((current) => (current.includes(url) ? current : [...current, url]));
  const hasPhoto = Boolean(animal.image_url && !failed(animal.image_url));
  const gallery = detail
    ? (animal.gallery ?? [])
        .filter((item) => item.review_status === "approved" && item.url && !failed(item.url))
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const Icon = animal.type === "dog" ? Dog : Cat;
  return (
    <div
      className={
        detail
          ? "animal-profile-photo animal-profile-photo-detail detail-gallery"
          : "animal-profile-photo animal-profile-photo-card public-animal-media"
      }
    >
      {hasPhoto ? (
        <img
          src={animal.image_url!}
          alt={animal.name + "的相片"}
          loading={detail ? "eager" : "lazy"}
          onError={() => markFailed(animal.image_url!)}
        />
      ) : (
        <div
          className={
            "animal-profile-photo-empty " +
            (detail ? "detail-image-fallback" : "public-animal-fallback")
          }
        >
          <Icon aria-hidden="true" />
          <small>暫未有相片</small>
        </div>
      )}
      {gallery.map((item) => (
        <figure key={item.id}>
          <img
            src={item.url!}
            alt={item.alt_zh}
            loading="lazy"
            style={{ objectPosition: item.focal_x + "% " + item.focal_y + "%" }}
            onError={() => markFailed(item.url!)}
          />
          {item.source && (
            <figcaption className="text-xs text-[var(--color-text-muted)]">
              相片來源：{item.source}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
