import { describe, expect, test } from "bun:test";
import type { ContentSummary, PublicStoryMapPoint } from "./types";
import { createPublicStoriesPageReader } from "./publicStoriesPage.server";

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
    expect(read()).rejects.toThrow("Could not load stories");
    expect(read()).rejects.not.toThrow("database host and secret detail");
  });
});
