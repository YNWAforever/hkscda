import { useState } from "react";

import { BulkResults, type BulkItemResult } from "./BulkResults";

export function BulkReview({
  title,
  operationId,
  expiresAt,
  items,
  busy,
  onApply,
}: {
  title: string;
  operationId: string;
  expiresAt: string;
  items: BulkItemResult[];
  busy: boolean;
  onApply: () => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const [page, setPage] = useState(1);
  const pending = items.filter((item) => item.status === "pending").length;
  const expired = Date.parse(expiresAt) <= Date.now();
  const pageCount = Math.max(1, Math.ceil(items.length / 25));
  const shown = items.slice((page - 1) * 25, page * 25);
  return (
    <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        預覽到期：
        {new Date(expiresAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
        {expired ? " · 已過期，請重新預覽" : ""}
      </p>
      <BulkResults items={items} />
      <div className="max-h-96 overflow-auto" role="region" aria-label="逐筆套用差異" tabIndex={0}>
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">原本</th>
              <th scope="col">套用後</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr key={item.entityId} className="border-t">
                <td className="break-all p-2">{item.entityId}</td>
                <td className="p-2">{item.before}</td>
                <td className="p-2">{item.after}</td>
                <td className="p-2">
                  {item.status}
                  {item.reasonCode ? " · " + item.reasonCode : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label="批量預覽分頁" className="flex items-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一頁
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            下一頁
          </button>
        </nav>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        確認已核對所選範圍及套用前後差異
      </label>
      <button
        type="button"
        className="btn-primary min-h-11"
        disabled={!reviewed || busy || expired || pending === 0}
        onClick={onApply}
      >
        {busy ? "處理中…" : pending > 25 ? "套用下一批 25 筆" : "套用待處理項目"}
      </button>
      <details className="text-xs text-[var(--color-text-muted)]">
        <summary>技術參考</summary>
        <code className="break-all">{operationId}</code>
      </details>
    </section>
  );
}
