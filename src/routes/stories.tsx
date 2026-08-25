import { createFileRoute } from "@tanstack/react-router";

import { RescueMap } from "../components/site/stories/RescueMap";
import { StoryContentGrid } from "../components/site/stories/StoryContentGrid";
import { StoryWall } from "../components/site/stories/StoryWall";
import { getPublicStoriesPage } from "../lib/content/publicStoriesPage.functions";
import type { PublicStoriesPageData } from "../lib/content/publicStoriesPage.server";

type StoriesLoader = () => Promise<PublicStoriesPageData>;

export function createStoriesLoader(load: StoriesLoader) {
  return () => load();
}

const loadStories = createStoriesLoader(() => getPublicStoriesPage());

const storiesHead = () => ({
  meta: [
    { title: "救援個案 · 香港拯救貓狗協會 HKSCDA" },
    {
      name: "description",
      content: "瀏覽香港拯救貓狗協會公開救援個案、區域救援地圖、活動、義賣與報告。",
    },
    { property: "og:title", content: "救援個案 · HKSCDA" },
    {
      property: "og:description",
      content: "追蹤貓狗救援、康復、領養與協會活動報告。",
    },
    { property: "og:type", content: "website" },
  ],
  links: [{ rel: "canonical", href: "https://hkscda.vercel.app/stories" }],
});

export const Route = createFileRoute("/stories")({
  loader: loadStories,
  errorComponent: StoriesLoadError,
  head: storiesHead,
  component: StoriesPage,
});

function StoriesPage() {
  return <StoriesPageContent data={Route.useLoaderData()} />;
}

export function StoriesPageContent({ data }: { data: PublicStoriesPageData }) {
  return (
    <main>
      <StoryWall stories={data.items} />
      <RescueMap points={data.points} />
      <StoryContentGrid items={data.items} />
    </main>
  );
}

export function StoriesLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p
        role="alert"
        className="rounded-md bg-[var(--color-surface-offset)] p-4 text-sm text-[var(--color-text-muted)]"
      >
        暫時未能載入故事，請稍後再試。
      </p>
    </main>
  );
}
