import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../lib/routing/resilientLoader";
import { PublicStateShell } from "../components/site/PublicStateShell";
import { PublicPageFrame } from "../components/site/PublicPageFrame";

import { KnowledgeGrid, KnowledgeGridSkeleton } from "../components/site/knowledge/KnowledgeGrid";
import { getPublicKnowledgePage } from "../lib/knowledge/publicPage.functions";
import type { KnowledgePost } from "../lib/knowledge/types";

export const Route = createFileRoute("/knowledge")({
  loader: resilientPublicLoader(() => getPublicKnowledgePage()),
  head: () => ({
    meta: [
      { title: "知識資源 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "領養前後的照顧指南、寵物保險與實用資源，由香港拯救貓狗協會整理，方便新舊主人查閱。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/knowledge") }],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const result = Route.useLoaderData();
  const isPending = useRouterState({ select: (state) => state.status === "pending" });

  if (result.status === "error") {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入飼養知識"
        description="系統未能取得最新的知識內容，請稍後再試。"
        action={
          <a href="/knowledge" className="btn-primary min-h-11 px-5">
            重新載入
          </a>
        }
      />
    );
  }

  return <KnowledgePageView posts={result.data.posts} isPending={isPending} />;
}

export function KnowledgePageView({
  posts,
  isPending,
}: {
  posts: KnowledgePost[];
  isPending: boolean;
}) {
  return (
    <PublicPageFrame
      eyebrow="故事與資源"
      title="知識資源"
      description="領養前後的照顧指南、寵物保險與實用資源，方便新舊主人查閱。"
    >
      <section className="section">
        <div className="public-container">
          {isPending ? <KnowledgeGridSkeleton /> : <KnowledgeGrid posts={posts} />}
        </div>
      </section>
    </PublicPageFrame>
  );
}
