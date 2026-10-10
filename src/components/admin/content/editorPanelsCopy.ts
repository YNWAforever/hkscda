import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminDateOrNull, formatAdminNumber } from "../i18n/format";

/**
 * Copy for the panels the content editor is built from: the story update timeline, the linked
 * record picker, the notification drafts, the social media copy and the version history. The
 * editor's own forms are in `editorCopy`; the content types, update kinds and the clipboard
 * message are in `contentCommonCopy`.
 */

/** What a version's operation is called in English (the operations `content_revision` records). */
const REVISION_OPERATION_NAMES: Record<string, string> = {
  create: "Created",
  save_content: "Saved content",
  upsert_profile: "Saved story wall settings",
  create_update: "Added story update",
  create_media: "Added media",
  "media.finalize": "Added media",
  create_link: "Added linked record",
  set_publication_metadata: "Saved publication eligibility",
  archive: "Archived",
  restore: "Restored",
  publish: "Published",
  legacy_backfill: "Imported earlier version",
};

const SOCIAL_STATUS_NAMES: Record<string, string> = {
  draft: "Draft",
  copied: "Copied",
  archived: "Archived",
};

const CHANNEL_NAMES: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

/** What the record search names an animal's type when it shows it under the animal. */
const ANIMAL_TYPE_NAMES: Record<string, string> = {
  cat: "Cat",
  dog: "Dog",
  sponsor: "Sponsor",
};

/** The start of an ISO timestamp, which is how the search sends a volunteer activity's date. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

export const editorPanelsCopy = defineAdminCopy({
  zh: {
    timeline: {
      empty: "尚未有故事更新。",
      createDrafts: "通知草稿",
      creating: "產生中",
      noBody: "沒有正文",
      readBody: "閱讀更新正文",
      loading: "載入中",
      bodyFailed: "無法載入正文，請重試。",
    },
    picker: {
      placeholder: "搜尋名稱或編號",
      label: "搜尋關聯紀錄",
      selected: (label: string) => `已選擇：${label}`,
      /** The line under a search result, as the search sent it; a volunteer activity's date in Hong Kong time. */
      detail: (linkedType: string, detail: string) =>
        linkedType === "volunteer_activity" && ISO_TIMESTAMP.test(detail)
          ? (formatAdminDateOrNull(detail, "zh") ?? detail)
          : detail,
      failed: "未能載入關聯紀錄，請重試。",
    },
    notifications: {
      heading: "通知草稿",
      intro: "給領養人或支持者的手動通知草稿。",
      empty: "尚未有通知草稿。",
      statuses: {
        draft: "草稿",
        copied: "已複製",
        sent_manually: "已人手發送",
        dismissed: "已略過",
      },
      /** The channel is a database value; Chinese shows it as stored. */
      channel: (channel: string) => channel,
      copy: "複製",
      markSent: "已手動送出",
      dismiss: "略過",
    },
    social: {
      heading: "社交平台文案",
      intro: "按平台整理可複製的宣傳文字。",
      generate: "產生文案",
      generating: "產生中",
      empty: "尚未有社交平台文案。",
      platforms: {
        facebook: "Facebook",
        instagram: "Instagram",
        whatsapp: "WhatsApp",
      },
      /** The status is a database value; Chinese shows it as stored. */
      status: (status: string) => status,
      text: "文案",
      hashtags: "標籤（以空格分隔）",
      save: "儲存",
      saving: "儲存中",
      copy: "複製",
      archive: "封存",
    },
    revision: {
      heading: "版本紀錄與比較",
      intro: (version: number | undefined) =>
        `目前已儲存版本 ${version ?? "—"}；還原會建立新草稿，公開版本保持不變。`,
      loadFailed: "無法載入版本紀錄",
      /** The operation is a database value; Chinese shows it as stored. */
      operation: (operation: string) => operation,
      version: (version: number, operation: string, published: boolean) =>
        `版本 ${version} · ${operation}${published ? " · 曾發布" : ""}`,
      latest: "最新版本",
      earlier: "較早版本",
      columns: { field: "欄位", saved: "目前已儲存", selected: "所選版本" },
      fields: { title: "標題", slug: "網址", summary: "摘要", body: "正文" },
      details: "所選版本的故事設定、更新與媒體資料",
      restore: "還原為新草稿",
      restoreConfirm: "將此版本還原為新草稿？公開內容不會改變。",
      restoreFailed: "還原失敗，請重試。",
      children: {
        region: "救援地區",
        notEntered: "未填寫",
        map: "公開地圖",
        noMap: "不顯示",
        address: "內部地址",
        noProfile: "沒有故事設定",
        updates: (count: number) => `故事更新（${count}）`,
        untitledUpdate: "未命名更新",
        media: (count: number) => `媒體（${count}）`,
        untitledImage: "未命名圖片",
        cover: " · 封面",
        links: (count: number) => `關聯紀錄（${count}）`,
        relatedRecord: "相關紀錄",
      },
    },
  },
  en: {
    timeline: {
      empty: "No story updates yet.",
      createDrafts: "Create notification drafts",
      creating: "Creating",
      noBody: "No body text",
      readBody: "Read the update text",
      loading: "Loading",
      bodyFailed: "Could not load the update text. Try again.",
    },
    picker: {
      placeholder: "Search by name or reference number",
      label: "Search linked records",
      selected: (label: string) => `Selected: ${label}`,
      detail: (linkedType: string, detail: string) => {
        if (linkedType === "animal") return ANIMAL_TYPE_NAMES[detail] ?? detail;
        if (linkedType === "volunteer_activity" && ISO_TIMESTAMP.test(detail)) {
          return formatAdminDate(detail, "en");
        }
        return detail;
      },
      failed: "Could not load linked records. Try again.",
    },
    notifications: {
      heading: "Notification drafts",
      intro: "Drafts of notifications for adopters or supporters, sent by hand.",
      empty: "No notification drafts yet.",
      statuses: {
        draft: "Draft",
        copied: "Copied",
        sent_manually: "Sent manually",
        dismissed: "Dismissed",
      },
      channel: (channel: string) => CHANNEL_NAMES[channel] ?? channel,
      copy: "Copy",
      markSent: "Mark as sent",
      dismiss: "Dismiss",
    },
    social: {
      heading: "Social media copy",
      intro: "Promotional text you can copy, organised by platform.",
      generate: "Generate copy",
      generating: "Generating",
      empty: "No social media copy yet.",
      platforms: {
        facebook: "Facebook",
        instagram: "Instagram",
        whatsapp: "WhatsApp",
      },
      status: (status: string) => SOCIAL_STATUS_NAMES[status] ?? status,
      text: "Post text",
      hashtags: "Hashtags (separated by spaces)",
      save: "Save",
      saving: "Saving",
      copy: "Copy",
      archive: "Archive",
    },
    revision: {
      heading: "Version history and comparison",
      intro: (version: number | undefined) =>
        `Current saved version ${version === undefined ? "—" : formatAdminNumber(version, "en")}. Restoring creates a new draft; the public version does not change.`,
      loadFailed: "Could not load the version history",
      operation: (operation: string) => REVISION_OPERATION_NAMES[operation] ?? "Other change",
      version: (version: number, operation: string, published: boolean) =>
        `Version ${formatAdminNumber(version, "en")} · ${operation}${published ? " · Was published" : ""}`,
      latest: "Show latest versions",
      earlier: "Show earlier versions",
      columns: { field: "Field", saved: "Currently saved", selected: "Selected version" },
      fields: { title: "Title", slug: "URL", summary: "Summary", body: "Body" },
      details: "Story wall settings, updates and media in the selected version",
      restore: "Restore as new draft",
      restoreConfirm: "Restore this version as a new draft? Public content will not change.",
      restoreFailed: "Could not restore the version. Try again.",
      children: {
        region: "Rescue region",
        notEntered: "Not entered",
        map: "Public map",
        noMap: "Not shown",
        address: "Internal address",
        noProfile: "No story wall settings",
        updates: (count: number) => `Story updates (${formatAdminNumber(count, "en")})`,
        untitledUpdate: "Untitled update",
        media: (count: number) => `Media (${formatAdminNumber(count, "en")})`,
        untitledImage: "Untitled image",
        cover: " · Cover",
        links: (count: number) => `Linked records (${formatAdminNumber(count, "en")})`,
        relatedRecord: "Related record",
      },
    },
  },
});
