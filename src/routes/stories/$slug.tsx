import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { PublicStateShell } from "../../components/site/PublicStateShell";
import { StoryDetail } from "../../components/site/stories/StoryDetail";
import { getPublicStory } from "../../lib/content/publicStory.functions";

const ORIGIN = "https://hkscda.vercel.app";

function absolutePublicUrl(value: string | null) {
  if (!value) return `${ORIGIN}/brand/hkscda-logo-primary.jpg`;
  try {
    return new URL(value, ORIGIN).toString();
  } catch {
    return `${ORIGIN}/brand/hkscda-logo-primary.jpg`;
  }
}

export const Route = createFileRoute("/stories/$slug")({
  loader: async ({ params }) => {
    const content = await getPublicStory({ data: { slug: params.slug } });
    if (!content) throw notFound();
    return content;
  },
  head: ({ loaderData, params }) => {
    const canonical = `${ORIGIN}/stories/${encodeURIComponent(params.slug)}`;
    const title = loaderData?.seoTitle ?? loaderData?.title ?? "救援故事 · HKSCDA";
    const pageTitle = title.includes("HKSCDA") ? title : `${title} · 香港拯救貓狗協會 HKSCDA`;
    const description =
      loaderData?.seoDescription ?? loaderData?.ogDescription ?? loaderData?.summary ?? "HKSCDA 公開救援故事。";
    const ogTitle = loaderData?.ogTitle ?? pageTitle;
    const image = absolutePublicUrl(loaderData?.coverImageUrl ?? null);
    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: description },
        { property: "og:title", content: ogTitle },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        ...(loaderData?.publishedAt
          ? [{ property: "article:published_time", content: loaderData.publishedAt }]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: ogTitle },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  pendingComponent: StoryDetailPending,
  errorComponent: StoryDetailError,
  component: StoryDetailPage,
});

function StoryDetailPage() {
  return <StoryDetail content={Route.useLoaderData()} />;
}

function StoryDetailPending() {
  return (
    <main className="container-reading px-4 py-12 sm:px-6" aria-busy="true" aria-live="polite">
      <p className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-5 text-sm text-[var(--color-text-muted)]">
        載入故事中…
      </p>
    </main>
  );
}

function StoryDetailError() {
  return (
    <PublicStateShell
      role="alert"
      title="暫時未能載入故事詳情"
      description="請稍後再試，或返回故事頁瀏覽其他已發布內容。"
      action={
        <Link to="/stories" className="btn-primary min-h-11 px-5">
          返回故事頁
        </Link>
      }
    />
  );
}
