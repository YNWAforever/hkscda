import { expect, test } from "bun:test";
import { buildBulkResultsCsv } from "./bulkResultsCsv";

test("bulk result CSV reports every item and neutralizes spreadsheet formulas", () => {
  const csv = buildBulkResultsCsv([
    { entityId: "id-1", status: "succeeded", reasonCode: null, before: "old", after: "=cmd" },
    {
      entityId: "id-2",
      status: "conflict",
      reasonCode: "version_changed",
      before: "a,b",
      after: "safe",
    },
  ]);
  expect(csv).toContain("id-1,succeeded");
  expect(csv).toContain("'=cmd");
  expect(
    buildBulkResultsCsv([
      { entityId: "id-3", status: "failed", reasonCode: null, before: "\t=cmd", after: "safe" },
    ]),
  ).toContain("'\t=cmd");
  expect(csv).toContain('"a,b"');
  expect(csv.trim().split("\n")).toHaveLength(3);
});
