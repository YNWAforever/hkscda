import { createFileRoute, Link } from "@tanstack/react-router";

import { AnimalDetail } from "../../components/site/AnimalDetail";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { Skeleton } from "../../components/ui/skeleton";
import { getPublicAnimal } from "../../lib/animals/publicAnimal.functions";

const ORIGIN = "https://hkscda.vercel.app";

export const Route = createFileRoute("/animals/cat_/$id")({
  loader: ({ params }) => getPublicAnimal({ data: { id: params.id, type: "cat" } }),
  head: ({ loaderData, params }) => {
    const title = loaderData
      ? `${loaderData.name} · 待領養貓貓 · 香港拯救貓狗協會 HKSCDA`
      : "待領養貓貓 · 香港拯救貓狗協會 HKSCDA";
    const description =
      loaderData?.description ?? "查看香港拯救貓狗協會目前公開、正在等待家庭的貓貓資料。";
    const image = loaderData?.image_url ?? `${ORIGIN}/brand/hkscda-logo-primary.jpg`;
    const canonical = `${ORIGIN}/animals/cat/${encodeURIComponent(params.id)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  pendingComponent: CatDetailPending,
  errorComponent: CatDetailError,
  component: CatDetailPage,
});

function CatDetailPage() {
  const animal = Route.useLoaderData();

  if (!animal) {
    return (
      <PublicStateShell
        title="這隻動物目前不在公開領養名單"
        description="公開名單會隨照護和領養進度更新，請查看其他正在等待家庭的貓貓。"
        action={
          <Link to="/animals/cat" className="btn-secondary min-h-11 px-5">
            查看貓貓列表
          </Link>
        }
      />
    );
  }

  return <AnimalDetail animal={animal} backHref="/animals/cat" backLabel="返回貓貓列表" />;
}

function CatDetailPending() {
  return (
    <main className="container-wide grid gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
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

function CatDetailError() {
  return (
    <PublicStateShell
      role="alert"
      title="暫時未能載入貓貓資料"
      description="系統未能取得這隻貓貓的資料，請稍後再試。"
      action={
        <Link to="/animals/cat" className="btn-primary min-h-11 px-5">
          返回貓貓列表
        </Link>
      }
    />
  );
}
