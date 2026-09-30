import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { StoryContentGrid } from "../../src/components/site/stories/StoryContentGrid";
import { AnimalCard } from "../../src/components/site/AnimalCard";
import { ShortlistProvider } from "../../src/components/site/ShortlistProvider";
import type { PublicStorySummary } from "../../src/lib/content/publicStoriesPage.types";
import type { Animal } from "../../src/types/animal";
import "../../src/styles.css";
const event: PublicStorySummary = {
  id: "event-1",
  slug: "synthetic-ended",
  type: "event",
  title: "合成已結束活動",
  subtitle: null,
  summary: "只供隔離驗收",
  coverMediaId: null,
  coverImageUrl: null,
  status: "published",
  publishedAt: "2020-01-01T00:00:00Z",
  effectiveUntil: "2020-02-01T00:00:00Z",
  ctaLabel: "過期報名連結",
  ctaUrl: "https://example.invalid/register",
  storyProfile: null,
  latestPublicUpdate: null,
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2020-01-01T00:00:00Z",
};
const animal: Animal = {
  id: "synthetic-cat",
  type: "cat",
  name: "合成助養個案",
  name_en: null,
  gender: "female",
  age: "2歲",
  age_en: null,
  description: "只供隔離驗收",
  description_en: null,
  notes: "private-internal-marker",
  notes_en: null,
  status: "available",
  image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  public_profile: {
    code: "C017",
    birthday: null,
    neutered: null,
    suitability: null,
    personality: null,
    health: "合成照顧需要",
    story: null,
    recordDate: null,
    sponsorUse: "合成助養用途",
    recentProgress: "合成復原近況",
  },
};
function Fixture() {
  return (
    <main className="public-container py-8">
      <h1>隔離內容驗收</h1>
      <StoryContentGrid
        items={[
          event,
          { ...event, id: "demo", title: "不可公開示範", contentClass: "demo" },
          { ...event, id: "draft", title: "不可公開草稿", status: "draft" },
          {
            ...event,
            id: "future",
            title: "不可公開未來",
            effectiveFrom: "2999-01-01T00:00:00Z",
            effectiveUntil: null,
          },
        ]}
      />
      <div className="max-w-md">
        <ShortlistProvider>
          <AnimalCard animal={animal} intent="sponsorship" />
        </ShortlistProvider>
      </div>
    </main>
  );
}
const rootRoute = createRootRoute({ component: Fixture });
const router = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
