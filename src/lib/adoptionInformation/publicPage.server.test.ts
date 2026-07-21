import { describe, expect, test } from "bun:test";

import type { DocumentSlot } from "../documents/types";
import { POST_ADOPTION_GUIDE_SLOT_KEY, createPublicAdoptionPageReader } from "./publicPage.server";

const guide = (language: "zh-HK" | "en", id: string): DocumentSlot => ({
  id: "slot-" + id,
  slotKey: POST_ADOPTION_GUIDE_SLOT_KEY,
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
  test("groups fees in stable species order and resolves shared guide slots", async () => {
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
        return [guide("en", "guide-en"), guide("zh-HK", "guide-zh")];
      },
    });

    const result = await read();
    expect(result.feesBySpecies.dog.map((fee) => fee.id)).toEqual(["fee-dog"]);
    expect(result.feesBySpecies.cat.map((fee) => fee.id)).toEqual(["fee-cat"]);
    expect(result.estates).toEqual([]);
    expect(result.guides.map((slot) => slot.language)).toEqual(["zh-HK", "en"]);
    expect(calls).toEqual([[POST_ADOPTION_GUIDE_SLOT_KEY]]);
  });

  test("discards unpublished guide slots defensively", async () => {
    const unpublished = { ...guide("zh-HK", "guide-zh"), isPublished: false };
    const read = createPublicAdoptionPageReader({
      adoptionRepository: {
        async listPublic() {
          return { fees: [], estates: [] };
        },
      },
      async loadGuides() {
        return [unpublished];
      },
    });

    expect((await read()).guides).toEqual([]);
  });
});
