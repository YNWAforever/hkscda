import { expect, test } from "bun:test";
import { policyChanges } from "./policyChanges";
test("compares nested settings without treating key order as a change", () => {
  expect(
    policyChanges(
      { capacity: { maximum: 12 }, name: "貓舍" },
      { name: "貓舍", capacity: { maximum: 14 } },
    ),
  ).toEqual([{ path: "capacity.maximum", before: 12, after: 14 }]);
});
test("includes removed fields and unchanged arrays stay quiet", () => {
  expect(policyChanges({ days: [1, 2], remark: "舊" }, { days: [1, 2] })).toEqual([
    { path: "remark", before: "舊", after: undefined },
  ]);
});
