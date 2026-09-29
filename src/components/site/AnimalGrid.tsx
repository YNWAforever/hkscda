import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AnimalCard } from "./AnimalCard";
import type {
  AgeFilter,
  Animal,
  GenderFilter,
  NeuteredFilter,
  SuitabilityFilter,
} from "../../types/animal";

interface AnimalGridProps {
  animals: Animal[];
  intent?: "adoption" | "sponsorship";
  total: number;
  page: number;
  ageFilter: AgeFilter;
  genderFilter?: GenderFilter;
  q?: string;
  neutered?: NeuteredFilter;
  suitability?: SuitabilityFilter;
  pageSize?: number;
  animalLabel?: string;
  isRefreshing?: boolean;
}

const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "全部年齡" },
  { value: "bb", label: "幼年" },
  { value: "adult", label: "成年" },
  { value: "senior", label: "熟齡" },
];

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: "all", label: "全部性別" },
  { value: "female", label: "母" },
  { value: "male", label: "公" },
];

function ListingState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="public-state-shell mx-auto max-w-xl px-6 py-12 text-center sm:px-10 sm:py-16"
    >
      <h2 className="text-2xl font-bold text-[var(--color-text)]">{title}</h2>
      <p className="mt-3 text-[var(--color-text-muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}

export function AnimalGrid({
  animals,
  intent,
  total,
  page,
  ageFilter,
  genderFilter,
  q,
  neutered = "all",
  suitability = "all",
  pageSize = 16,
  animalLabel = "動物",
  isRefreshing = false,
}: AnimalGridProps) {
  const navigate = useNavigate();
  const totalPages = Math.ceil(total / pageSize);
  // Only the species listing routes declare a `gender` search param. Consumers that
  // omit the prop (e.g. /sponsors) get no gender controls and no gender in the URL.
  const genderFilterEnabled = genderFilter !== undefined;
  const activeGender: GenderFilter = genderFilter ?? "all";
  const profileFiltersEnabled = q !== undefined;
  const hasFilters =
    ageFilter !== "all" ||
    activeGender !== "all" ||
    Boolean(q) ||
    neutered !== "all" ||
    suitability !== "all";

  function updateSearch(next: {
    filter?: AgeFilter;
    gender?: GenderFilter;
    page?: number;
    q?: string;
    neutered?: NeuteredFilter;
    suitability?: SuitabilityFilter;
  }) {
    // @ts-expect-error search params are shared by the species listing routes
    navigate({ search: (previous: Record<string, unknown>) => ({ ...previous, ...next }) });
  }

  function setAgeFilter(filter: AgeFilter) {
    updateSearch({ filter, page: 1 });
  }

  function setGenderFilter(gender: GenderFilter) {
    updateSearch({ gender, page: 1 });
  }

  function clearFilters() {
    updateSearch({
      filter: "all",
      page: 1,
      ...(genderFilterEnabled ? { gender: "all" as const } : {}),
      ...(profileFiltersEnabled
        ? { q: "", neutered: "all" as const, suitability: "all" as const }
        : {}),
    });
  }

  function setPage(nextPage: number) {
    updateSearch({ page: nextPage });
  }

  const activeFilters: { id: string; label: string; clear: () => void }[] = [];
  if (ageFilter !== "all") {
    activeFilters.push({
      id: "age",
      label: AGE_OPTIONS.find(({ value }) => value === ageFilter)?.label ?? ageFilter,
      clear: () => setAgeFilter("all"),
    });
  }
  if (activeGender !== "all") {
    activeFilters.push({
      id: "gender",
      label: GENDER_OPTIONS.find(({ value }) => value === activeGender)?.label ?? activeGender,
      clear: () => setGenderFilter("all"),
    });
  }

  if (q)
    activeFilters.push({
      id: "q",
      label: "搜尋：" + q,
      clear: () => updateSearch({ q: "", page: 1 }),
    });
  if (neutered !== "all")
    activeFilters.push({
      id: "neutered",
      label: "絕育：" + { yes: "已絕育", no: "未絕育", unknown: "未有記錄" }[neutered],
      clear: () => updateSearch({ neutered: "all", page: 1 }),
    });
  if (suitability !== "all")
    activeFilters.push({
      id: "suitability",
      label:
        "領養經驗：" +
        { newbie: "適合新手", experienced: "適合有經驗人士", unknown: "未有記錄" }[suitability],
      clear: () => updateSearch({ suitability: "all", page: 1 }),
    });

  return (
    <div className="space-y-7">
      <div
        className={`public-filter-shell grid gap-5 p-5 ${genderFilterEnabled ? "md:grid-cols-2" : ""}`}
      >
        {profileFiltersEnabled ? (
          <>
            <form
              className="animal-profile-search md:col-span-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                updateSearch({
                  q: String(data.get("q") ?? "")
                    .trim()
                    .slice(0, 80),
                  page: 1,
                });
              }}
            >
              <label htmlFor="animal-name-search">名字或編號</label>
              <div className="flex gap-2">
                <input
                  key={q}
                  id="animal-name-search"
                  type="search"
                  name="q"
                  maxLength={80}
                  defaultValue={q}
                  placeholder="搜尋名字或編號"
                />
                <button type="submit" className="btn-primary min-h-11 px-5">
                  搜尋
                </button>
              </div>
            </form>
            <label className="animal-profile-select">
              絕育記錄
              <select
                value={neutered}
                onChange={(event) =>
                  updateSearch({ neutered: event.target.value as NeuteredFilter, page: 1 })
                }
              >
                <option value="all">全部絕育記錄</option>
                <option value="yes">已絕育</option>
                <option value="no">未絕育</option>
                <option value="unknown">未有記錄</option>
              </select>
            </label>
            <label className="animal-profile-select">
              領養經驗
              <select
                value={suitability}
                onChange={(event) =>
                  updateSearch({ suitability: event.target.value as SuitabilityFilter, page: 1 })
                }
              >
                <option value="all">全部領養經驗</option>
                <option value="newbie">適合新手</option>
                <option value="experienced">適合有經驗人士</option>
                <option value="unknown">未有記錄</option>
              </select>
            </label>
          </>
        ) : null}
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-bold text-[var(--color-text)]">年齡</legend>
          <div className="flex flex-wrap gap-2">
            {AGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAgeFilter(option.value)}
                aria-pressed={ageFilter === option.value}
                className={
                  ageFilter === option.value
                    ? "min-h-11 rounded-full bg-[var(--color-primary)] px-4 text-sm font-bold text-white"
                    : "min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {genderFilterEnabled ? (
          <fieldset className="min-w-0">
            <legend className="mb-3 text-sm font-bold text-[var(--color-text)]">性別</legend>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGenderFilter(option.value)}
                  aria-pressed={activeGender === option.value}
                  className={
                    activeGender === option.value
                      ? "min-h-11 rounded-full bg-[var(--color-primary)] px-4 text-sm font-bold text-white"
                      : "min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-text-muted)]" aria-live="polite">
          共 {total} 隻{animalLabel}
          {isRefreshing ? " · 正在更新結果" : ""}
        </span>
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto" aria-label="已套用篩選">
            {activeFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.clear}
                className="min-h-11 rounded-full bg-[var(--color-primary-highlight)] px-4 text-sm font-bold text-[var(--color-primary)]"
                aria-label={"移除篩選：" + item.label}
              >
                {item.label} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 px-3 text-sm font-bold text-[var(--color-primary)] underline underline-offset-4"
            >
              清除全部
            </button>
          </div>
        ) : null}
      </div>

      {animals.length === 0 ? (
        total > 0 ? (
          <ListingState
            title={"這一頁沒有更多" + animalLabel}
            description="你已到達結果最後一頁，可以返回第一頁繼續瀏覽。"
            action={
              <button
                type="button"
                onClick={() => setPage(1)}
                className="btn-primary min-h-11 px-5"
              >
                返回第一頁
              </button>
            }
          />
        ) : (
          <ListingState
            title={"暫時沒有符合條件的" + animalLabel}
            description={
              hasFilters
                ? "嘗試清除部分篩選，查看其他目前可申請領養的動物。"
                : "目前未有可公開申請領養的動物，請稍後再來查看。"
            }
            action={
              hasFilters ? (
                <button type="button" onClick={clearFilters} className="btn-primary min-h-11 px-5">
                  清除篩選
                </button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="animal-profile-grid">
          {animals.map((animal, index) => (
            <AnimalCard intent={intent} key={animal.id} animal={animal} priority={index === 0} />
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
            className="min-h-11 min-w-11 rounded-full border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-primary-highlight)]"
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
                  ? "min-h-11 min-w-11 rounded-full bg-[var(--color-primary)] px-3 text-sm font-bold text-white"
                  : "min-h-11 min-w-11 rounded-full border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-primary-highlight)]"
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
            className="min-h-11 min-w-11 rounded-full border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-primary-highlight)]"
          >
            →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
