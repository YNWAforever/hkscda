export type BulkItemResult = {
  entityId: string;
  status: "pending" | "succeeded" | "skipped" | "conflict" | "failed";
  reasonCode: string | null;
  before: string;
  after: string;
};

function cell(value: string) {
  const neutralized = /^[=+@-]/.test(value.trimStart()) ? "'" + value : value;
  return /[",\r\n]/.test(neutralized) ? '"' + neutralized.replaceAll('"', '""') + '"' : neutralized;
}

export function buildBulkResultsCsv(items: BulkItemResult[]): string {
  return (
    [
      "entity_id,status,reason_code,before,after",
      ...items.map((item) =>
        [item.entityId, item.status, item.reasonCode ?? "", item.before, item.after]
          .map(cell)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
