import { defineAdminCopy } from "../i18n/copy";

/** What each payment method code stands for, in English (`PaymentPublicConfigMethod`). */
const EN_METHOD_NAMES: Record<string, string> = {
  stripe: "Stripe card",
  payme: "PayMe",
  fps: "FPS",
  paypal: "PayPal",
  alipayhk: "AlipayHK",
};

/**
 * Copy for the payment method settings screen. The state names (draft, in review and so on) are in
 * `cmsStateCopy`. The two errors of a failed save have always been English in the Chinese screen
 * and are kept as they were.
 */
export const paymentMethodsCopy = defineAdminCopy({
  zh: {
    title: "付款方式設定",
    loading: "載入付款方式設定中...",
    empty: "尚未建立任何付款方式設定",
    notPublic: "未公開",
    /** The method behind a setting, shown after its name: the stored code in Chinese, as before. */
    method: (code: string) => String(code),
    submit: "提交審批",
    withdraw: "撤回",
    approveAndPublish: "核准並發佈",
    needsAnotherApprover: "需要由另一位財務或管理員核准",
    /** What the screen says went wrong, by its code. */
    errors: {
      load_failed: "無法載入付款方式設定，請重新整理頁面。",
      conflict: "This configuration changed elsewhere. Reload before saving again.",
      save_failed: "Unable to save this configuration.",
    },
  },
  en: {
    title: "Payment method settings",
    loading: "Loading payment method settings...",
    empty: "No payment methods have been set up yet",
    notPublic: "Not public",
    method: (code: string) => EN_METHOD_NAMES[code] ?? String(code),
    submit: "Submit for approval",
    withdraw: "Withdraw",
    approveAndPublish: "Approve and publish",
    needsAnotherApprover: "Another treasurer or administrator must approve this",
    errors: {
      load_failed: "Could not load the payment method settings. Refresh the page.",
      conflict: "This configuration changed elsewhere. Reload the page before saving again.",
      save_failed: "Could not save this configuration. Check the details and try again.",
    },
  },
});
