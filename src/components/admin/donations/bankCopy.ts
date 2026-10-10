import { defineAdminCopy } from "../i18n/copy";
import { pluralCount } from "../i18n/format";

/**
 * Copy for the bank statement panels on the payments page: the dry-run panel and its preview
 * table, and the one-by-one confirmation of the bank matches it creates.
 */

const EN_INVALID_REASONS: Record<string, string> = {
  reference: "the bank reference is not valid",
  date: "the date is not valid",
  currency: "the currency is not HKD",
  amount: "the amount is not valid",
  hint: "the payment hint is not valid",
};

/** The preview table of a bank statement file. */
export const bankPreviewCopy = defineAdminCopy({
  zh: {
    summary: (counts: {
      total: number;
      invalid: number;
      duplicate: number;
      credited: number;
      candidates: number;
      unmatched: number;
    }) =>
      `共 ${counts.total} 筆；資料無效 ${counts.invalid}、檔內重複 ${counts.duplicate}、已入帳 ${counts.credited}、有候選 ${counts.candidates}、沒有候選 ${counts.unmatched}。`,
    fileLine: (sha256: string, generatedAt: string) =>
      `檔案 SHA-256：${sha256} · 預覽時間：${generatedAt}。結果不會儲存；付款事實改變後須重新上載並核對。`,
    regionLabel: "銀行候選預覽表格",
    caption: (page: number) => `銀行對帳檔第 ${page} 頁候選預覽`,
    columns: {
      select: "選取",
      row: "行",
      reference: "銀行參考／日期",
      amount: "金額",
      result: "結果及候選",
    },
    selectRow: (ordinal: number) => `選取第 ${ordinal} 行作確認預覽`,
    statuses: {
      invalid: "資料無效",
      duplicate_file: "檔內重複",
      already_credited: "相同銀行參考已入帳",
      candidate_exact: "付款參考相符候選",
      candidate_amount_only: "只按金額候選",
      ambiguous: "多個候選，須人工核對",
      unmatched: "沒有候選",
    },
    /** The reason is shown as the code the server sent, as it always has been. */
    invalidReason: (reason: string) => `原因：${reason}`,
    candidateCount: (count: number) => `候選 ${count} 筆；僅顯示前 5 筆`,
    noPaymentReference: "無付款參考",
  },
  en: {
    summary: (counts: {
      total: number;
      invalid: number;
      duplicate: number;
      credited: number;
      candidates: number;
      unmatched: number;
    }) =>
      `${pluralCount(counts.total, "row")}. Invalid ${counts.invalid}, duplicate in the file ${counts.duplicate}, already credited ${counts.credited}, with candidates ${counts.candidates}, without a candidate ${counts.unmatched}.`,
    fileLine: (sha256: string, generatedAt: string) =>
      `File SHA-256: ${sha256} · Previewed: ${generatedAt}. Nothing is saved. If a payment changes, upload the file and check it again.`,
    regionLabel: "Bank candidate preview table",
    caption: (page: number) => `Candidate preview of the bank statement file, page ${page}`,
    columns: {
      select: "Select",
      row: "Row",
      reference: "Bank reference / date",
      amount: "Amount",
      result: "Result and candidates",
    },
    selectRow: (ordinal: number) => `Select row ${ordinal} for the confirmation preview`,
    statuses: {
      invalid: "Invalid data",
      duplicate_file: "Duplicate in the file",
      already_credited: "This bank reference is already credited",
      candidate_exact: "Candidate: payment reference matches",
      candidate_amount_only: "Candidate: amount only",
      ambiguous: "Several candidates; check manually",
      unmatched: "No candidate",
    },
    invalidReason: (reason: string) => `Reason: ${EN_INVALID_REASONS[reason] ?? reason}`,
    candidateCount: (count: number) =>
      `${pluralCount(count, "candidate")}; showing the first 5 only`,
    noPaymentReference: "No payment reference",
  },
});

/** The bank statement panel: choose a file, preview it and create a confirmation snapshot. */
export const bankPanelCopy = defineAdminCopy({
  zh: {
    heading: "銀行對帳檔預覽與逐組確認",
    intro:
      "第一步只作預覽與候選搜尋，不會確認入帳、退款或發送通知。銀行原始格式須先轉成內部標準 CSV；每檔最多 1,000 筆，僅接受 HKD 入款。只有建立快照後逐筆確認，才會記錄入帳及可恢復的收條工作。",
    standardColumns: "標準欄位：",
    chooseFile: "選擇標準 CSV",
    preview: "產生唯讀預覽",
    checking: "正在核對…",
    fileTooLarge: "檔案超過 256 KiB 上限。",
    previewFailed: "無法預覽對帳檔；請檢查 UTF-8 格式或聯絡財務管理員。",
    selected: (count: number) => `已選取 ${count} 筆付款參考相符候選；其他結果不能建立入帳快照。`,
    createOperation: "建立逐組確認預覽",
    processingSnapshot: "正在處理快照…",
    pagerLabel: "銀行預覽分頁",
    previous: "上一頁",
    next: "下一頁",
    pageOf: (page: number, pageCount: number) => `第 ${page} / ${pageCount} 頁`,
    reload: "重新讀取確認結果",
    restoreFailed: "未能恢復上次確認快照；請先重新讀取確認結果。",
    createFailed: "無法建立確認預覽；請檢查所選項目、權限及目前付款狀態。",
    refreshFailed: "未能重新讀取快照；請稍後再試。",
    applyFailed: "未能確認或更新此筆結果；請先重新讀取快照，勿重複使用另一銀行參考入帳。",
    confirmApply: (bankReference: string, paymentId: string, paymentHint: string, amount: string) =>
      `請核對銀行參考 ${bankReference}、付款 ${paymentId}、付款參考 ${paymentHint} 及 ${amount}，確定只確認此筆入帳？`,
  },
  en: {
    heading: "Bank statement preview and one-by-one confirmation",
    intro:
      "Step one is a preview and candidate search only. It does not credit payments, refund or send notifications. Convert the bank's own format to the standard internal CSV first. A file can hold up to 1,000 rows, and only HKD deposits are accepted. A payment is credited, and a recoverable receipt job recorded, only when you confirm it one by one from a snapshot.",
    standardColumns: "Standard columns: ",
    chooseFile: "Choose the standard CSV",
    preview: "Create read-only preview",
    checking: "Checking…",
    fileTooLarge: "The file is over the 256 KiB limit. Choose a smaller file.",
    previewFailed:
      "Could not preview the bank statement file. Check that it is UTF-8 encoded or ask a treasurer for help.",
    selected: (count: number) =>
      `${pluralCount(count, "candidate")} with a matching payment reference selected. Other results cannot be used to create a credit snapshot.`,
    createOperation: "Create one-by-one confirmation preview",
    processingSnapshot: "Processing the snapshot…",
    pagerLabel: "Bank preview pagination",
    previous: "Previous",
    next: "Next",
    pageOf: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
    reload: "Reload confirmation result",
    restoreFailed:
      "Could not restore the last confirmation snapshot. Reload the confirmation result first.",
    createFailed:
      "Could not create the confirmation preview. Check the selected rows, your permission and the current payment status.",
    refreshFailed: "Could not reload the snapshot. Try again later.",
    applyFailed:
      "Could not confirm or update this row. Reload the snapshot first, and do not credit the payment with a different bank reference.",
    confirmApply: (bankReference: string, paymentId: string, paymentHint: string, amount: string) =>
      `Check bank reference ${bankReference}, payment ${paymentId}, payment reference ${paymentHint} and ${amount}. Credit only this payment?`,
  },
});

/** The one-by-one confirmation of the bank matches in a snapshot. */
export const bankReviewCopy = defineAdminCopy({
  zh: {
    heading: "逐組確認",
    intro:
      "每筆銀行入款只可在核對付款、金額及參考後個別確認。失效或衝突須重新上載對帳檔並建立預覽。",
    snapshotLine: (operationId: string, sha256: string, expiresAt: string) =>
      `快照 ${operationId} · 檔案 SHA-256 ${sha256} · 到期 ${expiresAt}`,
    regionLabel: "銀行逐筆確認表格",
    caption: (page: number) => `銀行匹配第 ${page} 頁逐筆確認`,
    columns: {
      row: "行／銀行參考",
      payment: "付款／金額",
      result: "結果",
      actions: "操作",
    },
    statuses: {
      pending: "待逐筆確認",
      succeeded: "已入帳",
      skipped: "已略過",
      conflict: "資料已變，須重新預覽",
      failed: "失敗，須核對",
    },
    confirmThis: "確認此筆入帳",
    checking: "正在核對…",
    pagerLabel: "銀行匹配結果分頁",
    previous: "上一頁",
    next: "下一頁",
    pageOf: (page: number, pageCount: number) => `第 ${page} / ${pageCount} 頁`,
  },
  en: {
    heading: "One-by-one confirmation",
    intro:
      "Confirm each bank deposit on its own, after you check the payment, the amount and the reference. If a row is out of date or in conflict, upload the statement file again and create a new preview.",
    snapshotLine: (operationId: string, sha256: string, expiresAt: string) =>
      `Snapshot ${operationId} · File SHA-256 ${sha256} · Expires ${expiresAt}`,
    regionLabel: "Bank one-by-one confirmation table",
    caption: (page: number) => `Bank matches, page ${page}`,
    columns: {
      row: "Row / bank reference",
      payment: "Payment / amount",
      result: "Result",
      actions: "Actions",
    },
    statuses: {
      pending: "Waiting for confirmation",
      succeeded: "Credited",
      skipped: "Skipped",
      conflict: "Data has changed. Preview again.",
      failed: "Failed. Check manually.",
    },
    confirmThis: "Credit this payment",
    checking: "Checking…",
    pagerLabel: "Bank match results pagination",
    previous: "Previous",
    next: "Next",
    pageOf: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
  },
});
