import { expect, test } from "bun:test";
import { addCaseSelection, collectMatchingCaseIds } from "./assignmentBulkSelection";

test("adoption assignment bulk selection freezes 25 or all 1000 and rejects changes", async () => {
  const one = await collectMatchingCaseIds(25, async () => ({
    total: 25,
    cases: Array.from({ length: 25 }, (_, i) => ({ id: "page-" + i })),
  }));
  expect(one).toHaveLength(25);
  const page = async (page: number) => ({
    total: 1000,
    cases: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((page - 1) * 50 + i) })),
  });
  expect(await collectMatchingCaseIds(1000, page)).toHaveLength(1000);
  await expect(collectMatchingCaseIds(1001, page)).rejects.toThrow();
  await expect(
    collectMatchingCaseIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      cases: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st case", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addCaseSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addCaseSelection(current, ["id-1000"])).toThrow();
});
