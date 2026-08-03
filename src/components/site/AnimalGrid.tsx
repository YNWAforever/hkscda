import { useNavigate } from "@tanstack/react-router";
import { AnimalCard } from "./AnimalCard";
import { PublicStateShell } from "./PublicStateShell";
import type { Animal, AgeFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";

interface AnimalGridProps {
  animals: Animal[];
  total: number;
  page: number;
  ageFilter: AgeFilter;
  pageSize?: number;
  animalLabel?: string;
}

const AGE_TABS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "bb", label: "BB" },
  { value: "adult", label: "成" },
  { value: "senior", label: "老" },
];

export function AnimalGrid({
  animals,
  total,
  page,
  ageFilter,
  pageSize = 16,
  animalLabel = "動物",
}: AnimalGridProps) {
  const navigate = useNavigate();
  const totalPages = Math.ceil(total / pageSize);
  const filtered =
    ageFilter === "all"
      ? animals
      : animals.filter((animal) => parseAgeFilter(animal.age) === ageFilter);

  function setFilter(filter: AgeFilter) {
    // @ts-expect-error search params typing varies by route
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, filter, page: 1 }) });
  }

  function setPage(nextPage: number) {
    // @ts-expect-error search params typing varies by route
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, page: nextPage }) });
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="按年齡篩選" className="flex flex-wrap gap-2">
          {AGE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              aria-pressed={ageFilter === tab.value}
              className={
                ageFilter === tab.value
                  ? "min-h-11 rounded-md bg-[var(--color-primary)] px-4 text-sm text-white"
                  : "min-h-11 rounded-md bg-[var(--color-surface-offset)] px-4 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-[var(--color-text-muted)] sm:ml-auto">
          共 {total} 隻{animalLabel}
        </span>
      </div>

      {filtered.length === 0 ? (
        <PublicStateShell
          title={"暫時沒有符合條件的" + animalLabel}
          description={"目前沒有符合條件的" + animalLabel + "，你可以調整篩選條件或稍後再來查看。"}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          {filtered.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="動物列表分頁" className="flex flex-wrap justify-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="上一頁"
            className="min-h-11 min-w-11 rounded-md border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            ←
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((itemPage) => (
            <button
              key={itemPage}
              type="button"
              onClick={() => setPage(itemPage)}
              aria-current={itemPage === page ? "page" : undefined}
              className={
                itemPage === page
                  ? "min-h-11 min-w-11 rounded-md bg-[var(--color-primary)] px-3 text-sm text-white"
                  : "min-h-11 min-w-11 rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface-offset)]"
              }
            >
              {itemPage}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="下一頁"
            className="min-h-11 min-w-11 rounded-md border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
