import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateOrNull } from "../i18n/format";

/**
 * Copy the content screens share: the content types, statuses and update kinds, the date, the
 * optional field labels of the create form, the clipboard message, and the text of the errors the
 * logic modules throw (`ContentAdminError`). The text of each screen is in its own module:
 * `managementCopy`, `editorCopy`, `editorPanelsCopy` and `reviewCopy`.
 */

/** A copy failure sentence that reads on after a reason, whatever punctuation the reason has. */
function endWithStop(text: string): string {
  const trimmed = text.trim();
  return /[.!?。！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export const contentCommonCopy = defineAdminCopy({
  zh: {
    types: {
      rescue_story: "救援故事",
      event: "活動",
      charity_market: "慈善市集",
      report: "報告",
    },
    statuses: {
      draft: "草稿",
      published: "已發布",
      archived: "已封存",
    },
    /** The create form's labels for the optional fields. */
    optionalFields: {
      ctaLabel: "CTA 標籤",
      ctaUrl: "CTA 連結",
      seoTitle: "SEO 標題",
      seoDescription: "SEO 描述",
      ogTitle: "OG 標題",
      ogDescription: "OG 描述",
    },
    updateKinds: {
      medical: "醫療",
      care: "照顧",
      photo: "相片",
      foster: "寄養",
      adoption: "領養",
      general: "一般",
    },
    visibility: {
      public: "公開",
      internal: "內部",
    },
    /** A date from a timestamp the server sent, in Hong Kong time; text that is not a date as sent. */
    date: (value: string) => formatAdminDateOrNull(value, "zh") ?? value,
    /** The sentence for a failed copy to the clipboard; `detail` is the browser's reason, if any. */
    clipboardFailed: (detail?: string) =>
      detail === undefined ? "複製失敗，請手動選取文字。" : `複製失敗：${detail}`,
    /**
     * The line for a lifecycle failure, by the code the server sent: a category, or the reason of
     * a known refusal (BUG-69). A conflict points at the banner's choices instead of telling the
     * admin to save again, which would only repeat the refusal.
     */
    lifecycleErrors: {
      conflict: "儲存衝突：此內容已有較新版本。請用上方的選項比較或重新載入最新版本。",
      not_found: "找不到此內容，請重新載入。",
      invalid: "內容不符合規則，請檢查必填欄位與網址格式。",
      internal: "儲存未完成，請稍後再試。若持續失敗，先檢查各面板是否已儲存。",
      network: "連線或伺服器暫時有問題，請稍後再試。",
      media_cover_internal: "內部更新的圖片不能設為封面。請取消「設為封面」，或改選公開更新。",
      session_expired: "上載時限已過。請再按「新增媒體」，系統會重新上載圖片。",
      media_mismatch: "上載的檔案與所選圖片不符。請重新選擇圖片，再上載一次。",
      link_exists: "此關聯紀錄已用相同關係加入，毋須再加。",
      primary_subject_exists: "此內容已有主要主角動物。每項內容只可有一個主要主角動物。",
      slug_taken: "此網址已被其他內容使用，請換一個。",
    },
    /** The message of each error a content logic module throws, by its code. */
    errors: {
      media_type: "請選擇 JPG、PNG 或 WEBP 圖片",
      media_size: "圖片不可超過 8 MiB",
      operation_busy: "另一個面板正在儲存，請稍後重試。",
      choose_image: "請選擇圖片",
      reload_before_upload: "請重新載入內容後再上傳圖片",
      no_upload_target: "無法取得私密媒體上傳位置",
      save_before_publish: "請先儲存內容並重新載入後再發布",
    },
  },
  en: {
    types: {
      rescue_story: "Rescue story",
      event: "Event",
      charity_market: "Charity market",
      report: "Report",
    },
    statuses: {
      draft: "Draft",
      published: "Published",
      archived: "Archived",
    },
    optionalFields: {
      ctaLabel: "CTA label",
      ctaUrl: "CTA link",
      seoTitle: "SEO title",
      seoDescription: "SEO description",
      ogTitle: "OG title",
      ogDescription: "OG description",
    },
    updateKinds: {
      medical: "Medical",
      care: "Care",
      photo: "Photo",
      foster: "Foster",
      adoption: "Adoption",
      general: "General",
    },
    visibility: {
      public: "Public",
      internal: "Internal",
    },
    date: (value: string) => formatAdminDate(value, "en"),
    clipboardFailed: (detail?: string) =>
      detail === undefined
        ? "Could not copy. Select the text and copy it by hand."
        : `Could not copy: ${endWithStop(detail)} Select the text and copy it by hand.`,
    lifecycleErrors: {
      conflict:
        "Save conflict — this content has a newer version. Use the options above to compare or reload the latest version.",
      not_found: "Content not found. Reload the page.",
      invalid: "Content didn’t pass checks. Review required fields and the URL slug.",
      internal: "Couldn’t finish saving. Try again, or save each panel first.",
      network: "Something went wrong on the server. Please try again.",
      media_cover_internal:
        "An image on an internal update can’t be the cover. Clear “Set as cover”, or choose a public update.",
      session_expired:
        "The upload session expired. Select “Add media” again to upload the image again.",
      media_mismatch:
        "The uploaded file doesn’t match the image you chose. Choose the image again, then upload it.",
      link_exists: "This linked record is already added with this relationship.",
      primary_subject_exists:
        "This content already has a main subject animal. Each item can have only one.",
      slug_taken: "Another item already uses this URL slug. Choose another.",
    },
    /** The message of each error a content logic module throws, by its code. */
    errors: {
      media_type: "Choose a JPG, PNG or WEBP image.",
      media_size: "The image must be 8 MiB or smaller. Choose a smaller image.",
      operation_busy: "Another panel is still saving. Wait a moment, then try again.",
      choose_image: "Choose an image to upload.",
      reload_before_upload: "Reload the content, then upload the image again.",
      no_upload_target: "Could not get a private upload location. Try again.",
      save_before_publish: "Save the content and reload the page, then publish.",
    },
  },
});
