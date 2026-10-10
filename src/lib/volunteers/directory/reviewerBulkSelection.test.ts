import { expect, test } from "bun:test";
import { expectNoChineseText } from "../../../components/admin/i18n/testing";
import {
  addVolunteerSelection,
  collectMatchingVolunteerIds,
  VolunteerSelectionError,
  volunteerSelectionErrorText,
  type VolunteerSelectionErrorCode,
} from "./reviewerBulkSelection";

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

async function refusal(work: () => unknown): Promise<VolunteerSelectionError> {
  const error = await Promise.resolve()
    .then(work)
    .catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(VolunteerSelectionError);
  return error as VolunteerSelectionError;
}

test("a refused selection carries a code, and keeps the message it always had", async () => {
  const page = async (index: number) => ({
    total: 1000,
    profiles: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
  });
  const outOfRange = await refusal(() => collectMatchingVolunteerIds(1001, page));
  expect(outOfRange.code).toBe("out_of_range");
  expect(outOfRange.message).toBe("Volunteer bulk selection must contain 1 to 1000 profiles");
  const changed = await refusal(() =>
    collectMatchingVolunteerIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      profiles: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
    })),
  );
  expect(changed.code).toBe("list_changed");
  expect(changed.message).toBe("Volunteer directory changed during bulk selection");
  const duplicated = await refusal(() =>
    collectMatchingVolunteerIds(2, async () => ({
      total: 2,
      profiles: [{ id: "same" }, { id: "same" }],
    })),
  );
  expect(duplicated.code).toBe("list_changed");
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  const tooMany = await refusal(() => addVolunteerSelection(current, ["id-1000"]));
  expect(tooMany.code).toBe("too_many");
  expect(tooMany.message).toBe("最多只能選取 1000 筆義工身份");
  expect(tooMany.name).toBe("VolunteerSelectionError");
});

test("each refusal has an English text that says what to do, and a zh-HK default", () => {
  const codes: VolunteerSelectionErrorCode[] = [
    "out_of_range",
    "list_changed",
    "too_many",
    "filter_changed",
  ];
  for (const code of codes) {
    const english = volunteerSelectionErrorText(code, "en");
    expectNoChineseText(english);
    expect(english.endsWith("."), code).toBe(true);
    expect(volunteerSelectionErrorText(code)).toBe(volunteerSelectionErrorText(code, "zh"));
    expect(new VolunteerSelectionError(code).message).toBe(volunteerSelectionErrorText(code, "zh"));
  }
  expect(volunteerSelectionErrorText("too_many", "en")).toBe(
    "You can select at most 1,000 volunteer profiles. Clear some and try again.",
  );
  expect(volunteerSelectionErrorText("filter_changed")).toBe("篩選條件已變更；請重新選取");
});
