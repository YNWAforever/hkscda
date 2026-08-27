import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../lib/routing/resilientLoader";
import { PublicStateShell } from "../components/site/PublicStateShell";

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
  links: [{ rel: "canonical", href: publicUrl("/stories") }],
});

export const Route = createFileRoute("/stories")({
  loader: resilientPublicLoader(loadStories),
  errorComponent: StoriesLoadError,
  head: storiesHead,
  component: StoriesPage,
});

function StoriesPage() {
  const result = Route.useLoaderData();
  if (result.status === "error") return <StoriesLoadError />;
  return <StoriesPageContent data={result.data} />;
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
  // A page still needs exactly one h1 when it degrades. The previous panel was a
  // bare paragraph, so an unavailable story library rendered a headingless
  // document - which the brand verifier reports and screen readers land badly on.
  return (
    <main>
      <PublicStateShell
        role="alert"
        title="暫時未能載入故事"
        description="系統未能取得救援故事，請稍後再試。"
        action={
          <a href="/stories" className="btn-primary min-h-11 px-5">
            重新載入
          </a>
        }
      />
    </main>
  );
}
