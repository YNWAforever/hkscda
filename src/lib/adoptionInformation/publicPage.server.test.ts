import { describe, expect, test } from "bun:test";

import type { DocumentSlot } from "../documents/types";
import { POST_ADOPTION_GUIDE_SLOT_KEY, createPublicAdoptionPageReader } from "./publicPage.server";

const guide = (
  language: "zh-HK" | "en",
  id: string,
  slotKey = POST_ADOPTION_GUIDE_SLOT_KEY,
): DocumentSlot => ({
  id: "slot-" + id,
  slotKey,
  language,
  isPublished: true,
  document: {
    id,
    kind: "adoption_guide",
    title: language === "zh-HK" ? "領養後須知" : "What to know after adopting a cat",
    language,
    bucketName: "site-documents",
    objectPath: language === "zh-HK" ? "adoption/guides/zh.pdf" : "adoption/guides/en.pdf",
    fileUrl: "https://cdn.test/" + language + ".pdf",
    mimeType: "application/pdf",
    byteSize: 1024,
    checksumSha256: null,
    isPublished: true,
    sortOrder: language === "zh-HK" ? 0 : 1,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
});

describe("public adoption information page reader", () => {
  test("groups complete bilingual guide slots by species", async () => {
    const calls: string[][] = [];
    const read = createPublicAdoptionPageReader({
      adoptionRepository: {
        async listPublic() {
          return {
            fees: [
              {
                id: "fee-cat",
                animalType: "cat" as const,
                itemName: "Cat",
                priceHkd: "500",
                sortOrder: 1,
                isPublished: true,
              },
              {
                id: "fee-dog",
                animalType: "dog" as const,
                itemName: "Dog",
                priceHkd: "1,000",
                sortOrder: 0,
                isPublished: true,
              },
            ],
            estates: [],
          };
        },
      },
      async loadGuides(slotKeys) {
        calls.push(slotKeys);
        return [
          guide("en", "guide-en", "post_adoption_guide_cat"),
          guide("zh-HK", "guide-zh", "post_adoption_guide_cat"),
        ];
      },
    });

    const result = await read();
    expect(result.feesBySpecies.dog.map((fee) => fee.id)).toEqual(["fee-dog"]);
    expect(result.feesBySpecies.cat.map((fee) => fee.id)).toEqual(["fee-cat"]);
    expect(result.estates).toEqual([]);
    expect(result.guideGroups).toEqual([
      {
        species: "cat",
        zhHk: expect.objectContaining({ language: "zh-HK" }),
        en: expect.objectContaining({ language: "en" }),
      },
    ]);
    expect(calls).toEqual([
      [
        "post_adoption_guide_cat",
        "post_adoption_guide_dog",
        "post_adoption_guide_general",
        POST_ADOPTION_GUIDE_SLOT_KEY,
      ],
    ]);
  });

  test("falls back to legacy slots before a coordinated release exists", async () => {
    const read = createPublicAdoptionPageReader({
      adoptionRepository: {
        async listPublic() {
          return { fees: [], estates: [] };
        },
      },
      async loadGuides() {
        return [guide("zh-HK", "guide-zh"), guide("en", "guide-en")];
      },
    });

    expect((await read()).guideGroups).toEqual([
      {
        species: "general",
        zhHk: expect.objectContaining({ slotKey: POST_ADOPTION_GUIDE_SLOT_KEY }),
        en: expect.objectContaining({ slotKey: POST_ADOPTION_GUIDE_SLOT_KEY }),
      },
    ]);
  });

  test("does not expose an incomplete or unpublished pair", async () => {
    const unpublished = guide("en", "guide-en", "post_adoption_guide_dog");
    unpublished.document.isPublished = false;
    const read = createPublicAdoptionPageReader({
      adoptionRepository: {
        async listPublic() {
          return { fees: [], estates: [] };
        },
      },
      async loadGuides() {
        return [guide("zh-HK", "guide-zh", "post_adoption_guide_dog"), unpublished];
      },
    });

    expect((await read()).guideGroups).toEqual([]);
  });
});
