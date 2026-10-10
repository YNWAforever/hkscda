import { defineAdminCopy } from "../i18n/copy";
import { pluralCount } from "../i18n/format";

/**
 * Copy for the finance panel in the pledge detail drawer: the verified payments, their
 * month allocations, receipts and refunds, and the notification follow-up.
 */

const ZH_DELIVERY_EVENTS: Record<string, string> = {
  proof_recorded: "收到付款資料",
  active: "付款已核實",
  refund_recorded: "退款已記錄",
  needs_followup: "付款需跟進",
  cancelled: "承諾已取消",
};
const EN_DELIVERY_EVENTS: Record<string, string> = {
  proof_recorded: "Payment details received",
  active: "Payment verified",
  refund_recorded: "Refund recorded",
  needs_followup: "Payment needs follow-up",
  cancelled: "Pledge cancelled",
};
const ZH_DELIVERY_STATUSES: Record<string, string> = {
  queued: "等候傳送",
  processing: "處理中",
  sent: "服務商已接收",
  failed: "傳送失敗，可重試",
};
const EN_DELIVERY_STATUSES: Record<string, string> = {
  queued: "Waiting to send",
  processing: "In progress",
  sent: "Accepted by the provider",
  failed: "Failed to send, can be retried",
};

export const financeCopy = defineAdminCopy({
  zh: {
    heading: "收款、月份及通知",
    intro: "月份分配只分攤已核實的收款，不另計收入。未付款月份只供服務跟進。",
    supporterRecords: "聯絡人收款及收據紀錄",
    reconcileLink: "財務核對及收據",
    openMonths: "建立截至本月的跟進月份",
    loadFailed: "未能載入財務資料",
    submitted: {
      heading: "提交時的聯絡資料（保留原始版本）",
      note: "來源：公開助養申請。提交資料不會自行覆寫聯絡人主檔。",
      reasonLabel: "核實方法及原因",
      verify: "已核實，更新聯絡人主檔",
    },
    verifiedPayments: "已核實付款",
    choosePayment: "選擇付款",
    manualRecord: "人手記錄",
    linked: "已連結單一收款帳項",
    notLinked: "歷史收款尚待財務核對，未重入帳",
    refundedLine: (refunded: string, net: string) => ` · 已退款 ${refunded} · 實收 ${net}`,
    receiptsLine: (receipts: Array<{ number: string; issued: boolean }>) =>
      `收據：${
        receipts
          .map((receipt) => `${receipt.number}（${receipt.issued ? "已簽發" : "已作廢"}）`)
          .join("、") || "未簽發"
      }`,
    adjustmentReason: "調整原因",
    originalAllocation: "原月份分配",
    chooseAllocation: "選擇原分配",
    reverse: "新增分配撤銷記錄",
    reallocateMonth: "重新分配月份",
    reallocateAmount: (remaining: string) => `重新分配金額（港元；尚餘 ${remaining}）`,
    reallocate: "將此金額分配至指定月份",
    existingPayment: "待核對的既有收款",
    chooseExistingPayment: "選擇同一聯絡人的既有收款",
    noBankReference: "無銀行參考編號",
    reconcile: "核對並連結既有收款",
    receiptRequested: "記錄助養人已要求收據",
    refundNote:
      "記錄已完成的退款（部分或全額）。保留原收款及退款歷史，只撤銷超出剩餘收款的分配，並作廢原收據。",
    refundReference: "已完成退款的銀行參考編號",
    refundAmount: (refundable: string) => `退款金額（港元；可退 ${refundable}）`,
    recordRefund: "記錄已完成退款",
    notifications: "通知跟進",
    deliveryEvent: (event: string) => ZH_DELIVERY_EVENTS[event] ?? "通知",
    deliveryStatus: (status: string) => ZH_DELIVERY_STATUSES[status] ?? "未確認",
    noDeliveryEvidence: "尚無送達證據",
    deliveryLine: (event: string, status: string, evidence: string, attempts: number) =>
      `${event} · ${status} · ${evidence} · 嘗試 ${attempts} 次`,
    retryNotifications: "重試待傳送通知",
    /** The message for each way the panel can fail, by the code the panel keeps. */
    errors: {
      command_failed: "未能完成操作",
      retry_failed: "通知重試失敗",
    },
  },
  en: {
    heading: "Payments, months and notifications",
    intro:
      "Month allocations only share verified payments across months and are not counted as extra income. Unpaid months are for service follow-up only.",
    supporterRecords: "Supporter payment and receipt records",
    reconcileLink: "Payment reconciliation and receipts",
    openMonths: "Create follow-up months up to this month",
    loadFailed: "Could not load the finance details. Refresh the page and try again.",
    submitted: {
      heading: "Contact details as submitted (original kept)",
      note: "Source: public sponsorship application. Submitted details never overwrite the supporter record on their own.",
      reasonLabel: "How it was verified and why",
      verify: "Verify and update supporter record",
    },
    verifiedPayments: "Verified payments",
    choosePayment: "Choose a payment",
    manualRecord: "Manual record",
    linked: "Linked to a single payment entry",
    notLinked: "Earlier payment still to be reconciled by finance and not credited again",
    refundedLine: (refunded: string, net: string) =>
      ` · Refunded ${refunded} · Net received ${net}`,
    receiptsLine: (receipts: Array<{ number: string; issued: boolean }>) =>
      `Receipts: ${
        receipts
          .map((receipt) => `${receipt.number} (${receipt.issued ? "issued" : "voided"})`)
          .join(", ") || "none issued"
      }`,
    adjustmentReason: "Reason for the change",
    originalAllocation: "Original month allocation",
    chooseAllocation: "Choose the original allocation",
    reverse: "Add allocation reversal",
    reallocateMonth: "Month to reallocate to",
    reallocateAmount: (remaining: string) => `Amount to reallocate (HKD; ${remaining} left)`,
    reallocate: "Allocate this amount to the month",
    existingPayment: "Existing payment to reconcile",
    chooseExistingPayment: "Choose an existing payment from the same supporter",
    noBankReference: "No bank reference",
    reconcile: "Reconcile and link existing payment",
    receiptRequested: "Record that the sponsor asked for a receipt",
    refundNote:
      "Record a refund that has already been made (part or all). The original payment and the refund history are kept. Only allocations above the remaining payment are reversed, and the original receipt is voided.",
    refundReference: "Bank reference of the completed refund",
    refundAmount: (refundable: string) => `Refund amount (HKD; up to ${refundable})`,
    recordRefund: "Record completed refund",
    notifications: "Notification follow-up",
    deliveryEvent: (event: string) => EN_DELIVERY_EVENTS[event] ?? "Notification",
    deliveryStatus: (status: string) => EN_DELIVERY_STATUSES[status] ?? "Not confirmed",
    noDeliveryEvidence: "No delivery evidence yet",
    deliveryLine: (event: string, status: string, evidence: string, attempts: number) =>
      `${event} · ${status} · ${evidence} · Tried ${pluralCount(attempts, "time")}`,
    retryNotifications: "Retry queued notifications",
    errors: {
      command_failed: "Could not complete the action. Refresh the page and try again.",
      retry_failed: "Could not retry the notifications. Try again in a moment.",
    },
  },
});
