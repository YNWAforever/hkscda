import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { AnimalGrid } from "../../components/site/AnimalGrid";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { Skeleton } from "../../components/ui/skeleton";
import { getPublicAnimalListing } from "../../lib/animals/publicListing.functions";
import type { AgeFilter, GenderFilter } from "../../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
  gender: z.enum(["all", "female", "male"]).catch("all"),
});

export const Route = createFileRoute("/animals/cat")({
  validateSearch: searchSchema,
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/animals/cat" }],
  }),
  component: CatListingPage,
});

function CatListingPage() {
  const { page, filter, gender } = Route.useSearch();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["animals", "cat", page, filter, gender],
    queryFn: () =>
      getPublicAnimalListing({
        data: {
          type: "cat",
          page,
          pageSize: PAGE_SIZE,
          ageFilter: filter,
          genderFilter: gender,
        },
      }),
    placeholderData: (previousData) => previousData,
  });

  if (isLoading) {
    return (
      <main className="container-wide px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">待領養貓貓</h1>
        <p className="mt-3 text-[var(--color-text-muted)]">正在載入目前可申請領養的貓貓。</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-[var(--color-border)]"
            >
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-11 w-full" />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入貓貓資料"
        description="系統未能取得目前的領養資料，請稍後再試。"
        action={
          <button type="button" onClick={() => refetch()} className="btn-primary min-h-11 px-5">
            再試一次
          </button>
        }
      />
    );
  }

  return (
    <main className="container-wide px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-bold text-[var(--color-primary)]">領養動物</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-text)]">待領養貓貓</h1>
          <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
            查看目前可申請領養的貓貓，按年齡及性別縮窄結果，再了解牠們的需要。
          </p>
        </div>
        <nav aria-label="選擇動物種類" className="flex flex-wrap gap-2">
          <a
            href="/animals/cat"
            aria-current="page"
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-white"
          >
            貓貓
          </a>
          <a
            href="/animals/dog"
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            狗狗
          </a>
        </nav>
      </div>
      <div className="mt-8">
        <AnimalGrid
          animals={data?.animals ?? []}
          total={data?.total ?? 0}
          page={data?.page ?? page}
          ageFilter={filter as AgeFilter}
          genderFilter={gender as GenderFilter}
          pageSize={PAGE_SIZE}
          animalLabel="貓"
          isRefreshing={isFetching}
        />
      </div>
    </main>
  );
}
