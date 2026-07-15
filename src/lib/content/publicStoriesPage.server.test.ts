import { describe, expect, test } from "bun:test";
import type { ContentSummary, PublicStoryMapPoint } from "./types";
import { createPublicStoriesPageReader, loadPublicStoriesPage } from "./publicStoriesPage.server";

const item = { id: "story-1", title: "Lucky" } as ContentSummary;
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
