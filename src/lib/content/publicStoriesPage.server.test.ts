import { describe, expect, test } from "bun:test";
import type { ContentSummary, PublicStoryMapPoint } from "./types";
import { createPublicStoriesPageReader, loadPublicStoriesPage } from "./publicStoriesPage.server";

const item = { id: "story-1", title: "Lucky", storyProfile: null } as ContentSummary;
const point = { id: "story-1", title: "Lucky" } as PublicStoryMapPoint;

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
    expect(calls).toEqual([{}]);
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
});
