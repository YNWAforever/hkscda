import { expect, test } from "bun:test";
import { buildBulkResultsCsv, buildBulkResultsCsvBlob } from "./bulkResultsCsv";

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

test("the downloaded file starts with a UTF-8 byte order mark so Excel reads Chinese text", async () => {
  const blob = buildBulkResultsCsvBlob([
    { entityId: "id-1", status: "succeeded", reasonCode: null, before: "a", after: "b" },
  ]);
  expect(blob.type).toBe("text/csv;charset=utf-8");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // EF BB BF is U+FEFF encoded as UTF-8; the CSV header follows it.
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes.slice(3))).toStartWith(
    "entity_id,status,reason_code,before,after\n",
  );
});
