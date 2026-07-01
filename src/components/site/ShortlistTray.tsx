import { Link } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";

import { useShortlist } from "./ShortlistContext";

export function ShortlistTray() {
  const { items, message, persistenceWarning, clearMessage, removeItem } = useShortlist();
  const adoptionItems = items.filter((item) => item.intent === "adoption");
  const sponsorshipItems = items.filter((item) => item.intent === "sponsorship");
  const firstRankedAdoptionItem = [...adoptionItems].sort(
    (left, right) => left.rank - right.rank,
  )[0];

  if (items.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-panel"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Heart className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-panel)]">
              已選 {items.length} 隻：領養 {adoptionItems.length}，助養 {sponsorshipItems.length}
            </p>
            {(message || persistenceWarning) && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {message ?? persistenceWarning}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adoptionItems.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => removeItem(item.id)}
              className="inline-flex max-w-32 items-center gap-1 rounded-full bg-[var(--color-surface-offset)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
              aria-label={`移除 ${item.name}`}
              title={`移除 ${item.name}`}
            >
              <span className="truncate">
                {item.rank}. {item.name}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {sponsorshipItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => removeItem(item.id)}
              className="inline-flex max-w-32 items-center gap-1 rounded-full bg-[var(--color-cta)] px-3 py-1 text-xs font-medium text-white"
              aria-label={`移除 ${item.name}`}
              title={`移除 ${item.name}`}
            >
              <Heart className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.name}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {message && (
            <button
              type="button"
              onClick={clearMessage}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
            >
              關閉提示
            </button>
          )}
          {firstRankedAdoptionItem && (
            <Link
              to="/adoption/apply"
              search={{
                animalId: firstRankedAdoptionItem.id,
                animalName: firstRankedAdoptionItem.name,
                type: firstRankedAdoptionItem.animalType,
              }}
              className="btn-cta py-2! px-4! text-xs!"
            >
              申請領養
            </Link>
          )}
          {sponsorshipItems.length > 0 && (
            <Link to="/sponsors" className="btn-cta py-2! px-4! text-xs!">
              開始助養
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
