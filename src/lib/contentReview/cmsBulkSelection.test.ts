import { expect, test } from "bun:test";
import { addCmsReviewSelection, collectCmsReviewIds } from "./cmsBulkSelection";

test("CMS content review bulk selection freezes 25 or all 1000 and rejects changes", async () => {
  const one = await collectCmsReviewIds(25, async () => ({
    total: 25,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "page-" + i })),
  }));
  expect(one).toHaveLength(25);
  const page = async (page: number) => ({
    total: 1000,
    items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((page - 1) * 25 + i) })),
  });
  expect(await collectCmsReviewIds(1000, page)).toHaveLength(1000);
  await expect(collectCmsReviewIds(1001, page)).rejects.toThrow();
  await expect(
    collectCmsReviewIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      items: Array.from({ length: 25 }, (_, i) => ({ entity_id: "id-" + ((index - 1) * 25 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st CMS content", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addCmsReviewSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addCmsReviewSelection(current, ["id-1000"])).toThrow();
});
