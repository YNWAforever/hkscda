import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { StoryDetail } from "../../components/site/stories/StoryDetail";
import type { ContentDetail } from "../../lib/content/types";

export const Route = createFileRoute("/stories/$slug")({
  component: StoryDetailPage,
});

function StoryDetailPage() {
  const { slug } = Route.useParams();
  const [content, setContent] = useState<ContentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStory() {
      setLoadError(null);
      setContent(null);
      try {
        const response = await fetch(`/api/stories/${encodeURIComponent(slug)}`);
        const body = (await response.json().catch(() => ({}))) as {
          content?: ContentDetail;
          error?: string;
        };
        if (!response.ok || !body.content) {
          throw new Error(body.error ?? "Failed to load story");
        }
        if (mounted) setContent(body.content);
      } catch {
        if (mounted) setLoadError("暫時未能載入故事詳情，請稍後再試。");
      }
    }

    void loadStory();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="rounded-md bg-[var(--color-surface-offset)] p-5 text-sm text-[var(--color-text-muted)]">
          {loadError}
        </p>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="rounded-md bg-[var(--color-surface-offset)] p-5 text-sm text-[var(--color-text-muted)]">
          載入故事中...
        </p>
      </main>
    );
  }

  return <StoryDetail content={content} />;
}
