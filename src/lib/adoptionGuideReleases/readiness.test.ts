import { describe, expect, test } from "bun:test";

import type { DocumentAsset } from "../documents/types";
import type { AdoptionGuideRelease } from "./types";
import { evaluateAdoptionGuideReadiness, slotKeyForSpecies } from "./readiness";

const release: AdoptionGuideRelease = {
  id: "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae",
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b",
  enAssetId: "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae",
  knowledgePostId: null,
  knowledgeTitle: "Caring for your cat after adoption",
  knowledgeTopic: "Post adoption care",
  knowledgeShortIntro: "A practical guide for the first weeks at home.",
  knowledgeSourceName: null,
  sortOrder: 0,
  state: "draft",
  version: 1,
  createdBy: "7d3ec361-f0a0-4300-8808-c34ed4e86542",
  updatedBy: "7d3ec361-f0a0-4300-8808-c34ed4e86542",
  submittedBy: null,
  submittedAt: null,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const zhAsset: DocumentAsset = {
  id: "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b",
  kind: "adoption_guide",
  title: "Cat adoption guide",
  language: "zh-HK",
  bucketName: "site-documents",
  objectPath: "adoption-guides/cat-zh.pdf",
  fileUrl: "https://example.com/cat-zh.pdf",
  mimeType: "application/pdf",
  byteSize: 10,
  checksumSha256: null,
  isPublished: false,
  sortOrder: 0,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const enAsset: DocumentAsset = {
  ...zhAsset,
  id: "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae",
  language: "en",
  objectPath: "adoption-guides/cat-en.pdf",
  fileUrl: "https://example.com/cat-en.pdf",
};

describe("adoption guide release readiness", () => {
  test("blocks readiness when the English asset is missing", () => {
    const readiness = evaluateAdoptionGuideReadiness(release, {
      zhHk: { asset: zhAsset, objectVerified: true },
      en: null,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "enAssetId",
      code: "english_asset_required",
      message: "English PDF is required before submission.",
    });
  });

  test("uses stable species slot keys", () => {
    expect(slotKeyForSpecies("cat")).toBe("post_adoption_guide_cat");
    expect(slotKeyForSpecies("dog")).toBe("post_adoption_guide_dog");
    expect(slotKeyForSpecies("general")).toBe("post_adoption_guide_general");
  });

  test("does not treat a public URL as storage verification", () => {
    const readiness = evaluateAdoptionGuideReadiness(release, {
      zhHk: { asset: zhAsset, objectVerified: false },
      en: { asset: enAsset, objectVerified: true },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "assets",
      code: "chinese_asset_unverified",
      message: "Chinese (Hong Kong) PDF must be verified in Storage before submission.",
    });
  });

  test("requires release asset IDs even when verified assets are supplied", () => {
    const readiness = evaluateAdoptionGuideReadiness(
      { ...release, zhHkAssetId: null, enAssetId: null },
      {
        zhHk: { asset: zhAsset, objectVerified: true },
        en: { asset: enAsset, objectVerified: true },
      },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toEqual([
      {
        field: "zhHkAssetId",
        code: "chinese_asset_required",
        message: "Chinese (Hong Kong) PDF is required before submission.",
      },
      {
        field: "enAssetId",
        code: "english_asset_required",
        message: "English PDF is required before submission.",
      },
    ]);
  });

  test("blocks readiness when the Chinese asset does not match the release ID", () => {
    const readiness = evaluateAdoptionGuideReadiness(
      { ...release, zhHkAssetId: "21e42e2a-5d0e-4778-97ba-4e2c3ac3b594" },
      {
        zhHk: { asset: zhAsset, objectVerified: true },
        en: { asset: enAsset, objectVerified: true },
      },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "zhHkAssetId",
      code: "chinese_asset_id_mismatch",
      message: "Chinese (Hong Kong) PDF does not match the release asset.",
    });
  });

  test("blocks readiness when the English asset does not match the release ID", () => {
    const readiness = evaluateAdoptionGuideReadiness(
      { ...release, enAssetId: "21e42e2a-5d0e-4778-97ba-4e2c3ac3b594" },
      {
        zhHk: { asset: zhAsset, objectVerified: true },
        en: { asset: enAsset, objectVerified: true },
      },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "enAssetId",
      code: "english_asset_id_mismatch",
      message: "English PDF does not match the release asset.",
    });
  });

  test("blocks readiness when an asset MIME type is not PDF", () => {
    const readiness = evaluateAdoptionGuideReadiness(release, {
      zhHk: { asset: zhAsset, objectVerified: true },
      en: {
        asset: { ...enAsset, mimeType: "application/octet-stream" } as unknown as DocumentAsset,
        objectVerified: true,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "assets",
      code: "english_asset_mime_type_invalid",
      message: "English asset must be a PDF.",
    });
  });

  test("blocks readiness when the English Storage object is unverified", () => {
    const readiness = evaluateAdoptionGuideReadiness(release, {
      zhHk: { asset: zhAsset, objectVerified: true },
      en: { asset: enAsset, objectVerified: false },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.issues).toContainEqual({
      field: "assets",
      code: "english_asset_unverified",
      message: "English PDF must be verified in Storage before submission.",
    });
  });
  test("requires the expected document contracts and knowledge content", () => {
    const readiness = evaluateAdoptionGuideReadiness(
      {
        ...release,
        knowledgeTitle: "   ",
        knowledgeTopic: "",
        knowledgeShortIntro: "\n",
      },
      {
        zhHk: { asset: { ...zhAsset, kind: "annual_report" }, objectVerified: true },
        en: { asset: { ...enAsset, language: "bilingual" }, objectVerified: true },
      },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toEqual([
      "chinese_asset_kind_invalid",
      "english_asset_language_invalid",
      "knowledge_title_required",
      "knowledge_topic_required",
      "knowledge_short_intro_required",
    ]);
  });

  test("is ready only when both verified PDFs and knowledge content are complete", () => {
    expect(
      evaluateAdoptionGuideReadiness(release, {
        zhHk: { asset: zhAsset, objectVerified: true },
        en: { asset: enAsset, objectVerified: true },
      }),
    ).toEqual({ ready: true, issues: [] });
  });
});
