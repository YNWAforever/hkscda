import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/**
 * Copy for the payments page: the payment list and its filters, the receipt actions, the
 * mark-as-received dialog and the failed receipt and notification jobs. The bank statement
 * panels are in `bankCopy.ts`.
 */

const ZH_FINANCE_ACTIONS: Record<string, string> = {
  "payment.mark_received": "標記已收款",
  "receipt.issue": "發收條",
  "receipt.void": "作廢收條",
};
const EN_FINANCE_ACTIONS: Record<string, string> = {
  "payment.mark_received": "Marked as received",
  "receipt.issue": "Receipt issued",
  "receipt.void": "Receipt voided",
};
const EN_PURPOSES: Record<string, string> = {
  general: "General",
  medical: "Medical",
  sponsor: "Sponsorship",
};

/** The payments page. */
export const paymentsCopy = defineAdminCopy({
  zh: {
    summary: {
      awaitingReconcile: "待確認手動收款",
      awaitingReceipt: "待發收條",
      confirmedAmount: "已確認金額",
    },
    allStatuses: "全部狀態",
    allMethods: "全部方式",
    paymentStatus: {
      pending: "待確認",
      succeeded: "已確認",
      failed: "失敗",
      refunded: "已退款",
    },
    providerNames: {
      stripe: "Stripe",
      paypal: "PayPal",
      fps: "FPS",
      payme: "PayMe",
      manual: "Manual",
    },
    searchPlaceholder: "搜尋姓名 / 電郵 / 參考",
    statusFilterLabel: "收款狀態篩選",
    providerFilterLabel: "收款方式篩選",
    exportFailed: "匯出失敗",
    columns: {
      supporter: "捐款人",
      provider: "方式",
      amount: "金額",
      purpose: "用途",
      reference: "參考",
      status: "收款狀態",
      receipt: "收條",
      actions: "操作",
    },
    refundedLine: (refunded: string, net: string) => `已退款 ${refunded} · 實收 ${net}`,
    /** The purpose is shown as its stored code, as it always has been. */
    purposeLabel: (purpose: string) => purpose,
    purposeWithNote: (purpose: string, note: string) => `${purpose} · 其他用途：${note}`,
    receiptIssued: (receiptNo: string) => `已發 ${receiptNo}`,
    receiptAwaiting: "待發收條",
    receiptVoided: "已作廢",
    issueReceipt: "發收條",
    voidReceipt: "作廢收條",
    confirmVoid: (receiptNo: string) => `確定作廢收條 ${receiptNo}？`,
    noPayments: "沒有收款紀錄",
    range: (start: number, end: number, total: number) => `${start}-${end} / ${total}`,
    pageIndicator: (page: number, totalPages: number) => `${page} / ${totalPages}`,
    previousPage: "Previous payments page",
    nextPage: "Next payments page",
    activityTitle: "最近收款活動",
    noActivity: "暫無活動紀錄。",
    system: "系統",
    financeAction: (action: string) => ZH_FINANCE_ACTIONS[action] ?? action,
  },
  en: {
    summary: {
      awaitingReconcile: "Manual payments to confirm",
      awaitingReceipt: "Receipts to issue",
      confirmedAmount: "Confirmed amount",
    },
    allStatuses: "All statuses",
    allMethods: "All methods",
    paymentStatus: {
      pending: "Pending",
      succeeded: "Confirmed",
      failed: "Failed",
      refunded: "Refunded",
    },
    providerNames: {
      stripe: "Stripe",
      paypal: "PayPal",
      fps: "FPS",
      payme: "PayMe",
      manual: "Manual",
    },
    searchPlaceholder: "Search name, email or reference",
    statusFilterLabel: "Filter by payment status",
    providerFilterLabel: "Filter by payment method",
    exportFailed: "Could not export. Try again.",
    columns: {
      supporter: "Donor",
      provider: "Method",
      amount: "Amount",
      purpose: "Purpose",
      reference: "Reference",
      status: "Payment status",
      receipt: "Receipt",
      actions: "Actions",
    },
    refundedLine: (refunded: string, net: string) => `Refunded ${refunded} · Net received ${net}`,
    purposeLabel: (purpose: string) => EN_PURPOSES[purpose] ?? purpose,
    purposeWithNote: (purpose: string, note: string) =>
      `${EN_PURPOSES[purpose] ?? purpose} · Other purpose: ${note}`,
    receiptIssued: (receiptNo: string) => `Issued ${receiptNo}`,
    receiptAwaiting: "Receipt to issue",
    receiptVoided: "Voided",
    issueReceipt: "Issue receipt",
    voidReceipt: "Void receipt",
    confirmVoid: (receiptNo: string) => `Void receipt ${receiptNo}?`,
    noPayments: "No payment records",
    range: (start: number, end: number, total: number) =>
      `${formatAdminNumber(start, "en")}-${formatAdminNumber(end, "en")} of ${formatAdminNumber(total, "en")}`,
    pageIndicator: (page: number, totalPages: number) => `Page ${page} of ${totalPages}`,
    previousPage: "Previous page of payments",
    nextPage: "Next page of payments",
    activityTitle: "Recent payment activity",
    noActivity: "No activity yet.",
    system: "System",
    financeAction: (action: string) => EN_FINANCE_ACTIONS[action] ?? action,
  },
});

/** The dialog that marks a manual payment as received. */
export const reconcileDialogCopy = defineAdminCopy({
  zh: {
    title: "標記已收款",
    referenceLabel: "銀行 / PayMe / FPS 參考編號",
    referencePlaceholder: "例如 FPS-20260630-001",
    deliveryWarning:
      "收款及稽核已記錄；收條或電郵工作尚未完成。可重試或到待處理工作檢查，不要再次入帳。",
    close: "關閉",
    cancel: "取消",
    retry: "重試收條及電郵",
    processing: "處理中…",
    confirm: "確認收款",
  },
  en: {
    title: "Mark as received",
    referenceLabel: "Bank, PayMe or FPS reference",
    referencePlaceholder: "For example, FPS-20260630-001",
    deliveryWarning:
      "The payment and its audit record are saved, but the receipt or email job is not finished. Retry it or check the failed jobs. Do not credit the payment again.",
    close: "Close",
    cancel: "Cancel",
    retry: "Retry receipt and email",
    processing: "Processing…",
    confirm: "Confirm payment",
  },
});

/** The list of failed receipt and notification jobs. */
export const deliveryWorklistCopy = defineAdminCopy({
  zh: {
    heading: "收條／通知失敗工作",
    intro:
      "只顯示既有失敗工作。只有付款仍成功入帳才可重試；請先核對付款及收件資料。此清單不會自動補發、重新入帳、退款或作廢收條。",
    loading: "正在讀取工作…",
    summary: (total: number) => `需處理工作 ${total} 項；每頁最多 25 項。`,
    regionLabel: "收條及通知工作表格",
    caption: (page: number) => `收條及通知工作第 ${page} 頁`,
    columns: {
      job: "工作／付款",
      status: "狀態／嘗試",
      reason: "失敗原因",
      actions: "操作",
    },
    job: (id: string) => `工作 ${id}`,
    payment: (id: string) => `付款 ${id}`,
    created: (at: string) => `建立：${at}`,
    needsManual: "需人工處理",
    canRetry: "可重試",
    attempts: (count: number) => `已嘗試 ${count} 次`,
    nextAttempt: (at: string) => `下次：${at}`,
    retryJob: "重試此工作",
    paymentChanged: "付款狀態已變更，不能重試",
    noJobs: "目前沒有失敗工作。",
    navLabel: "送達工作分頁",
    previous: "上一頁",
    next: "下一頁",
    pageOf: (page: number, totalPages: number) => `第 ${page} / ${totalPages} 頁`,
    latestStatus: (status: string) => `工作最新狀態：${status}。付款記錄不會重複入帳。`,
    retryUnconfirmed: "未能確認重試結果；請按最新清單核對，勿假定工作未執行。",
    confirmRetry: "確認重試這一筆既有收條及確認電郵工作？請先核對付款及收件資料。",
  },
  en: {
    heading: "Failed receipt and notification jobs",
    intro:
      "Only existing failed jobs are listed. A job can be retried only while its payment is still credited, so check the payment and the recipient details first. This list never resends automatically, credits a payment again, refunds or voids a receipt.",
    loading: "Loading jobs…",
    summary: (total: number) => `${pluralCount(total, "job")} to handle. Up to 25 per page.`,
    regionLabel: "Receipt and notification jobs table",
    caption: (page: number) => `Receipt and notification jobs, page ${page}`,
    columns: {
      job: "Job / payment",
      status: "Status / attempts",
      reason: "Failure reason",
      actions: "Actions",
    },
    job: (id: string) => `Job ${id}`,
    payment: (id: string) => `Payment ${id}`,
    created: (at: string) => `Created: ${at}`,
    needsManual: "Needs manual action",
    canRetry: "Can retry",
    attempts: (count: number) => `Tried ${pluralCount(count, "time")}`,
    nextAttempt: (at: string) => `Next attempt: ${at}`,
    retryJob: "Retry this job",
    paymentChanged: "The payment status has changed, so this job cannot be retried",
    noJobs: "There are no failed jobs.",
    navLabel: "Delivery jobs pagination",
    previous: "Previous",
    next: "Next",
    pageOf: (page: number, totalPages: number) => `Page ${page} of ${totalPages}`,
    latestStatus: (status: string) =>
      `Latest job status: ${status}. The payment will not be credited again.`,
    retryUnconfirmed:
      "Could not confirm the retry result. Check the latest list, and do not assume the job did not run.",
    confirmRetry:
      "Retry this existing receipt and acknowledgement email job? Check the payment and the recipient details first.",
  },
});
