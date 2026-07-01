import { Link } from "@tanstack/react-router";
import { Cat, Dog } from "lucide-react";
import type { Animal } from "../../types/animal";
import { ShortlistActionButton } from "./ShortlistActionButton";

interface AnimalCardProps {
  animal: Animal;
}

export function AnimalCard({ animal }: AnimalCardProps) {
  const detailHref =
    animal.type === "sponsor" ? `/sponsors/${animal.id}` : `/animals/${animal.type}/${animal.id}`;

  const placeholderBg = animal.type === "dog" ? "var(--color-dog-bg)" : "var(--color-cat-bg)";

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden border border-[var(--color-border)] flex flex-col hover:shadow-md transition-shadow">
      <Link to={detailHref} className="block">
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
              <Dog className="h-16 w-16 text-[var(--color-dog)] opacity-30" strokeWidth={1} />
            ) : (
              <Cat className="h-16 w-16 text-[var(--color-cat)] opacity-30" strokeWidth={1} />
            )}
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="font-semibold text-[var(--color-text)]">{animal.name}</div>

        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.gender === "male" ? "公" : "母"}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">
            {animal.age}
          </span>
          {animal.notes && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
              {animal.notes}
            </span>
          )}
        </div>

        <ShortlistActionButton animal={animal} compact />
      </div>
    </div>
  );
}
