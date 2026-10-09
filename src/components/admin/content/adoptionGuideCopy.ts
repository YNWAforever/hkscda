import type { AdoptionGuideSpecies } from "../../../lib/adoptionGuideReleases/types";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDateTime, formatAdminNumber } from "../i18n/format";

/**
 * Copy for the post-adoption guide releases screen (`AdoptionGuideReleaseManagement`) and the
 * messages of its logic module (`adoptionGuideReleaseLogic`): the five editor steps, why a release
 * cannot be submitted yet, and the errors of a save. The state names (draft, in review and so on)
 * are in `cmsStateCopy`.
 *
 * Some zh-HK texts here have always been English in the Chinese screen: the previous and next
 * buttons, the label of that pager, and the two save errors. They are kept as they were.
 */
export const adoptionGuideCopy = defineAdminCopy({
  zh: {
    eyebrow: "宣傳內容",
    title: "領養後指南",
    intro: "管理中英文 PDF、知識庫內容和發佈流程。",
    add: "新增指南",
    species: { cat: "貓", dog: "狗", general: "一般" },
    filters: {
      label: "篩選領養後指南",
      search: "搜尋",
      species: "物種",
      state: "狀態",
      all: "全部",
    },
    list: {
      heading: "指南列表",
      loading: "載入中...",
      empty: "尚未建立領養後指南",
      /** The line under a guide's name: its species (the stored value in Chinese) and its state. */
      meta: (species: AdoptionGuideSpecies, state: string) => `${species} · ${state}`,
      pagerLabel: "Release pages",
      previous: "Previous",
      next: "Next",
      /** The page number in the pager, such as `2 / 5`. */
      pageOf: (page: number, pages: number) => `${page} / ${pages}`,
    },
    editor: {
      label: "領養後指南編輯器",
      choose: "請從列表選擇或新增一份指南。",
    },
    steps: {
      topic: "主題及物種",
      chinese_pdf: "中文 PDF",
      english_pdf: "English PDF",
      knowledge: "知識庫內容",
      preview: "預覽及發佈",
    },
    sections: {
      topic: "1. 主題及物種",
      chinesePdf: "2. 中文版 PDF",
      englishPdf: "3. English PDF",
      knowledge: "4. 知識庫內容",
      preview: "5. 預覽及提交",
    },
    topic: { topic: "主題", species: "物種" },
    asset: {
      choose: (language: "zh-HK" | "en") =>
        `選擇 ${language === "zh-HK" ? "中文版" : "English"} PDF`,
      placeholder: "選擇已上傳的領養指南 PDF",
      upload: "上傳新 PDF",
      hint: (language: "zh-HK" | "en") =>
        `只可上傳 PDF 檔案；此欄只顯示 adoption_guide 的 ${language} 文件。`,
    },
    knowledge: {
      title: "標題",
      topic: "主題",
      intro: "簡介",
      source: "來源名稱（可選）",
    },
    preview: {
      adoptionCard: "領養頁面預覽",
      knowledgeCard: "知識庫卡片預覽",
      chinese: "中文版",
      english: "English",
      chineseMissing: "中文版 PDF 尚未準備",
      englishMissing: "English PDF 尚未準備",
    },
    /** Why the release cannot be submitted or published yet, by its code. */
    blockers: {
      unsaved_changes: "請先儲存變更，然後重新整理預覽。",
      stale_preview: "請先重新整理預覽，確認目前版本。",
      not_ready: "請先完成預覽中的準備項目。",
    },
    history: {
      label: "發佈歷史",
      heading: "歷史",
      created: (value: string) => `建立：${value}`,
      submitted: (value: string) => `提交：${value}`,
      published: (value: string) => `發佈：${value}`,
      archived: (value: string) => `封存：${value}`,
    },
    actions: {
      save: "儲存草稿",
      submit: "提交審閱",
      withdraw: "撤回提交",
      returnToDraft: "退回草稿",
      publish: "正式發佈",
      refreshPreview: "重新整理預覽",
    },
    /** What a failed save says when the server gave no reason, by its code. */
    errors: {
      conflict: "This release changed elsewhere. Reload before saving again.",
      save_failed: "Unable to save this release.",
    },
  },
  en: {
    eyebrow: "Website content",
    title: "Post-adoption guide",
    intro:
      "Manage the Chinese and English PDFs, the knowledge base content and the publishing workflow.",
    add: "Add guide",
    species: { cat: "Cat", dog: "Dog", general: "General" },
    filters: {
      label: "Filter post-adoption guides",
      search: "Search",
      species: "Species",
      state: "Status",
      all: "All",
    },
    list: {
      heading: "Guide list",
      loading: "Loading...",
      empty: "No post-adoption guides yet",
      meta: (species: AdoptionGuideSpecies, state: string) =>
        `${{ cat: "Cat", dog: "Dog", general: "General" }[species]} · ${state}`,
      pagerLabel: "Release pages",
      previous: "Previous",
      next: "Next",
      pageOf: (page: number, pages: number) =>
        `${formatAdminNumber(page, "en")} / ${formatAdminNumber(pages, "en")}`,
    },
    editor: {
      label: "Post-adoption guide editor",
      choose: "Choose a guide from the list or add a new one.",
    },
    steps: {
      topic: "Topic and species",
      chinese_pdf: "Chinese PDF",
      english_pdf: "English PDF",
      knowledge: "Knowledge base content",
      preview: "Preview and publish",
    },
    sections: {
      topic: "1. Topic and species",
      chinesePdf: "2. Chinese PDF",
      englishPdf: "3. English PDF",
      knowledge: "4. Knowledge base content",
      preview: "5. Preview and submit",
    },
    topic: { topic: "Topic", species: "Species" },
    asset: {
      choose: (language: "zh-HK" | "en") =>
        `Choose the ${language === "zh-HK" ? "Chinese" : "English"} PDF`,
      placeholder: "Choose an uploaded adoption guide PDF",
      upload: "Upload a new PDF",
      hint: (language: "zh-HK" | "en") =>
        `Only PDF files can be uploaded. This list shows only ${language === "zh-HK" ? "Chinese" : "English"} adoption guide documents.`,
    },
    knowledge: {
      title: "Title",
      topic: "Topic",
      intro: "Short introduction",
      source: "Source name (optional)",
    },
    preview: {
      adoptionCard: "Adoption page preview",
      knowledgeCard: "Knowledge base card preview",
      chinese: "Chinese",
      english: "English",
      chineseMissing: "Chinese PDF not ready yet",
      englishMissing: "English PDF not ready yet",
    },
    blockers: {
      unsaved_changes: "Save your changes, then refresh the preview.",
      stale_preview: "Refresh the preview to confirm the current version.",
      not_ready: "Complete the items listed in the preview first.",
    },
    history: {
      label: "Publication history",
      heading: "History",
      created: (value: string) => `Created: ${formatAdminDateTime(value, "en")}`,
      submitted: (value: string) => `Submitted: ${formatAdminDateTime(value, "en")}`,
      published: (value: string) => `Published: ${formatAdminDateTime(value, "en")}`,
      archived: (value: string) => `Archived: ${formatAdminDateTime(value, "en")}`,
    },
    actions: {
      save: "Save draft",
      submit: "Submit for review",
      withdraw: "Withdraw submission",
      returnToDraft: "Return to draft",
      publish: "Publish",
      refreshPreview: "Refresh preview",
    },
    errors: {
      conflict: "This release changed elsewhere. Reload before saving again.",
      save_failed: "Could not save this release. Check the details and try again.",
    },
  },
});
