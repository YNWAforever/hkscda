import { useState } from "react";

import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import { centsToHkd } from "../../../lib/donations/domain";
import { BulkResults } from "../bulk/BulkResults";
import { Button } from "../../ui/button";

const PAGE_SIZE = 25;
const statusCopy: Record<BankMatchOperation["items"][number]["status"], string> = {
  pending: "待逐筆確認",
  succeeded: "已入帳",
  skipped: "已略過",
  conflict: "資料已變，須重新預覽",
  failed: "失敗，須核對",
};

export function BankMatchOperationReview({
  operation,
  onApply,
  pendingOrdinal,
}: {
  operation: BankMatchOperation;
  onApply: (ordinal: number) => void;
  pendingOrdinal: number | null;
}) {
  const [page, setPage] = useState(1);
  const visible = operation.items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const results = operation.items.map((item) => ({
    entityId: item.paymentId,
    status: item.status,
    reasonCode: item.reasonCode,
    before: "exact_candidate",
    after: item.status,
  }));
  return (
    <section
      aria-label="逐組確認"
      className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
    >
      <h3 className="font-semibold text-[var(--color-panel)]">逐組確認</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        每筆銀行入款只可在核對付款、金額及參考後個別確認。失效或衝突須重新上載對帳檔並建立預覽。
      </p>
      <p className="break-all text-xs text-[var(--color-text-muted)]">
        快照 {operation.operationId} · 檔案 SHA-256 {operation.fileSha256} · 到期{" "}
        {operation.expiresAt}
      </p>
      <BulkResults items={results} />
      <div className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">銀行匹配第 {page} 頁逐筆確認</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th scope="col" className="p-2">
                行／銀行參考
              </th>
              <th scope="col" className="p-2">
                付款／金額
              </th>
              <th scope="col" className="p-2">
                結果
              </th>
              <th scope="col" className="p-2">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.ordinal} className="border-t border-[var(--color-border)] align-top">
                <td className="p-2">
                  {item.ordinal} · {item.bankReference}
                </td>
                <td className="break-all p-2">
                  {item.paymentId} · {item.paymentHint} · {centsToHkd(item.amountCents)}
                </td>
                <td className="p-2">
                  {statusCopy[item.status]}
                  {item.reasonCode ? ` · ${item.reasonCode}` : ""}
                </td>
                <td className="p-2">
                  {item.status === "pending" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pendingOrdinal !== null}
                      onClick={() => onApply(item.ordinal)}
                    >
                      {pendingOrdinal === item.ordinal ? "正在核對…" : "確認此筆入帳"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {operation.items.length > PAGE_SIZE ? (
        <nav aria-label="銀行匹配結果分頁" className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一頁
          </Button>
          <span>
            第 {page} / {Math.ceil(operation.items.length / PAGE_SIZE)} 頁
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page * PAGE_SIZE >= operation.items.length}
            onClick={() => setPage(page + 1)}
          >
            下一頁
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
