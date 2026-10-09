import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDateTime, pluralCount } from "../i18n/format";
import type { BulkItemResult } from "./bulkResultsCsv";

/** Copy for the bulk preview and results panels. */
export const bulkCopy = defineAdminCopy({
  zh: {
    results: {
      label: "逐筆結果",
      summary: (counts: {
        pending: number;
        succeeded: number;
        skipped: number;
        conflict: number;
        failed: number;
      }) =>
        `待處理 ${counts.pending} · 成功 ${counts.succeeded} · 略過 ${counts.skipped} · 衝突 ${counts.conflict} · 失敗 ${counts.failed}`,
      download: "下載逐筆結果 CSV",
    },
    review: {
      // Kept as the legacy zh-HK date and time, so the Chinese screen is unchanged.
      expires: (expiresAt: string) =>
        `預覽到期：${new Date(expiresAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`,
      expiredNotice: " · 已過期，請重新預覽",
      diffLabel: "逐筆套用差異",
      columns: {
        item: "項目",
        before: "原本",
        after: "套用後",
        result: "結果",
      },
      pagerLabel: "批量預覽分頁",
      previous: "上一頁",
      next: "下一頁",
      confirmChecked: "確認已核對所選範圍及套用前後差異",
      busy: "處理中…",
      applyNextBatch: "套用下一批 25 筆",
      applyPending: "套用待處理項目",
      technicalReference: "技術參考",
      /** The result of one item: Chinese shows the stored code, as it always has. */
      status: {
        pending: "pending",
        succeeded: "succeeded",
        skipped: "skipped",
        conflict: "conflict",
        failed: "failed",
      } satisfies Record<BulkItemResult["status"], string>,
    },
  },
  en: {
    results: {
      label: "Results by item",
      summary: (counts: {
        pending: number;
        succeeded: number;
        skipped: number;
        conflict: number;
        failed: number;
      }) =>
        `${counts.pending} pending · ${counts.succeeded} succeeded · ${counts.skipped} skipped · ${pluralCount(counts.conflict, "conflict")} · ${counts.failed} failed`,
      download: "Download results by item (CSV)",
    },
    review: {
      expires: (expiresAt: string) => `Preview expires: ${formatAdminDateTime(expiresAt, "en")}`,
      expiredNotice: " · Expired. Preview again.",
      diffLabel: "Changes to apply, by item",
      columns: {
        item: "Item",
        before: "Before",
        after: "After",
        result: "Result",
      },
      pagerLabel: "Bulk preview pagination",
      previous: "Previous",
      next: "Next",
      confirmChecked: "I have checked the selected items and the changes before and after",
      busy: "In progress…",
      applyNextBatch: "Apply the next 25",
      applyPending: "Apply pending items",
      technicalReference: "Technical reference",
      /** The same words as the results summary. */
      status: {
        pending: "Pending",
        succeeded: "Succeeded",
        skipped: "Skipped",
        conflict: "Conflict",
        failed: "Failed",
      } satisfies Record<BulkItemResult["status"], string>,
    },
  },
});
