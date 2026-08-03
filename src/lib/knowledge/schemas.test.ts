import { describe, expect, test } from "bun:test";

import { adminKnowledgeQuerySchema, knowledgePostInputSchema } from "./schemas";

describe("knowledge schemas", () => {
  const zhId = "11111111-2222-4333-8444-555555555555";
  const enId = "66666666-7777-4888-8999-000000000000";

  test("requires exactly one safe destination", () => {
    const base = {
      title: "Post adoption guide",
      topic: "adoption",
      shortIntro: "How to settle a newly adopted cat.",
      sourceName: "HKSCDA",
      isPublished: true,
      sortOrder: 2,
    };

    expect(
      knowledgePostInputSchema.parse({ ...base, externalUrl: "https://example.test/guide" }),
    ).toMatchObject({ destination: { kind: "external", url: "https://example.test/guide" } });
    expect(
      knowledgePostInputSchema.parse({
        ...base,
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toMatchObject({
      destination: { kind: "document", assetId: "11111111-2222-4333-8444-555555555555" },
    });
    expect(() =>
      knowledgePostInputSchema.parse({ ...base, externalUrl: "http://example.test/guide" }),
    ).toThrow();
    expect(() => knowledgePostInputSchema.parse({ ...base })).toThrow();
    expect(() =>
      knowledgePostInputSchema.parse({
        ...base,
        externalUrl: "https://example.test/guide",
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toThrow();
  });

  test("accepts exactly one bilingual document pair", () => {
    const result = knowledgePostInputSchema.parse({
      title: "領養指南",
      topic: "領養",
      shortIntro: "領養指南內容簡介。",
      sourceName: "HKSCDA",
      zhHkDocumentAssetId: zhId,
      enDocumentAssetId: enId,
      isPublished: false,
      sortOrder: 0,
    });

    expect(result.destination).toEqual({
      kind: "document_pair",
      zhHkAssetId: zhId,
      enAssetId: enId,
    });
  });

  test("rejects a half-populated document pair", () => {
    expect(() =>
      knowledgePostInputSchema.parse({
        title: "Guide",
        topic: "Adoption",
        shortIntro: "Guide",
        zhHkDocumentAssetId: zhId,
        isPublished: false,
        sortOrder: 0,
      }),
    ).toThrow("Choose exactly one knowledge destination");
  });

  test("prefers a nested bilingual destination over stale raw pair fields", () => {
    const result = knowledgePostInputSchema.parse({
      title: "領養指南",
      topic: "領養",
      shortIntro: "領養指南內容簡介。",
      sourceName: "HKSCDA",
      destination: {
        kind: "document_pair",
        zhHkAssetId: zhId,
        enAssetId: enId,
      },
      zhHkDocumentAssetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      enDocumentAssetId: "ffffffff-1111-4222-8333-444444444444",
      isPublished: false,
      sortOrder: 0,
    });

    expect(result.destination).toEqual({
      kind: "document_pair",
      zhHkAssetId: zhId,
      enAssetId: enId,
    });
  });

  test("bounds admin pages and normalizes safe search", () => {
    expect(
      adminKnowledgeQuerySchema.parse({
        q: "  cats_%  ",
        page: "0",
        pageSize: "500",
        status: "published",
      }),
    ).toEqual({
      q: "cats_%",
      page: 1,
      pageSize: 50,
      status: "published",
    });
  });
});
