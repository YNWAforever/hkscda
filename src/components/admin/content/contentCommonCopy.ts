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
