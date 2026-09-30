import { expect, test } from "bun:test";
import { addPledgeSelection, collectMatchingPledgeIds } from "./followupBulkSelection";

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
