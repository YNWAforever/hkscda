import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { RescueMap } from "../components/site/stories/RescueMap";
import { StoryContentGrid } from "../components/site/stories/StoryContentGrid";
import { StoryWall } from "../components/site/stories/StoryWall";
import type { ContentSummary, PublicStoryMapPoint } from "../lib/content/types";

export const Route = createFileRoute("/stories")({
  head: () => ({
    meta: [
      { title: "救援故事牆 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "瀏覽香港拯救貓狗協會公開救援故事、區域救援地圖、活動、義賣與報告。",
      },
      { property: "og:title", content: "救援故事牆 · HKSCDA" },
      {
        property: "og:description",
        content: "追蹤貓狗救援、康復、領養與協會活動報告。",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/stories" }],
  }),
  component: StoriesPage,
});

function StoriesPage() {
  const [stories, setStories] = useState<ContentSummary[]>([]);
  const [points, setPoints] = useState<PublicStoryMapPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStories() {
      try {
        const response = await fetch("/api/stories");
        if (!response.ok) throw new Error("Failed to load stories");

        const body = (await response.json()) as {
          items: ContentSummary[];
          points: PublicStoryMapPoint[];
        };

        if (!mounted) return;
        setStories(body.items);
        setPoints(body.points);
      } catch {
        if (mounted) setLoadError("暫時未能載入故事，請稍後再試。");
      }
    }

    void loadStories();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main>
      {loadError ? (
        <div className="mx-auto max-w-3xl px-4 pt-8">
          <p className="rounded-md bg-[var(--color-surface-offset)] p-4 text-sm text-[var(--color-text-muted)]">
            {loadError}
          </p>
        </div>
      ) : null}
      <StoryWall stories={stories} />
      <RescueMap points={points} />
      <StoryContentGrid items={stories} />
    </main>
  );
}
