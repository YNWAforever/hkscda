import { describe, expect, test } from "bun:test";

import {
  adoptionGuideDraftInputSchema,
  adoptionGuideMutationSchema,
  adoptionGuidePublishSchema,
} from "./schemas";

describe("adoption guide release schemas", () => {
  test("normalizes an incomplete cat draft", () => {
    expect(
      adoptionGuideDraftInputSchema.parse({
        topic: "post_adoption",
        species: "cat",
        zhHkAssetId: null,
        enAssetId: null,
        knowledgeTitle: "",
        knowledgeTopic: "",
        knowledgeShortIntro: "",
        knowledgeSourceName: "",
        sortOrder: 0,
      }),
    ).toMatchObject({
      topic: "post_adoption",
      species: "cat",
      knowledgeSourceName: null,
    });
  });

  test("coerces optimistic-lock versions for draft mutations", () => {
    expect(
      adoptionGuideMutationSchema.parse({
        topic: " post_adoption ",
        species: "general",
        zhHkAssetId: null,
        enAssetId: null,
        knowledgeTitle: "",
        knowledgeTopic: "",
        knowledgeShortIntro: "",
        knowledgeSourceName: null,
        sortOrder: "0",
        expectedVersion: "2",
      }),
    ).toMatchObject({ topic: "post_adoption", sortOrder: 0, expectedVersion: 2 });
  });

  test("requires a suitably long idempotency key to publish", () => {
    expect(
      adoptionGuidePublishSchema.safeParse({ expectedVersion: 1, idempotencyKey: "too-short" })
        .success,
    ).toBe(false);
  });
});
