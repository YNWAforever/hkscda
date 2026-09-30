import { expect, test } from "bun:test";
import { collectMatchingSupporterIds } from "./tagBulkSelection";

test("bulk selection freezes exactly the visible 25 or all 1000 matches", async () => {
  const fetchPage = async (page: number) => ({
    total: 1000,
    supporters: Array.from({ length: 100 }, (_, index) => ({
      id: "id-" + ((page - 1) * 100 + index),
    })),
  });
  const onePage = await collectMatchingSupporterIds(25, async () => ({
    total: 25,
    supporters: Array.from({ length: 25 }, (_, index) => ({ id: "page-" + index })),
  }));
  expect(onePage).toHaveLength(25);
  expect(await collectMatchingSupporterIds(1000, fetchPage)).toHaveLength(1000);
  await expect(collectMatchingSupporterIds(1001, fetchPage)).rejects.toThrow();
  await expect(
    collectMatchingSupporterIds(1000, async (page) => ({
      total: page === 2 ? 999 : 1000,
      supporters: Array.from({ length: 100 }, (_, index) => ({
        id: "id-" + ((page - 1) * 100 + index),
      })),
    })),
  ).rejects.toThrow();
});
