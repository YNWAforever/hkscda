import { describe, expect, test } from "bun:test";

import { createStoryDetailReader } from "./publicStoryDetail";
import type { ContentDetail } from "./types";

describe("story detail reader", () => {
  test("keeps the published story when optional related stories fail", async () => {
    const content = { id: "story-1", type: "rescue_story" } as ContentDetail;
    const read = createStoryDetailReader({
      getStory: async () => content,
      getRelated: async () => {
        throw new Error("Related-story request failed");
      },
    });

    expect(await read("story-1")).toEqual({ content, related: [] });
  });
});
