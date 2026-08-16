import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { AnimalDetail } from "../../components/site/AnimalDetail";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { Skeleton } from "../../components/ui/skeleton";

export const Route = createFileRoute("/animals/dog_/$id")({
  component: DogDetailPage,
});

function DogDetailPage() {
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

  if (isLoading) {
    return (
      <main className="container-wide grid gap-8 px-4 py-10 md:grid-cols-2 sm:px-6 lg:px-8">
        <Skeleton className="aspect-square w-full rounded-md" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入狗狗資料"
        description="系統未能取得這隻狗狗的資料，請稍後再試。"
        action={
          <Link to="/animals/dog" className="btn-primary min-h-11 px-5">
            返回狗狗列表
          </Link>
        }
      />
    );
  }

  if (!animal || animal.status !== "available") {
    return (
      <PublicStateShell
        title="這隻動物目前不在公開領養名單"
        description="公開名單會隨照護和領養進度更新，請查看其他正在等待家庭的狗狗。"
        action={
          <Link to="/animals/dog" className="btn-secondary min-h-11 px-5">
            查看狗狗列表
          </Link>
        }
      />
    );
  }

  return <AnimalDetail animal={animal} backHref="/animals/dog" backLabel="返回狗狗列表" />;
}
