import type { AdminLanguage } from "../admin/language";

/**
 * What the email provider has told us about a message, in words for staff. The Chinese column
 * is what the admin has always shown, word for word, and is the default.
 */
const DELIVERY_LABELS: Record<AdminLanguage, { states: Record<string, string>; unknown: string }> =
  {
    zh: {
      states: {
        delivered: "已送達收件伺服器",
        bounced: "退信：需要跟進",
        failed: "服務商回報失敗：需要跟進",
        complained: "收件人投訴：停止重發並跟進",
        delivery_delayed: "服務商仍在嘗試送達",
      },
      unknown: "送達狀態待核實",
    },
    en: {
      states: {
        delivered: "Delivered to the recipient's mail server",
        bounced: "Bounced: follow up",
        failed: "The provider reported a failure: follow up",
        complained: "The recipient complained: stop resending and follow up",
        delivery_delayed: "The provider is still trying to deliver",
      },
      unknown: "Delivery status not yet verified",
    },
  };

/** The label for a delivery state, or `null` when there is no state. */
export function deliveryLabel(
  state: string | null | undefined,
  language: AdminLanguage = "zh",
): string | null {
  if (!state) return null;
  const labels = DELIVERY_LABELS[language];
  return labels.states[state] ?? labels.unknown;
}
