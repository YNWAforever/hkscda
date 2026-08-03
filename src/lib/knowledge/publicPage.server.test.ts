import { describe, expect, test } from "bun:test";

import { createPublicKnowledgePageReader } from "./publicPage.server";

const published = {
  id: "post-1",
  title: "HK01",
  topic: "pet-care",
  shortIntro: "Care",
  sourceName: "HK01",
  destination: { kind: "external" as const, url: "https://example.test/hk01" },
  isPublished: true,
  sortOrder: 0,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

describe("public knowledge page reader", () => {
  test("loads only published posts and keeps stable ordering", async () => {
    const read = createPublicKnowledgePageReader({
      repository: {
        async listPublished() {
          return [
            { ...published, sortOrder: 2 },
            { ...published, id: "post-2", sortOrder: 1, title: "Guide" },
          ];
        },
      },
    });
    expect((await read()).posts.map((post) => post.id)).toEqual(["post-2", "post-1"]);
  });
});
