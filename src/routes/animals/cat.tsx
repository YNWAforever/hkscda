import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AnimalGrid } from "../../components/site/AnimalGrid";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { Skeleton } from "../../components/ui/skeleton";
import type { AgeFilter } from "../../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/animals/cat")({
  validateSearch: searchSchema,
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/animals/cat" }],
  }),
  component: CatListingPage,
});

function CatListingPage() {
  const { page, filter } = Route.useSearch();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["animals", "cat", page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("animals")
        .select("*", { count: "exact" })
        .eq("type", "cat")
        .eq("status", "available")
        .range(from, to);
      if (error) throw error;
      return { animals: data ?? [], total: count ?? 0 };
    },
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
              className="overflow-hidden rounded-md border border-[var(--color-border)]"
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
          <a href="/animals/cat" className="btn-primary min-h-11 px-5">
            重新整理
          </a>
        }
      />
    );
  }

  return (
    <main className="container-wide px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[var(--color-text)]">待領養貓貓</h1>
      <p className="mt-3 text-[var(--color-text-muted)]">
        查看目前可申請領養的貓貓，了解牠們的需要。
      </p>
      <div className="mt-8">
        <AnimalGrid
          animals={data?.animals ?? []}
          total={data?.total ?? 0}
          page={page}
          ageFilter={filter as AgeFilter}
          pageSize={PAGE_SIZE}
          animalLabel="貓"
        />
      </div>
    </main>
  );
}
