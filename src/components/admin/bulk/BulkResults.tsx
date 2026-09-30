import { buildBulkResultsCsv, type BulkItemResult } from "./bulkResultsCsv";
export type { BulkItemResult } from "./bulkResultsCsv";

export function BulkResults({ items }: { items: BulkItemResult[] }) {
  const counts = {
    pending: items.filter((item) => item.status === "pending").length,
    succeeded: items.filter((item) => item.status === "succeeded").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    conflict: items.filter((item) => item.status === "conflict").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
  function download() {
    const blob = new Blob(["\uFEFF", buildBulkResultsCsv(items)], {
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
    <section aria-label="逐筆結果" className="space-y-2">
      <p role="status" className="text-sm">
        待處理 {counts.pending} · 成功 {counts.succeeded} · 略過 {counts.skipped} · 衝突{" "}
        {counts.conflict} · 失敗 {counts.failed}
      </p>
      <button type="button" className="btn-secondary min-h-11" onClick={download}>
        下載逐筆結果 CSV
      </button>
    </section>
  );
}
