import { describe, expect, test } from "bun:test";
import type { ContentSummary, PublicStoryMapPoint } from "./types";
import { publicContentSearchSchema } from "./schemas";
import {
  createFeaturedStoryReader,
  createPublicStoriesPageReader,
  createRelatedStoriesReader,
  loadPublicStoriesPage,
  loadRelatedStories,
} from "./publicStoriesPage.server";

const item = {
  id: "story-1",
  title: "Lucky",
  status: "published",
  storyProfile: null,
} as ContentSummary;
const point = { id: "story-1", title: "Lucky" } as PublicStoryMapPoint;

function story(id: string, overrides: Partial<ContentSummary> = {}): ContentSummary {
  return {
    id,
    slug: id,
    type: "rescue_story",
    title: `故事 ${id}`,
    subtitle: null,
    summary: "摘要",
    coverMediaId: null,
    coverImageUrl: null,
    status: "published",
    publishedAt: null,
    ctaLabel: null,
    ctaUrl: null,
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("public stories page reader", () => {
  test("delegates once and preserves the payload", async () => {
    const calls: unknown[] = [];
    const expected = { items: [item], total: 1, points: [point] };
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage(input) {
        calls.push(input);
        return expected;
      },
    });
    expect(await read()).toEqual(expected);
    expect(calls).toEqual([{ page: 1, pageSize: 50 }]);
  });

  test("includes published content beyond the first database page", async () => {
    const allItems = Array.from({ length: 51 }, (_, index) => story(`story-${index + 1}`));
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage(input) {
        const page = input.page ?? 1;
        const pageSize = input.pageSize ?? 25;
        const from = (page - 1) * pageSize;
        return {
          items: allItems.slice(from, from + pageSize),
          total: allItems.length,
          points: [],
        };
      },
    });

    const result = await read();
    expect(result.items.map((entry) => entry.id)).toEqual(allItems.map((entry) => entry.id));
    expect(result.total).toBe(51);
  });
  test("omits private rescue locations at the server serialization boundary", async () => {
    const privateItem = {
      ...item,
      storyProfile: {
        contentItemId: "story-1",
        animalType: "dog",
        publicStatus: "medical_care",
        rescueRegion: "Kowloon",
        rescueDate: null,
        showOnMap: true,
        publicMapLabel: "Kowloon rescue",
        publicLat: 22.31,
        publicLng: 114.17,
        internalAddress: "PRIVATE EXACT ADDRESS",
        internalLocationNotes: "PRIVATE FOSTER NOTES",
        isFeatured: true,
      },
    } satisfies ContentSummary;
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage() {
        return { items: [privateItem], total: 1, points: [point] };
      },
    });

    const result = await read();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("PRIVATE EXACT ADDRESS");
    expect(serialized).not.toContain("PRIVATE FOSTER NOTES");
    expect(result.items[0]?.storyProfile).not.toHaveProperty("internalAddress");
    expect(result.items[0]?.storyProfile).not.toHaveProperty("internalLocationNotes");
    expect(privateItem.storyProfile.internalAddress).toBe("PRIVATE EXACT ADDRESS");
  });

  test("replaces provider details with a safe error", async () => {
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage() {
        throw new Error("database host and secret detail");
      },
    });
    const error = await read().catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Could not load stories");
  });

  test("sanitizes dependency creation errors", async () => {
    const error = await loadPublicStoriesPage(() => {
      throw new Error("Supabase URL and service role detail");
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Could not load stories");
  });
  test("drops leaked drafts and their map points at serialization", async () => {
    const leakedDraft = { ...item, status: "draft" as const };
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage() {
        return { items: [leakedDraft], total: 1, points: [point] };
      },
    });

    expect(await read()).toEqual({ items: [], total: 0, points: [] });
  });
});

describe("featured public story reader", () => {
  test("preserves a featured-only query through validation", () => {
    expect(publicContentSearchSchema.parse({ isFeatured: true })).toMatchObject({
      isFeatured: true,
    });
  });

  test("does not display an unfeatured row from an older database function", async () => {
    const read = createFeaturedStoryReader({
      listPublicStoriesPage: async () => ({ items: [story("recent")], total: 1, points: [] }),
    });
    expect(await read()).toBeNull();
  });

  test("requests one featured rescue story instead of every story page", async () => {
    const calls: unknown[] = [];
    const read = createFeaturedStoryReader({
      async listPublicStoriesPage(input: Record<string, unknown>) {
        calls.push(input);
        return {
          items:
            input.isFeatured === true
              ? [
                  story("featured", {
                    storyProfile: { isFeatured: true } as ContentSummary["storyProfile"],
                  }),
                ]
              : [story("recent")],
          total: 1,
          points: [],
        };
      },
    });

    expect((await read())?.id).toBe("featured");
    expect(calls).toEqual([{ type: "rescue_story", isFeatured: true, page: 1, pageSize: 1 }]);
  });
});
describe("related stories reader", () => {
  test("loadRelatedStories prefers the same animal type, excludes the current story, and caps at 3", async () => {
    const reader = createRelatedStoriesReader({
      getPublicContentBySlug: async () => ({
        id: "c1",
        type: "rescue_story",
        storyProfile: { animalType: "cat", rescueRegion: "Sha Tin" },
      }),
      listPublicStoriesPage: async (input: { animalType?: string; rescueRegion?: string }) => ({
        items:
          input.animalType === "cat"
            ? [story("c1"), story("c2"), story("c3"), story("c4")]
            : [story("c5")],
        total: 4,
        points: [],
      }),
    });
    const related = await reader("current-slug");
    expect(related.map((s) => s.id)).toEqual(["c2", "c3", "c4"]);
    expect(related).toHaveLength(3);
  });

  test("loadRelatedStories falls back to the same rescue region and still excludes the current id", async () => {
    const reader = createRelatedStoriesReader({
      getPublicContentBySlug: async () => ({
        id: "c1",
        type: "rescue_story",
        storyProfile: { animalType: "cat", rescueRegion: "Sha Tin" },
      }),
      listPublicStoriesPage: async (input: { animalType?: string; rescueRegion?: string }) => ({
        items:
          input.animalType === "cat"
            ? [story("c1")]
            : [story("c1"), story("c5"), story("c6"), story("c7")],
        total: 4,
        points: [],
      }),
    });
    const related = await reader("current-slug");
    expect(related.map((s) => s.id)).toEqual(["c5", "c6", "c7"]);
  });

  test("loadRelatedStories returns [] for a non-rescue story or missing content", async () => {
    const reader = createRelatedStoriesReader({
      getPublicContentBySlug: async () => ({ id: "a1", type: "report", storyProfile: null }),
      listPublicStoriesPage: async () => ({ items: [story("c2")], total: 1, points: [] }),
    });
    expect(await reader("other")).toEqual([]);

    const missing = createRelatedStoriesReader({
      getPublicContentBySlug: async () => null,
      listPublicStoriesPage: async () => ({ items: [story("c2")], total: 1, points: [] }),
    });
    expect(await missing("missing")).toEqual([]);
  });

  test("loadRelatedStories swallows read failures to []", async () => {
    const result = await loadRelatedStories("slug", () => {
      throw new Error("service role secret");
    });
    expect(result).toEqual([]);
  });
});
