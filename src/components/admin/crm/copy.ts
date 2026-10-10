import type { ConsentStatus } from "../../../lib/crm/types";
import { DONATION_PURPOSE_NAMES_EN } from "../donations/copy";
import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the supporter list and the supporter detail page: the list's selection controls,
 * the detail headings, the labels for donations, payments and receipts, the activity counters
 * and the timeline. The list's title, filters and columns are in `pageCopy/supporterCopy.ts`.
 */

/** English for a code that has no label: `no_show` reads as "No show". */
function humanise(code: string): string {
  const words = code.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

/** The selection controls and messages of the supporter list. */
export const supporterListCopy = defineAdminCopy({
  zh: {
    refreshing: "正在更新搜尋結果…",
    select: "選取",
    selectSupporter: (name: string) => `選取 ${name}`,
    selectPage: "選取本頁",
    selectAllMatching: "選取全部符合條件（最多 1000 筆）",
    clearSelection: "清除選取",
    lockingSelection: "正在固定選取範圍…",
    filtersChanged: "篩選條件已變更；請重新選取",
    lockFailed: "無法固定選取範圍",
    pagerLabel: "支持者",
    /** The list has always shown the stored consent value as it is. */
    consentStatus: (value: ConsentStatus | null): string => value ?? "-",
  },
  en: {
    refreshing: "Refreshing results…",
    select: "Select",
    selectSupporter: (name: string) => `Select ${name}`,
    selectPage: "Select this page",
    selectAllMatching: "Select all matching supporters (up to 1,000)",
    clearSelection: "Clear selection",
    lockingSelection: "Locking the selection…",
    filtersChanged: "The filters have changed. Select the supporters again.",
    lockFailed: "Could not lock the selection. Try again.",
    pagerLabel: "Supporters",
    consentStatus: (value: ConsentStatus | null): string =>
      value === "opt_in" ? "Opted in" : value === "opt_out" ? "Opted out" : "-",
  },
});

const ZH_PURPOSES: Record<string, string> = {
  general: "一般捐款",
  medical: "醫療",
  sponsor: "助養",
};
const ZH_METHODS: Record<string, string> = {
  manual: "手動",
  fps: "轉數快",
  payme: "PayMe",
  stripe: "Stripe",
};
const EN_METHODS: Record<string, string> = {
  manual: "Manual",
  fps: "FPS",
  payme: "PayMe",
  stripe: "Stripe",
  paypal: "PayPal",
};
const ZH_STATUSES: Record<string, string> = {
  pending: "待處理",
  succeeded: "成功",
  failed: "失敗",
  issued: "已發出",
  voided: "已作廢",
};
const EN_STATUSES: Record<string, string> = {
  pending: "Pending",
  succeeded: "Succeeded",
  failed: "Failed",
  issued: "Issued",
  voided: "Voided",
  void: "Voided",
  refunded: "Refunded",
  approved: "Approved",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  picked_up: "Picked up",
  not_marked: "Not marked",
  attended: "Attended",
  completed: "Completed",
  no_show: "No show",
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  opt_in: "Opted in",
  opt_out: "Opted out",
};

/**
 * Names for the purposes, payment methods and statuses a supporter's donations, payments and
 * receipts carry. Chinese keeps showing a code that has no name as it is, as it always has;
 * English writes it out.
 */
export const crmLabelCopy = defineAdminCopy({
  zh: {
    purpose: (value: string) => ZH_PURPOSES[value] ?? value,
    method: (value: string) => ZH_METHODS[value] ?? value,
    status: (value: string) => ZH_STATUSES[value] ?? value,
  },
  en: {
    purpose: (value: string) => DONATION_PURPOSE_NAMES_EN[value] ?? humanise(value),
    method: (value: string) => EN_METHODS[value] ?? humanise(value),
    status: (value: string) => EN_STATUSES[value] ?? humanise(value),
  },
});

/** The supporter detail page. */
export const supporterDetailCopy = defineAdminCopy({
  zh: {
    loading: "載入捐款人中...",
    loadError: "無法載入捐款人。",
    back: "捐款人",
    donations: "捐款",
    donationsSubtitle: "捐款紀錄及收據操作。",
    noDonations: "尚未有捐款。",
    receiptRequested: "需要收據",
    customPurposeLine: (purpose: string) => `其他用途：${purpose}`,
    refunded: "已退款",
    retained: "實收",
    issueReceipt: "發出收據",
    receipts: "收據",
    receiptsSubtitle: "已發出及已作廢的收據紀錄。",
    noReceipts: "尚未有收據。",
    voidReceipt: "作廢",
    confirmVoid: (receiptNo: string) => `確定作廢收條 ${receiptNo}？`,
    timeline: "時間軸",
    timelineSubtitle: "最新活動排最前。",
  },
  en: {
    loading: "Loading supporter...",
    loadError: "Could not load the supporter. Refresh the page or try again.",
    back: "Supporters",
    donations: "Donations",
    donationsSubtitle: "Donation history and receipt actions.",
    noDonations: "No donations yet.",
    receiptRequested: "receipt requested",
    customPurposeLine: (purpose: string) => `Other purpose: ${purpose}`,
    refunded: "Refunded",
    retained: "Net received",
    issueReceipt: "Issue receipt",
    receipts: "Receipts",
    receiptsSubtitle: "Issued and voided receipts.",
    noReceipts: "No receipts yet.",
    voidReceipt: "Void",
    confirmVoid: (receiptNo: string) => `Void receipt ${receiptNo}?`,
    timeline: "Timeline",
    timelineSubtitle: "Newest activity first.",
  },
});

/** The counters at the top of a supporter's page. */
export const activitySummaryCopy = defineAdminCopy({
  zh: {
    lifetime: "累計捐款",
    donations: "捐款",
    receipts: "收據",
    pendingPayments: "待處理付款",
    adoptionCases: "領養個案",
    openFollowups: "未完成跟進",
    successfulAdoptions: "成功領養",
  },
  en: {
    lifetime: "Lifetime donations",
    donations: "Donations",
    receipts: "Receipts",
    pendingPayments: "Pending payments",
    adoptionCases: "Adoption cases",
    openFollowups: "Open follow-ups",
    successfulAdoptions: "Successful adoptions",
  },
});

const ZH_TIMELINE_KINDS: Record<string, string> = {
  donation: "捐款",
  payment: "付款",
  receipt: "收據",
  consent: "通訊同意",
  adoption_case: "領養個案",
  adoption_followup: "跟進",
  successful_adoption: "成功領養",
  message: "訊息",
  audit: "系統紀錄",
};
const EN_TIMELINE_KINDS: Record<string, string> = {
  donation: "Donation",
  payment: "Payment",
  receipt: "Receipt",
  consent: "Consent",
  adoption_case: "Adoption case",
  adoption_followup: "Follow-up",
  successful_adoption: "Successful adoption",
  message: "Message",
  audit: "System record",
  volunteer_registration: "Volunteer registration",
};

/** The timeline of a supporter and the buttons that filter it. */
export const timelineCopy = defineAdminCopy({
  zh: {
    empty: "尚未有時間軸活動。",
    kind: (value: string) => ZH_TIMELINE_KINDS[value] ?? value,
    filtersLabel: "時間軸篩選",
    filters: {
      all: "全部",
      donations: "捐款",
      receipts: "收據",
      communication: "通訊",
      adoption: "領養",
      followups: "跟進",
      system: "系統",
    },
  },
  en: {
    empty: "No timeline activity yet.",
    kind: (value: string) => EN_TIMELINE_KINDS[value] ?? humanise(value),
    filtersLabel: "Timeline filters",
    filters: {
      all: "All",
      donations: "Donations",
      receipts: "Receipts",
      communication: "Communication",
      adoption: "Adoption",
      followups: "Follow-ups",
      system: "System",
    },
  },
});
