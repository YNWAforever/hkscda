import { Button } from "@/components/ui/button";
import { useState } from "react";

import { useSharedAdminCopy } from "../i18n/copy";
import { useAdminLanguageOrDefault } from "../i18n/languageContext";
import { BulkResults, type BulkItemResult } from "./BulkResults";
import { bulkCopy } from "./copy";

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
  const copy = useSharedAdminCopy(bulkCopy).review;
  const language = useAdminLanguageOrDefault();
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
        {copy.expires(expiresAt)}
        {expired ? copy.expiredNotice : ""}
      </p>
      <BulkResults items={items} />
      <div
        className="max-h-96 overflow-auto"
        role="region"
        aria-label={copy.diffLabel}
        tabIndex={0}
      >
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr>
              <th scope="col">{copy.columns.item}</th>
              <th scope="col">{copy.columns.before}</th>
              <th scope="col">{copy.columns.after}</th>
              <th scope="col">{copy.columns.result}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr key={item.entityId} className="border-t">
                <td className="break-all p-2">{item.entityId}</td>
                <td className="p-2">{item.before}</td>
                <td className="p-2">{item.after}</td>
                <td className="p-2">
                  {copy.status[item.status]}
                  {item.reasonCode ? (
                    // The reason is a technical code, kept as stored. Chinese keeps its plain text.
                    language === "zh" ? (
                      " · " + item.reasonCode
                    ) : (
                      <>
                        {" · "}
                        <code>{item.reasonCode}</code>
                      </>
                    )
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label={copy.pagerLabel} className="flex items-center gap-3">
          <Button
            variant="outline"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {copy.previous}
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            {copy.next}
          </Button>
        </nav>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        {copy.confirmChecked}
      </label>
      <button
        type="button"
        className="btn-primary min-h-11"
        disabled={!reviewed || busy || expired || pending === 0}
        onClick={onApply}
      >
        {busy ? copy.busy : pending > 25 ? copy.applyNextBatch : copy.applyPending}
      </button>
      <details className="text-xs text-[var(--color-text-muted)]">
        <summary>{copy.technicalReference}</summary>
        <code className="break-all">{operationId}</code>
      </details>
    </section>
  );
}
