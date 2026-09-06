import { useState } from "react";
import { Cat, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";

/** The portrait and its fallback occupy the same space, including after a load failure. */
export function AnimalPhoto({ animal, detail = false }: { animal: Animal; detail?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasPhoto = Boolean(animal.image_url && failedUrl !== animal.image_url);
  const Icon = animal.type === "dog" ? Dog : Cat;
  return (
    <div
      className={
        detail
          ? "animal-profile-photo animal-profile-photo-detail detail-gallery"
          : "animal-profile-photo public-animal-media"
      }
    >
      {hasPhoto ? (
        <img
          src={animal.image_url!}
          alt={animal.name + "的相片"}
          loading={detail ? "eager" : "lazy"}
          onError={() => setFailedUrl(animal.image_url)}
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
    </div>
  );
}
