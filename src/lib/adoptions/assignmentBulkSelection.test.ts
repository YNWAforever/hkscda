import { expect, test } from "bun:test";
import { buildCaseListSearchParams } from "../../components/admin/adoptions/caseWorkflowLogic";
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

test("select-all keeps the default all-animal scope across pages", async () => {
  const cases = Array.from({ length: 51 }, (_, index) => ({
    id: "case-" + index,
    animalType: index % 2 ? "cat" : "dog",
  }));
  const ids = await collectMatchingCaseIds(cases.length, async (page, pageSize) => {
    const params = buildCaseListSearchParams({
      statusId: "open-stage",
      animalType: "all",
      openOnly: true,
      page,
      pageSize,
    });
    const animalType = params.get("animalType");
    const matching = cases.filter((item) => !animalType || item.animalType === animalType);
    return {
      total: matching.length,
      cases: matching.slice((page - 1) * pageSize, page * pageSize),
    };
  });
  expect(ids).toEqual(cases.map((item) => item.id));
});

test("the selection messages default to what the Chinese admin has always shown", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(() => addCaseSelection(current, ["id-1000"])).toThrow("最多只能選取 1000 筆領養個案");
  expect(() => addCaseSelection(current, ["id-1000"], "zh")).toThrow(
    "最多只能選取 1000 筆領養個案",
  );
});

test("the selection messages are English in English, and say what to do next", async () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(() => addCaseSelection(current, ["id-1000"], "en")).toThrow(
    "You can select at most 1,000 adoption cases. Clear some and try again.",
  );
  await expect(
    collectMatchingCaseIds(1001, async () => ({ total: 0, cases: [] }), 50, "en"),
  ).rejects.toThrow("Select between 1 and 1,000 adoption cases.");
  await expect(
    collectMatchingCaseIds(2, async () => ({ total: 3, cases: [{ id: "a" }] }), 50, "en"),
  ).rejects.toThrow(
    "The case list changed while the cases were being selected. Select them again.",
  );
});

test("two selection messages were English before the English admin, and stay as they were in zh", async () => {
  await expect(collectMatchingCaseIds(0, async () => ({ total: 0, cases: [] }))).rejects.toThrow(
    "Adoption bulk selection must contain 1 to 1000 profiles",
  );
  await expect(
    collectMatchingCaseIds(2, async () => ({ total: 3, cases: [{ id: "a" }] })),
  ).rejects.toThrow("Adoption case list changed during bulk selection");
});
