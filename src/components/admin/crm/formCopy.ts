import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the dialogs on the supporter screens: the supporter form, the manual donation form
 * and the outcome shown after a manual donation is saved. The names of the purposes, payment
 * methods and statuses are in `copy.ts`, and the supporter languages in `profileCopy.ts`.
 */

/** The create and edit supporter dialog. */
export const supporterFormCopy = defineAdminCopy({
  zh: {
    loadingLatest: "正在載入最新支持者資料…",
    retry: "重試",
    conflict: "資料已由其他職員更新。你的修改尚未儲存；請重新載入最新版本再編輯。",
    discardAndReload: "放棄本次修改並重新載入",
    discardPrompt: "尚有未儲存更改，確定要放棄？",
    keepEditing: "繼續編輯",
    discardChanges: "放棄更改",
    cancel: "取消",
  },
  en: {
    loadingLatest: "Loading the latest supporter details…",
    retry: "Retry",
    conflict:
      "Another staff member changed this supporter, so your edits were not saved. Reload the latest version, then edit again.",
    discardAndReload: "Discard my edits and reload",
    discardPrompt: "Discard your unsaved changes?",
    keepEditing: "Keep editing",
    discardChanges: "Discard changes",
    cancel: "Cancel",
  },
});

/** The manual donation dialog. */
export const manualDonationCopy = defineAdminCopy({
  zh: {
    title: "手動捐款",
    amount: "金額 HKD",
    purpose: "用途",
    purposeAria: "捐款用途",
    method: "方式",
    methodAria: "付款方式",
    paymentStatus: "付款狀態",
    paymentStatusAria: "付款狀態",
    bankReference: "銀行參考編號",
    required: "必填",
    optional: "選填",
    receiptRequested: "需要收據",
    receiptAria: "需要收據",
    save: "儲存手動捐款",
  },
  en: {
    title: "Manual donation",
    amount: "Amount (HK$)",
    purpose: "Purpose",
    purposeAria: "Donation purpose",
    method: "Method",
    methodAria: "Payment method",
    paymentStatus: "Payment status",
    paymentStatusAria: "Payment status",
    bankReference: "Bank reference",
    required: "Required",
    optional: "Optional",
    receiptRequested: "Receipt requested",
    receiptAria: "Receipt requested",
    save: "Save manual donation",
  },
});

/** What the manual donation dialog shows once the donation is saved. */
export const manualGiftOutcomeCopy = defineAdminCopy({
  zh: {
    recorded: "捐款已儲存",
    reference: (donationId: string) => `參考編號：${donationId}`,
    complete: "收據處理完成，電郵服務已接納確認電郵。",
    notRequired: "付款仍待確認，現階段不會發出收據及確認電郵。",
    pending: "收據或確認電郵尚待完成。您可重試，不會新增捐款。",
    done: "完成",
  },
  en: {
    recorded: "Donation recorded",
    reference: (donationId: string) => `Reference: ${donationId}`,
    complete: "The receipt is done and the email provider accepted the acknowledgement email.",
    notRequired: "The payment is still pending, so no receipt or acknowledgement email is due yet.",
    pending:
      "The receipt or acknowledgement email is not finished. You can retry, and it will not create another donation.",
    done: "Close",
  },
});
