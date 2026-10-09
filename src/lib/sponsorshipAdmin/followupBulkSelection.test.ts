import { expect, test } from "bun:test";
import { expectNoChineseText } from "../../components/admin/i18n/testing";
import {
  addPledgeSelection,
  collectMatchingPledgeIds,
  PledgeSelectionError,
  pledgeSelectionErrorText,
  type PledgeSelectionErrorCode,
} from "./followupBulkSelection";

test("sponsorship bulk selection captures 25 or all 1000 and rejects a changed list", async () => {
  expect(
    await collectMatchingPledgeIds(25, async () => ({
      total: 25,
      pledges: Array.from({ length: 25 }, (_, i) => ({ id: "page-" + i })),
    })),
  ).toHaveLength(25);
  const page = async (index: number) => ({
    total: 1000,
    pledges: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
  });
  expect(await collectMatchingPledgeIds(1000, page)).toHaveLength(1000);
  await expect(collectMatchingPledgeIds(1001, page)).rejects.toThrow();
  await expect(
    collectMatchingPledgeIds(1000, async (index) => ({
      total: index === 2 ? 999 : 1000,
      pledges: Array.from({ length: 50 }, (_, i) => ({ id: "id-" + ((index - 1) * 50 + i) })),
    })),
  ).rejects.toThrow();
});

test("manual selection rejects a 1001st pledge", () => {
  const current = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(addPledgeSelection(current, ["id-1"])).toHaveLength(1000);
  expect(() => addPledgeSelection(current, ["id-1000"])).toThrow();
});

const MESSAGES: Record<PledgeSelectionErrorCode, string> = {
  out_of_range: "助養批量選取須為 1 至 1000 筆",
  list_changed: "助養列表在選取期間變更",
  too_many: "最多只能選取 1000 筆助養承諾",
};

test("a refused selection carries a code, and its message is the zh-HK text it always was", async () => {
  const outOfRange = await collectMatchingPledgeIds(1001, async () => ({
    total: 1001,
    pledges: [{ id: "a" }],
  })).catch((error: unknown) => error);
  expect(outOfRange).toBeInstanceOf(PledgeSelectionError);
  expect(outOfRange).toMatchObject({ code: "out_of_range", message: MESSAGES.out_of_range });

  const changed = await collectMatchingPledgeIds(2, async () => ({
    total: 3,
    pledges: [{ id: "a" }],
  })).catch((error: unknown) => error);
  expect(changed).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const duplicated = await collectMatchingPledgeIds(2, async () => ({
    total: 2,
    pledges: [{ id: "a" }, { id: "a" }],
  })).catch((error: unknown) => error);
  expect(duplicated).toMatchObject({ code: "list_changed", message: MESSAGES.list_changed });

  const full = Array.from({ length: 1000 }, (_, i) => "id-" + i);
  expect(() => addPledgeSelection(full, ["id-1000"])).toThrow(MESSAGES.too_many);
  let thrown: unknown;
  try {
    addPledgeSelection(full, ["id-1000"]);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code: "too_many" });
});

test("pledgeSelectionErrorText defaults to zh-HK and has an English message for each code", () => {
  for (const code of Object.keys(MESSAGES) as PledgeSelectionErrorCode[]) {
    expect(pledgeSelectionErrorText(code)).toBe(MESSAGES[code]);
    expect(pledgeSelectionErrorText(code, "zh")).toBe(MESSAGES[code]);
    const english = pledgeSelectionErrorText(code, "en");
    expectNoChineseText(english);
    // Every English error says what to do next.
    expect(english, code).toMatch(/(Narrow the filters|Select the pledges|Clear some)/);
  }
  expect(pledgeSelectionErrorText("too_many", "en")).toBe(
    "You can select at most 1,000 pledges. Clear some and try again.",
  );
});
