import { Link } from "@tanstack/react-router";
import { Cat, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";
import { ShortlistActionButton } from "./ShortlistActionButton";

interface AnimalDetailProps {
  animal: Animal;
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const placeholderBg = animal.type === "dog" ? "var(--color-dog-bg)" : "var(--color-cat-bg)";

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link
        to={backHref}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1"
      >
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Photo */}
        <div className="rounded-2xl overflow-hidden">
          {animal.image_url ? (
            <img
              src={animal.image_url}
              alt={animal.name}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div
              className="w-full aspect-square flex items-center justify-center"
              style={{ background: placeholderBg }}
            >
              {animal.type === "dog" ? (
                <Dog className="h-24 w-24 text-[var(--color-dog)] opacity-25" strokeWidth={1} />
              ) : (
                <Cat className="h-24 w-24 text-[var(--color-cat)] opacity-25" strokeWidth={1} />
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-bold">{animal.name}</h1>
          {animal.name_en && <p className="text-[var(--color-text-muted)]">{animal.name_en}</p>}

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.gender === "male" ? "公" : "母"}
            </span>
            <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-surface-offset)]">
              {animal.age}
            </span>
            {animal.notes && (
              <span className="px-3 py-1 rounded-full text-sm bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
                {animal.notes}
              </span>
            )}
          </div>

          {animal.description && (
            <p className="text-[var(--color-text-muted)] leading-relaxed">{animal.description}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <ShortlistActionButton animal={animal} />
          </div>
        </div>
      </div>
    </main>
  );
}
