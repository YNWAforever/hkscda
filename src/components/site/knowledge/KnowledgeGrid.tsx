import type { KnowledgePost } from "../../../lib/knowledge/types";

export function KnowledgeGrid({ posts }: { posts: KnowledgePost[] }) {
  if (posts.length === 0) {
    return <p className="rounded-lg border border-[var(--color-border)] p-6 text-[var(--color-text-muted)]">No knowledge resources are published yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Knowledge resources">
      {posts.map((post) => (
        <article key={post.id} className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">{post.topic}</p>
            <h2 className="text-xl font-bold text-[var(--color-panel)]">{post.title}</h2>
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">{post.shortIntro}</p>
            {post.sourceName ? <p className="text-xs font-semibold text-[var(--color-text-muted)]">Source: {post.sourceName}</p> : null}
          </div>
          <div className="mt-auto pt-4">
            <a
              href={post.destination.kind === "external" ? post.destination.url : post.destination.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex w-full justify-center"
            >
              {post.destination.kind === "document" ? "下載 PDF / Download PDF" : "了解更多 / Read More"}
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

export function KnowledgeGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite" aria-label="Loading knowledge resources">
      {[0, 1, 2].map((item) => (
        <div key={item} className="min-h-48 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-5">
          <span className="sr-only">Loading knowledge resources</span>
        </div>
      ))}
    </div>
  );
}
