import { useState } from "react";

import type { BankMatchOperation } from "../../../lib/donations/bankMatchConfirmation";
import { BulkResults } from "../bulk/BulkResults";
import { useAdminCopy } from "../i18n/copy";
import { Button } from "../../ui/button";
import { bankReviewCopy } from "./bankCopy";
import { donationFormatCopy } from "./formatCopy";

const PAGE_SIZE = 25;

export function BankMatchOperationReview({
  operation,
  onApply,
  pendingOrdinal,
  disabled = false,
}: {
  operation: BankMatchOperation;
  onApply: (ordinal: number) => void;
  pendingOrdinal: number | null;
  disabled?: boolean;
}) {
  const copy = useAdminCopy(bankReviewCopy);
  const format = useAdminCopy(donationFormatCopy);
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
      aria-label={copy.heading}
      className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
    >
      <h3 className="font-semibold text-[var(--color-panel)]">{copy.heading}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      <p className="break-all text-xs text-[var(--color-text-muted)]">
        {copy.snapshotLine(
          operation.operationId,
          operation.fileSha256,
          format.timestamp(operation.expiresAt),
        )}
      </p>
      <BulkResults items={results} />
      <div
        role="region"
        aria-label={copy.regionLabel}
        tabIndex={0}
        className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)]"
      >
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">{copy.caption(page)}</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th scope="col" className="p-2">
                {copy.columns.row}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.payment}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.result}
              </th>
              <th scope="col" className="p-2">
                {copy.columns.actions}
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
                  {item.paymentId} · {item.paymentHint} · {format.money(item.amountCents)}
                </td>
                <td className="p-2">
                  {copy.statuses[item.status]}
                  {item.reasonCode ? ` · ${item.reasonCode}` : ""}
                </td>
                <td className="p-2">
                  {item.status === "pending" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled || pendingOrdinal !== null}
                      onClick={() => onApply(item.ordinal)}
                    >
                      {pendingOrdinal === item.ordinal ? copy.checking : copy.confirmThis}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {operation.items.length > PAGE_SIZE ? (
        <nav aria-label={copy.pagerLabel} className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {copy.previous}
          </Button>
          <span>{copy.pageOf(page, Math.ceil(operation.items.length / PAGE_SIZE))}</span>
          <Button
            type="button"
            variant="outline"
            disabled={page * PAGE_SIZE >= operation.items.length}
            onClick={() => setPage(page + 1)}
          >
            {copy.next}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
