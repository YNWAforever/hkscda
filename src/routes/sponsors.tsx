import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { AnimalGrid } from "../components/site/AnimalGrid";
import { BrandLogo } from "../components/site/BrandLogo";
import { Skeleton } from "../components/ui/skeleton";
import type { AgeFilter } from "../types/animal";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/sponsors")({
  validateSearch: searchSchema,
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/sponsors" }],
  }),
  component: SponsorsPage,
});

const paymentMethods = [
  { label: "FPS 轉數快", value: "9864 1089" },
  { label: "銀行轉帳", value: "匯豐銀行 012-345-678901" },
  { label: "PayMe", value: "@hkscda" },
  { label: "PayPal", value: "paypal@hkscda.com" },
  { label: "Give.asia", value: "give.asia/hkscda" },
];

function SponsorsPage() {
  const { page, filter } = Route.useSearch();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["animals", "sponsor", page, filter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("animals")
        .select("*", { count: "exact" })
        .eq("type", "sponsor")
        .eq("status", "available")
        .range(from, to);
      if (error) throw error;
      return { animals: data ?? [], total: count ?? 0 };
    },
  });

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <BrandLogo className="mb-4 h-16 w-16" eager />
      <h1 className="font-display text-3xl font-bold">{"\u52a9\u990a"}</h1>

      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6 shadow-soft">
        <h2 className="font-semibold mb-1">助養付款方式</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">每月助養 HK$100</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map((m) => (
            <div
              key={m.label}
              className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="text-xs font-semibold text-[var(--color-text-muted)]">{m.label}</div>
              <div className="text-sm">{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {isError ? (
        <p className="text-center py-12 text-[var(--color-text-muted)]">
          載入助養動物時發生錯誤，請稍後再試。
        </p>
      ) : isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-md border border-[var(--color-border)]">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-8 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AnimalGrid
          animals={data?.animals ?? []}
          total={data?.total ?? 0}
          page={page}
          ageFilter={filter as AgeFilter}
          pageSize={PAGE_SIZE}
          animalLabel="助養動物"
        />
      )}
    </main>
  );
}
