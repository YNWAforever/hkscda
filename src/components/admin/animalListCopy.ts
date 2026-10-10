import { defineAdminCopy } from "./i18n/copy";
import { formatAdminDateTime, formatAdminDateTimeOrNull, pluralCount } from "./i18n/format";

/**
 * Copy for the animal list and the public photo repair queue. The column headings, the
 * gender and care-status labels and the Workflow, Edit, Confirm and Cancel words the list
 * shares with the rest of the admin are in `i18n/adminCommonCopy.ts`.
 */
export const animalListCopy = defineAdminCopy({
  zh: {
    search: "搜尋名稱或編號",
    archived: "顯示已封存記錄",
    allStatuses: "所有狀態",
    clearFilters: "清除篩選",
    empty: "此分類尚未有動物記錄。",
    noResults: "沒有符合篩選的動物。",
    previous: "上一頁",
    next: "下一頁",
    pagination: "動物列表分頁",
    summary: (total: number, page: number, pageCount: number) =>
      `${total} 筆記錄 · 頁 ${page} / ${pageCount}`,
    archiveFailed: "無法封存，請重試。",
    unarchiveFailed: "無法取消封存，請重試。",
    archive: "封存",
    unarchive: "取消封存",
    archiveHint: "封存後不會在公開網站或預設列表顯示，但所有領養、助養及內部記錄會保留。",
    publicationHeader: "公開狀態",
    publication: {
      draft: "草稿",
      published: "已公開",
      unpublished: "暫停公開",
    },
    needsSpecies: (count: number) =>
      `有 ${count} 筆記錄的品種仍是舊有的「助養」值，需要人手確認為貓或狗。 更改品種不會影響領養／助養刊登範圍。`,
    mediaRepair: {
      heading: "公開相片修復佇列",
      intro:
        "顯示貓狗與內容相片的待處理、處理中及失敗數。失敗項須先修復原因，才可寫入稽核理由並重試。",
      loading: "正在載入佇列…",
      loadFailed: "無法讀取修復佇列。",
      retryLoad: "重試讀取",
      summary: (pending: number, claimed: number, failed: number, minutes: number) =>
        `待處理 ${pending} · 處理中 ${claimed} · 需人工覆核 ${failed} · 最早等待 ${minutes} 分鐘`,
      none: "目前沒有待修復相片。",
      kind: { animal: "動物", content: "內容" },
      status: { pending: "待處理", claimed: "處理中", failed: "需人工覆核" },
      attempt: (attempts: number, errorCode: string | null) =>
        `· 第 ${attempts} 次 · 原因碼：${errorCode ?? "未記錄"}`,
      created: (value: string) => `建立：${formatAdminDateTimeOrNull(value, "zh") ?? value}`,
      nextRetry: (value: string) =>
        `· 下次處理：${formatAdminDateTimeOrNull(value, "zh") ?? value}`,
      review: "覆核並重試",
      reasonLabel: "已修復原因及重試理由",
      confirmFixed: "我已核對並修復失敗原因",
      retryFailed: "無法重試；請重新載入佇列並核對狀態。",
      submitting: "提交中…",
      submit: "記錄理由並重試",
    },
  },
  en: {
    search: "Search name or reference number",
    archived: "Include archived records",
    allStatuses: "All statuses",
    clearFilters: "Clear filters",
    empty: "No animal records in this category yet.",
    noResults: "No animals match these filters.",
    previous: "Previous",
    next: "Next",
    pagination: "Animal list pagination",
    summary: (total: number, page: number, pageCount: number) =>
      `${pluralCount(total, "record")} · Page ${page} of ${pageCount}`,
    archiveFailed: "Could not archive the animal. Try again.",
    unarchiveFailed: "Could not unarchive the animal. Try again.",
    archive: "Archive",
    unarchive: "Unarchive",
    archiveHint:
      "Archived animals are hidden from the public website and the default list, but all adoption, sponsorship and internal records are kept.",
    publicationHeader: "Publication status",
    publication: {
      draft: "Draft",
      published: "Published",
      unpublished: "Unpublished",
    },
    needsSpecies: (count: number) =>
      `Legacy "Sponsor" type to check: ${pluralCount(count, "record")}. A person needs to confirm each one as a cat or a dog. Changing the type does not affect the adoption or sponsorship listing.`,
    mediaRepair: {
      heading: "Public photo repair queue",
      intro:
        "Shows how many cat, dog and content photos are pending, in progress or failed. Fix the cause of a failed item first, then record an audit reason and retry.",
      loading: "Loading the queue...",
      loadFailed: "Could not load the repair queue. Try again.",
      retryLoad: "Retry",
      summary: (pending: number, claimed: number, failed: number, minutes: number) =>
        `Pending ${pending} · In progress ${claimed} · Needs manual review ${failed} · Oldest waiting ${pluralCount(minutes, "minute")}`,
      none: "No photos need repair.",
      kind: { animal: "Animal", content: "Content" },
      status: { pending: "Pending", claimed: "In progress", failed: "Needs manual review" },
      attempt: (attempts: number, errorCode: string | null) =>
        `· Attempt ${attempts} · Reason code: ${errorCode ?? "Not recorded"}`,
      created: (value: string) => `Created: ${formatAdminDateTime(value, "en")}`,
      nextRetry: (value: string) => `· Next attempt: ${formatAdminDateTime(value, "en")}`,
      review: "Review and retry",
      reasonLabel: "Reason for retrying (what you fixed)",
      confirmFixed: "I have checked and fixed the cause of the failure",
      retryFailed: "Could not retry. Reload the queue and check the status.",
      submitting: "Submitting...",
      submit: "Record reason and retry",
    },
  },
});
