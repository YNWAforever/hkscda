import { Link } from "@tanstack/react-router";
import { Cat, CheckCircle2, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";

interface AnimalDetailProps {
  animal: Animal;
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const TypeIcon = animal.type === "dog" ? Dog : Cat;
  const typeLabel = animal.type === "dog" ? "狗狗" : "貓貓";

  return (
    <main className="container-wide px-4 py-10 sm:px-6 lg:px-8">
      <Link to={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-md bg-[var(--color-surface-offset)]">
          {animal.image_url ? (
            <img src={animal.image_url} alt={"待領養" + typeLabel + "：" + animal.name} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center">
              <TypeIcon className="h-24 w-24 text-[var(--color-primary)] opacity-35" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <PublicStatusBadge tone="info" icon={CheckCircle2}>待領養</PublicStatusBadge>
            <span className="inline-flex min-h-7 items-center gap-2 bg-[var(--color-surface-offset)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" /> {typeLabel}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-[var(--color-text)]">{animal.name}</h1>
          {animal.name_en ? <p className="text-[var(--color-text-muted)]">{animal.name_en}</p> : null}
          <div className="flex flex-wrap gap-4 text-sm text-[var(--color-text-muted)]">
            <span>{animal.gender === "male" ? "公" : "母"}</span>
            <span>{animal.age}</span>
          </div>
          {animal.description ? <p className="leading-relaxed text-[var(--color-text-muted)]">{animal.description}</p> : null}
          {animal.notes ? <p className="border-l-4 border-[var(--color-secondary)] pl-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{animal.notes}</p> : null}
          <div className="pt-2">
            <ShortlistActionButton animal={animal} />
          </div>
        </div>
      </div>
    </main>
  );
}