import { describe, expect, test } from "bun:test";

import { adminKnowledgeQuerySchema, knowledgePostInputSchema } from "./schemas";

describe("knowledge schemas", () => {
  test("requires exactly one safe destination", () => {
    const base = {
      title: "Post adoption guide",
      topic: "adoption",
      shortIntro: "How to settle a newly adopted cat.",
      sourceName: "HKSCDA",
      isPublished: true,
      sortOrder: 2,
    };

    expect(knowledgePostInputSchema.parse({ ...base, externalUrl: "https://example.test/guide" })).toMatchObject({ destination: { kind: "external", url: "https://example.test/guide" } });
    expect(knowledgePostInputSchema.parse({ ...base, documentAssetId: "11111111-2222-4333-8444-555555555555" })).toMatchObject({ destination: { kind: "document", assetId: "11111111-2222-4333-8444-555555555555" } });
    expect(() => knowledgePostInputSchema.parse({ ...base, externalUrl: "http://example.test/guide" })).toThrow();
    expect(() => knowledgePostInputSchema.parse({ ...base })).toThrow();
    expect(() => knowledgePostInputSchema.parse({ ...base, externalUrl: "https://example.test/guide", documentAssetId: "11111111-2222-4333-8444-555555555555" })).toThrow();
  });

  test("bounds admin pages and normalizes safe search", () => {
    expect(adminKnowledgeQuerySchema.parse({ q: "  cats_%  ", page: "0", pageSize: "500", status: "published" })).toEqual({
      q: "cats_%",
      page: 1,
      pageSize: 50,
      status: "published",
    });
  });
});
