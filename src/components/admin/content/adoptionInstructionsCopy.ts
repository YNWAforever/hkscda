import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDateTime } from "../i18n/format";

/** The name of each part of the page content in a field's label, by the key in its path. */
const ZH_FIELD_LABELS: Record<string, string> = {
  hero: "頁首",
  fees: "領養費用",
  estates: "可養狗屋苑",
  guides: "領養後指南",
  rules: "領養規則",
  care: "動物照顧須知",
  eyebrow: "引題",
  title: "標題",
  description: "簡介",
  sectionTitle: "章節標題",
  dogTitle: "狗隻標題",
  catTitle: "貓隻標題",
  itemLabel: "項目欄名",
  amountLabel: "費用欄名",
  notice: "費用備註",
  introduction: "介紹",
  estateLabel: "屋苑欄名",
  districtLabel: "地區欄名",
  notesLabel: "備註欄名",
  emptyState: "無資料提示（後接聯絡我們連結）",
  generalTitle: "一般指南標題",
  zhHkActionLabel: "中文下載按鈕",
  enActionLabel: "英文下載按鈕",
  cat: "貓隻",
  dog: "狗隻",
};

const EN_FIELD_LABELS: Record<string, string> = {
  hero: "Page header",
  fees: "Adoption fees",
  estates: "Dog-friendly estates",
  guides: "Post-adoption guides",
  rules: "Adoption rules",
  care: "Animal care guidelines",
  eyebrow: "Lead-in",
  title: "Title",
  description: "Short description",
  sectionTitle: "Section title",
  dogTitle: "Dogs title",
  catTitle: "Cats title",
  itemLabel: "Item column heading",
  amountLabel: "Amount column heading",
  notice: "Fee note",
  introduction: "Introduction",
  estateLabel: "Estate column heading",
  districtLabel: "District column heading",
  notesLabel: "Note column heading",
  emptyState: "No-data message (followed by the contact us link)",
  generalTitle: "General guide title",
  zhHkActionLabel: "Chinese download button",
  enActionLabel: "English download button",
  cat: "Cats",
  dog: "Dogs",
};

function labelPath(labels: Record<string, string>, path: string): string {
  return String(path)
    .split(".")
    .map((key) => labels[key] ?? key)
    .join(" / ");
}

/**
 * Copy for the adoption instructions page editor (the "Page content" tab of the adoption
 * information screen): the field names, the draft and revision workflow and its messages.
 */
export const adoptionInstructionsCopy = defineAdminCopy({
  zh: {
    loading: "正在載入頁面內容…",
    /** Shown when there is no page and the server gave no reason. */
    notLoaded: "未能載入頁面內容。請確認頁面內容資料已建立。",
    heading: "頁面內容",
    introBefore: "編輯中文頁面標題及說明。領養規則及照顧須知的雙語內容，請使用各自的分頁；文件請到",
    introLink: "領養後指南版本",
    introAfter: "管理。",
    /** The status line: the published revision, and whether there is a draft and unsaved work. */
    statusLine: (revisionNumber: number | null, draftVersion: number | null, dirty: boolean) =>
      `已發布修訂 ${revisionNumber ?? "—"} · ${
        draftVersion === null ? "尚未建立草稿" : `草稿版本 ${draftVersion}`
      }${dirty ? " · 尚未儲存" : ""}`,
    lastUpdated: (updatedAt: string, updatedBy: string | null) =>
      `最後更新：${updatedAt} · ${updatedBy ?? "系統"}`,
    conflict: {
      intro: (serverVersion: number | null) =>
        `伺服器草稿版本 ${serverVersion ?? "—"}。請比較本機與伺服器內容，再決定是否採用。`,
      summary: "比較本機與伺服器文字",
      local: "本機：",
      server: "伺服器：",
      useServer: "採用伺服器版本（放棄本機修改）",
    },
    createDraft: "建立草稿",
    fieldsLegend: "中文頁面文字",
    invalidText: "請填寫有效的純文字，並遵守字數限制。",
    issueLine: (path: string, messages: string) => `${path}：${messages}`,
    saveDraft: "儲存草稿",
    previewDraft: "預覽已儲存草稿",
    publish: "發布頁面",
    archiveDraft: "封存草稿（不發布）",
    discardChanges: "放棄未儲存修改",
    history: {
      heading: "版本紀錄",
      restoreBlocked: "請先封存或發布目前草稿，才可將歷史版本還原為新草稿。",
      item: (revisionNumber: number, state: "published" | "archived", publishedAt: string | null) =>
        `修訂 ${revisionNumber} · ${state === "published" ? "已發布" : "已封存"} · ${publishedAt ?? ""}`,
      view: "查看內容",
      restore: "還原此版本",
      loading: "載入版本中…",
      more: "查看更多版本",
      revisionContent: (revisionNumber: number) => `修訂 ${revisionNumber} 內容`,
    },
    /** What the editor says went wrong, by its code. */
    problems: {
      server_updated: "伺服器版本已更新；你的輸入已保留。請複製需要保留的文字，再重新載入。",
      action_failed: "未能完成操作，請稍後再試。",
      reload_failed: "未能重新載入。",
      history_failed: "未能載入更多版本。",
      revision_failed: "未能載入版本內容。",
    },
    /** The name of each part of the page content in a field's label, by the key in its path. */
    fieldLabels: ZH_FIELD_LABELS,
    fieldLabel: (path: string) => labelPath(ZH_FIELD_LABELS, path),
    /** Chinese has always shown the path itself where a field is named in a message or a list. */
    fieldPath: (path: string) => String(path),
  },
  en: {
    loading: "Loading page content…",
    notLoaded:
      "Could not load the page content. Check that the page content has been set up, then reload the page.",
    heading: "Page content",
    introBefore:
      "Edit the Chinese page titles and descriptions. Use the separate tabs for the bilingual adoption rules and care guidelines. To manage documents, go to ",
    introLink: "Post-adoption guide releases",
    introAfter: ".",
    statusLine: (revisionNumber: number | null, draftVersion: number | null, dirty: boolean) =>
      `Published revision ${revisionNumber ?? "—"} · ${
        draftVersion === null ? "No draft yet" : `Draft version ${draftVersion}`
      }${dirty ? " · Unsaved changes" : ""}`,
    lastUpdated: (updatedAt: string, updatedBy: string | null) =>
      `Last updated: ${formatAdminDateTime(updatedAt, "en")} · ${updatedBy ?? "System"}`,
    conflict: {
      intro: (serverVersion: number | null) =>
        `The server draft is version ${serverVersion ?? "—"}. Compare your copy with the server copy, then decide which to use.`,
      summary: "Compare your copy with the server copy",
      local: "Your copy: ",
      server: "Server copy: ",
      useServer: "Use the server version (discard your changes)",
    },
    createDraft: "Create draft",
    fieldsLegend: "Chinese page text",
    invalidText: "Enter valid plain text within the length limit.",
    issueLine: (path: string, messages: string) =>
      `${labelPath(EN_FIELD_LABELS, path)}: ${messages}`,
    saveDraft: "Save draft",
    previewDraft: "Preview saved draft",
    publish: "Publish page",
    archiveDraft: "Archive draft (do not publish)",
    discardChanges: "Discard unsaved changes",
    history: {
      heading: "Revision history",
      restoreBlocked:
        "Archive or publish the current draft before you restore an earlier version as a new draft.",
      item: (revisionNumber: number, state: "published" | "archived", publishedAt: string | null) =>
        `Revision ${revisionNumber} · ${state === "published" ? "Published" : "Archived"}${
          publishedAt === null ? "" : ` · ${formatAdminDateTime(publishedAt, "en")}`
        }`,
      view: "View content",
      restore: "Restore this version",
      loading: "Loading revisions…",
      more: "Show more revisions",
      revisionContent: (revisionNumber: number) => `Revision ${revisionNumber} content`,
    },
    problems: {
      server_updated:
        "The server version has been updated. Your input is kept. Copy any text you want to keep, then reload.",
      action_failed: "Could not complete the action. Try again later.",
      reload_failed: "Could not reload. Try again.",
      history_failed: "Could not load more revisions. Try again.",
      revision_failed: "Could not load the revision content. Try again.",
    },
    fieldLabels: EN_FIELD_LABELS,
    /** A field's label: the names of the parts of its path, joined. */
    fieldLabel: (path: string) => labelPath(EN_FIELD_LABELS, path),
    /** A field named where its path would show: in English by its label, never the raw path. */
    fieldPath: (path: string) => labelPath(EN_FIELD_LABELS, path),
  },
});
