import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { AnimalDetail } from "../components/site/AnimalDetail";
import { Skeleton } from "../components/ui/skeleton";

export const Route = createFileRoute("/sponsors_/$id")({
  component: SponsorDetailPage,
});

function SponsorDetailPage() {
  const { id } = Route.useParams();

  const {
    data: animal,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-4 w-24" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square w-full rounded-md" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        </div>
      </main>
    );

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-12 text-center">
        <p className="text-xl text-[var(--color-text-muted)]">載入時發生問題，請稍後再試</p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← 返回助養區
        </Link>
      </main>
    );
  }

  if (!animal || animal.status !== "available") {
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-12 text-center">
        <p className="text-xl text-[var(--color-text-muted)]">此動物已完成助養</p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← 返回助養區
        </Link>
      </main>
    );
  }

  return <AnimalDetail animal={animal} backHref="/sponsors" backLabel="返回助養區" />;
}
