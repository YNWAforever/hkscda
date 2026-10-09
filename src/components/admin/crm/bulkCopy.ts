import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/**
 * Copy for the three bulk panels on the supporter list: add a tag, assign follow-up owners
 * and preview contact formats. The preview and results tables they open are in `bulk/copy.ts`.
 */

/** Bulk add a tag to supporters. */
export const tagBulkCopy = defineAdminCopy({
  zh: {
    panelLabel: "支持者標籤批量操作",
    heading: "批量加入支持者標籤",
    intro:
      "先固定選取範圍並預覽逐筆差異。套用時會重新核對權限和每筆版本；不會更改身份、同意紀錄或付款。",
    tagLabel: "要加入的標籤",
    tagAria: "批量標籤",
    selectedCount: (count: number) => `已選 ${count} 筆（上限 1000）`,
    processing: "處理中…",
    preview: "建立預覽",
    reload: "重新讀取結果",
    savedOperationFailed: "未能讀取已保存的操作，請重新讀取結果。",
    reloadFailed: "未能讀取已保存的操作，請稍後重新讀取結果。",
    previewFailed: "無法建立預覽",
    applyFailed: "無法套用；請重新讀取結果",
    reviewTitle: (tag: string, count: number) => `標籤：${tag} · ${count} 筆`,
    joinTags: (tags: string[]) => tags.join("、"),
  },
  en: {
    panelLabel: "Bulk tag action for supporters",
    heading: "Bulk add a supporter tag",
    intro:
      "Lock the selection and preview the changes one by one. When you apply, permissions and each record's version are checked again. Roles, consent records and payments are not changed.",
    tagLabel: "Tag to add",
    tagAria: "Bulk tag",
    selectedCount: (count: number) => `${formatAdminNumber(count, "en")} selected (maximum 1,000)`,
    processing: "Processing…",
    preview: "Preview changes",
    reload: "Reload result",
    savedOperationFailed: "Could not load the saved operation. Select Reload result to try again.",
    reloadFailed: "Could not load the saved operation. Wait a moment, then select Reload result.",
    previewFailed: "Could not create the preview. Try again.",
    applyFailed: "Could not apply the tag. Select Reload result to check the current state.",
    reviewTitle: (tag: string, count: number) => `Tag: ${tag} · ${pluralCount(count, "supporter")}`,
    joinTags: (tags: string[]) => tags.join(", "),
  },
});

/** Bulk assign follow-up owners to supporters. */
export const supporterAssignmentCopy = defineAdminCopy({
  zh: {
    panelLabel: "支持者跟進負責人批量操作",
    heading: "批量指派跟進負責人",
    intro:
      "只更新 CRM 跟進負責人。先固定範圍並逐筆預覽，套用時重新核對職員權限及支持者版本；不會發送通知。",
    ownerLabel: "跟進負責人",
    ownerAria: "批量跟進負責人",
    chooseOwner: "選擇職員",
    ownerOption: (email: string, role: string) => `${email}（${role}）`,
    selectedCount: (count: number) => `已選 ${count} 筆（上限 1000）`,
    processing: "處理中…",
    preview: "建立預覽",
    reload: "重新讀取結果",
    unassigned: "未指派",
    pickerFailed: "無法載入可指派的職員",
    savedOperationFailed: "未能讀取已保存的操作，請重新讀取結果。",
    reloadFailed: "未能讀取結果；保留操作參考，請稍後再讀取。",
    previewFailed: "無法建立預覽",
    applyUnconfirmed: "操作回應未確認；先重新讀取已保存結果。",
    applyResultUnconfirmed: "操作結果未確認；保留操作參考，重新讀取成功前暫停套用。",
    reviewTitle: (assignee: string, count: number) => `指派給：${assignee} · ${count} 筆`,
  },
  en: {
    panelLabel: "Bulk follow-up owner action for supporters",
    heading: "Bulk assign follow-up owners",
    intro:
      "This only updates the follow-up owner. Lock the selection and preview each record first. When you apply, staff permissions and supporter versions are checked again. No notifications are sent.",
    ownerLabel: "Follow-up owner",
    ownerAria: "Bulk follow-up owner",
    chooseOwner: "Choose a staff member",
    ownerOption: (email: string, role: string) => `${email} (${role})`,
    selectedCount: (count: number) => `${formatAdminNumber(count, "en")} selected (maximum 1,000)`,
    processing: "Processing…",
    preview: "Preview assignment",
    reload: "Reload result",
    unassigned: "Unassigned",
    pickerFailed: "Could not load the staff list. Try again.",
    savedOperationFailed: "Could not load the saved operation. Select Reload result to try again.",
    reloadFailed:
      "Could not load the result. The operation reference is kept, so wait a moment, then select Reload result.",
    previewFailed: "Could not create the preview. Try again.",
    applyUnconfirmed: "The reply was not confirmed. Reload the saved result first.",
    applyResultUnconfirmed:
      "The result was not confirmed. The operation reference is kept, and Apply stays paused until Reload result works.",
    reviewTitle: (assignee: string, count: number) =>
      `Assigned to: ${assignee} · ${pluralCount(count, "supporter")}`,
  },
});

/** Preview of suggested contact format clean-ups. */
export const contactFormatCopy = defineAdminCopy({
  zh: {
    panelLabel: "支持者聯絡資料格式預覽",
    heading: "聯絡資料格式整理預覽",
    intro:
      "唯讀顯示名稱、電郵及電話的空白／大小寫建議。電郵屬身份資料，必須人工核對；不會修改任何資料、身份或同意紀錄。",
    selectedCount: (count: number) => `已選 ${count} 筆（上限 1000）`,
    preview: "預覽格式建議",
    checking: "正在檢查…",
    previewFailed: "無法預覽資料格式",
    regionLabel: "聯絡資料格式比較",
    columns: {
      supporterId: "支持者 ID",
      status: "狀態",
      current: "目前資料",
      suggestion: "格式建議",
    },
    statuses: {
      suggested: "建議整理",
      manual_review: "身份需人工核對",
      unchanged: "無需整理",
      skipped: "已移除或找不到",
    },
    previous: "上一頁",
    next: "下一頁",
    pageOf: (page: number, pageCount: number) => `第 ${page} / ${pageCount} 頁`,
  },
  en: {
    panelLabel: "Contact format preview for supporters",
    heading: "Contact format clean-up preview",
    intro:
      "Read-only suggestions for spacing and capitalisation in names, emails and phone numbers. Email is identity data, so check it by hand. Nothing is changed: not the details, the roles or the consent records.",
    selectedCount: (count: number) => `${formatAdminNumber(count, "en")} selected (maximum 1,000)`,
    preview: "Preview format suggestions",
    checking: "Checking…",
    previewFailed: "Could not preview the contact formats. Try again.",
    regionLabel: "Contact format comparison",
    columns: {
      supporterId: "Supporter ID",
      status: "Status",
      current: "Current details",
      suggestion: "Suggested format",
    },
    statuses: {
      suggested: "Suggested clean-up",
      manual_review: "Identity needs manual check",
      unchanged: "No clean-up needed",
      skipped: "Removed or not found",
    },
    previous: "Previous",
    next: "Next",
    pageOf: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
  },
});
