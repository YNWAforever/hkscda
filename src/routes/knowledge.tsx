import { createFileRoute, useRouterState } from "@tanstack/react-router";

import { KnowledgeGrid, KnowledgeGridSkeleton } from "../components/site/knowledge/KnowledgeGrid";
import { getPublicKnowledgePage } from "../lib/knowledge/publicPage.functions";
import type { KnowledgePost } from "../lib/knowledge/types";

export const Route = createFileRoute("/knowledge")({
  loader: () => getPublicKnowledgePage(),
  head: () => ({
    meta: [
      { title: "知識資源 | HKSCDA" },
      {
        name: "description",
        content: "HKSCDA adoption, pet care, insurance, and post-adoption guide resources.",
      },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/knowledge" }],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const data = Route.useLoaderData();
  const isPending = useRouterState({ select: (state) => state.status === "pending" });
  return <KnowledgePageView posts={data.posts} isPending={isPending} />;
}

export function KnowledgePageView({
  posts,
  isPending,
}: {
  posts: KnowledgePost[];
  isPending: boolean;
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <section className="max-w-3xl space-y-3">
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--color-primary)]">
          Knowledge
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--color-panel)] lg:text-5xl">
          知識資源
        </h1>
        <p className="text-[var(--color-text-muted)]">
          Browse trusted care references, post-adoption PDFs, and practical pet-owner resources.
        </p>
      </section>
      {isPending ? <KnowledgeGridSkeleton /> : <KnowledgeGrid posts={posts} />}
    </main>
  );
}
