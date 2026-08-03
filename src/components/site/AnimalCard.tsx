import { Link } from "@tanstack/react-router";
import { Cat, CheckCircle2, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";

interface AnimalCardProps {
  animal: Animal;
}

export function AnimalCard({ animal }: AnimalCardProps) {
  const detailHref =
    animal.type === "sponsor" ? "/sponsors/" + animal.id : "/animals/" + animal.type + "/" + animal.id;
  const TypeIcon = animal.type === "dog" ? Dog : Cat;
  const typeLabel = animal.type === "dog" ? "狗狗" : animal.type === "cat" ? "貓貓" : "助養動物";

  return (
    <article className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <Link to={detailHref} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset">
        <div className="flex aspect-square items-center justify-center bg-[var(--color-surface-offset)]">
          {animal.image_url ? (
            <img
              src={animal.image_url}
              alt={"待領養" + typeLabel + "：" + animal.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <TypeIcon className="h-16 w-16 text-[var(--color-primary)] opacity-35" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-h-[188px] flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PublicStatusBadge tone="info" icon={CheckCircle2}>待領養</PublicStatusBadge>
            <span className="inline-flex min-h-7 items-center gap-1 rounded bg-[var(--color-surface-offset)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" /> {typeLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{animal.name}</h2>
          <div className="flex flex-wrap gap-2 text-sm text-[var(--color-text-muted)]">
            <span>{animal.gender === "male" ? "公" : "母"}</span>
            <span aria-hidden="true">·</span>
            <span>{animal.age}</span>
          </div>
          {animal.notes ? <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{animal.notes}</p> : null}
          <span className="mt-auto inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary)]">查看資料</span>
        </div>
      </Link>
      <div className="px-4 pb-4">
        <ShortlistActionButton animal={animal} compact />
      </div>
    </article>
  );
}