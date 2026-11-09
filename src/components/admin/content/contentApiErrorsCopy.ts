import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the content API errors the editor and the create form explain themselves
 * (`contentApiErrors.ts`): the refusal to write outbound copy for an unpublished story, and the
 * reasons of a validation failure, field by field.
 */
export const contentApiErrorsCopy = defineAdminCopy({
  zh: {
    notPublished: "故事尚未發布，未能產生文案或通知草稿。請先發布故事，連結才會指向公開頁面。",
    /** The requested story update itself is not in the published revision (CMS-02). */
    updateNotPublished: "此故事更新尚未發布。請先發布故事，文案才會與公開頁面顯示的更新一致。",
    invalidHeading: "以下欄位需要修改：",
    /** One field's line: its label, then the reason. */
    fieldLine: (label: string, reason: string) => `${label}：${reason}`,
    reasons: {
      required: "必須填寫。",
      tooLong: (max: string) => `不可超過 ${max} 個字元。`,
      tooShort: (min: string) => `最少 ${min} 個字元。`,
      tooLarge: (max: string) => `不可大於 ${max}。`,
      tooSmall: (min: string) => `不可小於 ${min}。`,
      slug: "只可使用小寫英文字母、數字及連字號，並以連字號分隔。",
      ctaUrl: "請填寫 http(s) 網址，或以 / 開頭的站內路徑。",
      invalidChoice: "選項無效，請重新選擇。",
      invalid: "格式不正確。",
      /** The publication-metadata panel's inverted effective-date range (CMS-03). */
      effectiveRange: "結束時間必須遲於生效時間。",
      /** A reason the server wrote in English that has no Chinese text here. */
      unknown: "內容不正確。",
    },
  },
  en: {
    notPublished:
      "This story isn’t published yet, so there is no public page to link to. Publish the story, then generate the copy or notification drafts.",
    /** The requested story update itself is not in the published revision (CMS-02). */
    updateNotPublished:
      "That story update isn’t in the published revision. Publish the story so the copy matches the public page.",
    invalidHeading: "Fix these fields:",
    fieldLine: (label: string, reason: string) => `${label}: ${reason}`,
    reasons: {
      required: "Required.",
      tooLong: (max: string) => `Must be ${max} characters or fewer.`,
      tooShort: (min: string) => `Must be at least ${min} characters.`,
      tooLarge: (max: string) => `Must be ${max} or less.`,
      tooSmall: (min: string) => `Must be ${min} or more.`,
      slug: "Use lowercase letters and numbers, separated by single hyphens.",
      ctaUrl: "Enter an http(s) URL or a site path starting with /.",
      invalidChoice: "Not a valid choice. Choose again.",
      invalid: "Invalid format.",
      /** The publication-metadata panel's inverted effective-date range (CMS-03). */
      effectiveRange: "The end time must be after the start time.",
      unknown: "Invalid value.",
    },
  },
});
