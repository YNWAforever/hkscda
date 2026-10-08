import type { AdminLanguage } from "../admin/language";

/**
 * The task overview cards, by key. The server (`taskOverview.server.ts`) keeps sending the
 * zh-HK text with each card, as before; the admin screen looks the text up here by `key`
 * in the active language. Both read this one table, so the two cannot drift apart.
 */
export type TaskKey =
  | "adoption_unassigned"
  | "followup_overdue"
  | "volunteer_pending"
  | "animal_missing_photo"
  | "sponsorship_proof_pending"
  | "sponsorship_followup"
  | "payment_pending"
  | "delivery_attention"
  | "content_drafts"
  | "content_expired"
  | "media_failed";

export type TaskCardText = { label: string; guidance: string };

const TASK_CARD_TEXT: Record<TaskKey, Record<AdminLanguage, TaskCardText>> = {
  adoption_unassigned: {
    zh: { label: "待分派領養個案", guidance: "按等候時間檢查未分派個案，先指派跟進人。" },
    en: {
      label: "Adoption cases to assign",
      guidance:
        "Check unassigned cases, longest waiting first, and assign a staff member to follow up.",
    },
  },
  followup_overdue: {
    zh: { label: "逾期待跟進", guidance: "檢查到期任務，記錄下一步及跟進日期。" },
    en: {
      label: "Overdue follow-ups",
      guidance: "Check the tasks that are due, then record the next step and the follow-up date.",
    },
  },
  volunteer_pending: {
    zh: { label: "待核實義工登記", guidance: "核對身份、政策同意及資格，再安排審核。" },
    en: {
      label: "Volunteer registrations to verify",
      guidance: "Check identity, policy consent and qualifications, then arrange a review.",
    },
  },
  animal_missing_photo: {
    zh: { label: "待補相片動物", guidance: "補上已核實的動物相片及資料，再交內容審核。" },
    en: {
      label: "Animals needing a photo",
      guidance: "Add verified photos and details for the animal, then send it for content review.",
    },
  },
  sponsorship_proof_pending: {
    zh: { label: "待核實助養憑證", guidance: "檢查憑證與承諾；上載憑證不等於已收款。" },
    en: {
      label: "Sponsorship proofs to verify",
      guidance:
        "Check each proof against its pledge. An uploaded proof does not mean the payment was received.",
    },
  },
  sponsorship_followup: {
    zh: {
      label: "助養待跟進",
      guidance: "核對付款及待跟進承諾，交由職員／管理員安排跟進。",
    },
    en: {
      label: "Sponsorships needing follow-up",
      guidance:
        "Check the payments and pledges that need follow-up, then hand them to a staff member or administrator to arrange.",
    },
  },
  payment_pending: {
    zh: { label: "待對帳款項", guidance: "核對付款證據及對帳資料，再逐筆確認款項。" },
    en: {
      label: "Payments to reconcile",
      guidance: "Check the payment evidence and bank data, then confirm each payment one by one.",
    },
  },
  delivery_attention: {
    zh: { label: "收條／通知需處理", guidance: "核對已收款及收件資料，再逐筆處理失敗工作。" },
    en: {
      label: "Receipts and notifications needing attention",
      guidance: "Check the payment and recipient details, then handle each failed job one by one.",
    },
  },
  content_drafts: {
    zh: { label: "待審內容草稿", guidance: "核對資料來源及內容預覽，再安排送審。" },
    en: {
      label: "Content drafts to review",
      guidance: "Check the sources and the content preview, then submit the draft for review.",
    },
  },
  content_expired: {
    zh: { label: "已過期內容", guidance: "檢查過期內容及公開影響，再安排更新。" },
    en: {
      label: "Expired content",
      guidance:
        "Check the expired content and how it affects the public site, then arrange an update.",
    },
  },
  media_failed: {
    zh: { label: "公開媒體修復失敗", guidance: "查看失敗媒體，修復後再核對公開相片。" },
    en: {
      label: "Public media repairs that failed",
      guidance: "Look at the failed media, repair it, then check the public photos.",
    },
  },
};

/** The label and guidance for a task card in `language`. Defaults to zh-HK, the server's text. */
export function taskCardText(key: TaskKey, language: AdminLanguage = "zh"): TaskCardText {
  return TASK_CARD_TEXT[key][language];
}

/** True for a card key this build knows. A newer server can send a key an older page does not. */
export function isTaskKey(key: string): key is TaskKey {
  return Object.hasOwn(TASK_CARD_TEXT, key);
}

/**
 * The text to show for a card the server sent. A key this page knows gets its text in
 * `language`. An unknown key, such as one added by a deploy that this page has not loaded yet,
 * shows the server's own label and guidance (zh-HK) in either language, rather than failing.
 */
export function taskCardTextFor(
  card: { key: string; label: string; guidance: string },
  language: AdminLanguage = "zh",
): TaskCardText {
  return isTaskKey(card.key)
    ? taskCardText(card.key, language)
    : { label: card.label, guidance: card.guidance };
}
