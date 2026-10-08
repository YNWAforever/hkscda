import { useSharedAdminCopy } from "../i18n/copy";
import { buildBulkResultsCsv, type BulkItemResult } from "./bulkResultsCsv";
import { bulkCopy } from "./copy";
export type { BulkItemResult } from "./bulkResultsCsv";

export function BulkResults({ items }: { items: BulkItemResult[] }) {
  const copy = useSharedAdminCopy(bulkCopy).results;
  const counts = {
    pending: items.filter((item) => item.status === "pending").length,
    succeeded: items.filter((item) => item.status === "succeeded").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    conflict: items.filter((item) => item.status === "conflict").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
  function download() {
    const blob = new Blob(["﻿", buildBulkResultsCsv(items)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk-results.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section aria-label={copy.label} className="space-y-2">
      <p role="status" className="text-sm">
        {copy.summary(counts)}
      </p>
      <button type="button" className="btn-secondary min-h-11" onClick={download}>
        {copy.download}
      </button>
    </section>
  );
}
