import { createFileRoute, Link } from "@tanstack/react-router";
import { PUBLIC_SITE_ORIGIN } from "@/lib/publicOrigin";

import { AnimalDetail } from "../components/site/AnimalDetail";
import { PublicStateShell } from "../components/site/PublicStateShell";
import { Skeleton } from "../components/ui/skeleton";
import { getPublicAnimal } from "../lib/animals/publicAnimal.functions";

const ORIGIN = PUBLIC_SITE_ORIGIN;

export const Route = createFileRoute("/sponsors_/$id")({
  loader: ({ params }) => getPublicAnimal({ data: { id: params.id } }),
  head: ({ loaderData, params }) => {
    const title = loaderData
      ? `助養 ${loaderData.name} · 香港拯救貓狗協會 HKSCDA`
      : "動物助養 · 香港拯救貓狗協會 HKSCDA";
    const description =
      loaderData?.description ?? "了解香港拯救貓狗協會的動物助養計劃與目前公開助養資料。";
    const image = loaderData?.image_url ?? `${ORIGIN}/brand/hkscda-logo-primary.jpg`;
    const canonical = `${ORIGIN}/sponsors/${encodeURIComponent(params.id)}`;
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
  pendingComponent: SponsorDetailPending,
  errorComponent: SponsorDetailError,
  component: SponsorDetailPage,
});

function SponsorDetailPage() {
  const animal = Route.useLoaderData();

  if (!animal) {
    return (
      <PublicStateShell
        title="此動物目前不在公開助養名單"
        description="助養名單會隨照護安排更新，請返回助養區查看目前可選擇的動物。"
        action={
          <Link to="/sponsors" className="btn-secondary min-h-11 px-5">
            返回助養區
          </Link>
        }
      />
    );
  }

  return <AnimalDetail animal={animal} backHref="/sponsors" backLabel="返回助養區" />;
}

function SponsorDetailPending() {
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

function SponsorDetailError() {
  return (
    <PublicStateShell
      role="alert"
      title="暫時未能載入助養資料"
      description="系統未能取得這隻動物的公開資料，請稍後再試。"
      action={
        <Link to="/sponsors" className="btn-primary min-h-11 px-5">
          返回助養區
        </Link>
      }
    />
  );
}
