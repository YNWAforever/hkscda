import { expect, test } from "bun:test";
import { addVolunteerSelection, collectMatchingVolunteerIds } from "./reviewerBulkSelection";

test("volunteer reviewer bulk selection freezes 25 or all 1000 and rejects changes", async () => {
  const one = await collectMatchingVolunteerIds(25, async () => ({
    total: 25,
    profiles: Array.from({ length: 25 }, (_, i) => ({ id: "page-" + i })),
  }));
  expect(one).toHaveLength(25);
  const page = async (page: number) => ({
    total: 1000,
    profiles: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((page - 1) * 50 + i) })),
  });
  expect(await collectMatchingVolunteerIds(1000, page)).toHaveLength(1000);
  await expect(collectMatchingVolunteerIds(1001, page)).rejects.toThrow();
  await expect(
    collectMatchingVolunteerIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      profiles: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st volunteer", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addVolunteerSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addVolunteerSelection(current, ["id-1000"])).toThrow();
});
