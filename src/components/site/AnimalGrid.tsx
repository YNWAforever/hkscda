import { useNavigate } from "@tanstack/react-router";
import { AnimalCard } from "./AnimalCard";
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
    ageFilter === "all" ? animals : animals.filter((a) => parseAgeFilter(a.age) === ageFilter);

  function setFilter(f: AgeFilter) {
    // @ts-expect-error search params typing varies by route
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, filter: f, page: 1 }) });
  }

  function setPage(p: number) {
    // @ts-expect-error search params typing varies by route
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, page: p }) });
  }

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <div role="group" aria-label="按年齡篩選" className="flex gap-2 flex-wrap">
          {AGE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              aria-pressed={ageFilter === tab.value}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                ageFilter === tab.value
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-[var(--color-text-muted)] self-center">
          共 {total} 隻{animalLabel}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-[var(--color-text-muted)]">
          暫時沒有符合條件的{animalLabel}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 pt-4">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="上一頁"
            className="px-3 py-1.5 rounded text-sm disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            ←
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1.5 rounded text-sm ${
                p === page
                  ? "bg-[var(--color-primary)] text-white"
                  : "hover:bg-[var(--color-surface-offset)]"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="下一頁"
            className="px-3 py-1.5 rounded text-sm disabled:opacity-30 hover:bg-[var(--color-surface-offset)]"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
