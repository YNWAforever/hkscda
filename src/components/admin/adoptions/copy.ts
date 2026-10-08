import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { localizedText } from "../i18n/localizedText";

/**
 * Copy for the adoption case list, the bulk assignment panel, the match panel and the
 * finalisation panel. The page titles, the filters and the table headings of the case list
 * are in `pageCopy/caseCopy.ts`.
 */

/** The selection controls the case list shows to administrators. */
export const caseSelectionCopy = defineAdminCopy({
  zh: {
    select: "選取",
    selectCase: (applicantName: string) => `選取 ${applicantName}`,
    selectThisCase: "選取此個案",
    selectPage: "選取本頁",
    selectAllMatching: "選取全部符合條件（最多 1000 筆）",
    clearSelection: "清除選取",
    lockingSelection: "正在固定選取範圍…",
    cannotSelect: "無法選取",
    filtersChanged: "篩選條件已變更；請重新選取",
    cannotLockSelection: "無法固定選取範圍",
  },
  en: {
    select: "Select",
    selectCase: (applicantName: string) => `Select ${applicantName}`,
    selectThisCase: "Select this case",
    selectPage: "Select this page",
    selectAllMatching: "Select all matching cases (up to 1,000)",
    clearSelection: "Clear selection",
    lockingSelection: "Locking the selection...",
    cannotSelect: "Could not select the case. Try again.",
    filtersChanged: "The filters have changed. Select the cases again.",
    cannotLockSelection: "Could not lock the selection. Try again.",
  },
});

/** Bulk assignment of case owners. */
export const assignmentBulkCopy = defineAdminCopy({
  zh: {
    panelLabel: "領養個案批量分派",
    heading: "批量分派領養個案負責職員",
    intro:
      "只分派個案負責職員，不會批准領養、覆寫配對、發送通知或改變個案狀態。預覽有效 15 分鐘，套用時逐筆重新核對個案版本、階段、等待時間及職員權限。",
    assignee: "負責職員",
    chooseAssignee: "選擇已啟用的職員",
    usersLoadFailed: "無法載入職員名單，請重試。",
    minAgeDays: "最少等待日數",
    needStage: "請先選擇一個仍開放的待處理階段。",
    selectedCount: (count: number) => `已選 ${count} 筆（上限 1000）`,
    processing: "處理中…",
    preview: "建立分派預覽",
    reload: "重新讀取結果",
    unassigned: "未分派",
    reviewTitle: (assignee: string, count: number) => `負責職員：${assignee} · ${count} 筆`,
    savedOperationFailed: "未能讀取已保存的操作，請重新讀取結果。",
    reloadFailed: "未能讀取已保存的操作，請稍後重新讀取結果。",
    previewFailed: "無法建立預覽",
    applyFailed: "無法套用；請重新讀取結果",
  },
  en: {
    panelLabel: "Bulk assignment of adoption cases",
    heading: "Bulk assign case owners",
    intro:
      "This only assigns the case owner. It does not approve adoptions, override matches, send notifications or change case status. The preview is valid for 15 minutes, and each case is checked again when you apply (case version, stage, waiting time and staff permission).",
    assignee: "Case owner",
    chooseAssignee: "Choose an active staff member",
    usersLoadFailed: "Could not load the staff list. Try again.",
    minAgeDays: "Minimum waiting days",
    needStage: "Choose an open pending stage first.",
    selectedCount: (count: number) => `${formatAdminNumber(count, "en")} selected (maximum 1,000)`,
    processing: "Processing...",
    preview: "Preview assignment",
    reload: "Reload result",
    unassigned: "Unassigned",
    reviewTitle: (assignee: string, count: number) =>
      `Case owner: ${assignee} · ${pluralCount(count, "case")}`,
    savedOperationFailed: "Could not load the saved operation. Select Reload result to try again.",
    reloadFailed: "Could not load the saved operation. Wait a moment, then select Reload result.",
    previewFailed: "Could not create the preview. Try again.",
    applyFailed: "Could not apply the assignment. Reload the result to check its state.",
  },
});

/** The matches of one case. */
export const matchPanelCopy = defineAdminCopy({
  zh: {
    title: "配對",
    recorded: (count: number) => `${formatAdminNumber(count, "zh")} 筆紀錄`,
    animal: "動物",
    loadingAnimals: "載入動物中...",
    chooseAnimal: "選擇動物",
    matchStatus: "配對狀態",
    chooseStatus: "選擇狀態",
    notes: "備註",
    optionalNote: "選填協調員備註",
    addMatch: "新增配對",
    status: "狀態",
    approved: "已批核",
    no: "否",
    noMatches: "尚未有配對",
    animalStatuses: {
      available: "可領養",
      fostered: "暫託中",
    },
    animalOption: (name: string, nameEn: string | null, typeLabel: string, statusLabel: string) =>
      `${name}${nameEn ? ` / ${nameEn}` : ""} (${typeLabel} · ${statusLabel})`,
  },
  en: {
    title: "Matches",
    recorded: (count: number) => `${pluralCount(count, "match", "matches")} recorded`,
    animal: "Animal",
    loadingAnimals: "Loading animals...",
    chooseAnimal: "Choose animal",
    matchStatus: "Match status",
    chooseStatus: "Choose status",
    notes: "Notes",
    optionalNote: "Optional coordinator note",
    addMatch: "Add match",
    status: "Status",
    approved: "Approved",
    no: "No",
    noMatches: "No matches yet",
    animalStatuses: {
      available: "Available",
      fostered: "Fostered",
    },
    animalOption: (name: string, nameEn: string | null, typeLabel: string, statusLabel: string) =>
      `${localizedText(name, nameEn, "en")} (${typeLabel} · ${statusLabel})`,
  },
});

/** Finalising an adoption. */
export const finalizationCopy = defineAdminCopy({
  zh: {
    title: "完成領養",
    subtitle: "需要已批核配對及已領養的最終結果。",
    completeRequired: "請完成必填的完成領養欄位。",
    caseNumber: "個案編號",
    approvalDate: "批核日期",
    pickupDate: "接領日期",
    adoptionFee: "領養費",
    recorded: "已記錄成功領養",
    missingApprovedMatch: "完成前請先建立一個已批核配對狀態的配對。",
    missingAdoptedOutcome: "完成前請建立一個 key 為 adopted 的啟用中最終結果狀態。",
    invalidOutcome: "成功領養完成紀錄需要使用已領養結果狀態。",
    approvedMatch: "已批核配對",
    chooseApprovedMatch: "選擇已批核配對",
    finalOutcome: "最終結果",
    chooseOutcome: "選擇結果",
    adoptionFeeHkd: "領養費 HKD",
    optional: "選填",
    finalize: "完成領養",
    fillRequired: "請填寫必填欄位。費用可輸入元及角分。",
    outcome: "結果",
  },
  en: {
    title: "Finalisation",
    subtitle: "Requires an approved match and an adopted final outcome.",
    completeRequired: "Complete the required finalisation fields.",
    caseNumber: "Case number",
    approvalDate: "Approval date",
    pickupDate: "Pickup date",
    adoptionFee: "Adoption fee",
    recorded: "Successful adoption recorded",
    missingApprovedMatch: "Create a match with an approved match status before finalising.",
    missingAdoptedOutcome:
      "Create an active final outcome status with the key adopted before finalising.",
    invalidOutcome: "A successful adoption needs the adopted outcome status.",
    approvedMatch: "Approved match",
    chooseApprovedMatch: "Choose approved match",
    finalOutcome: "Final outcome",
    chooseOutcome: "Choose outcome",
    adoptionFeeHkd: "Adoption fee (HK$)",
    optional: "Optional",
    finalize: "Finalise adoption",
    fillRequired: "Fill in the required fields. Enter the fee in dollars and cents.",
    outcome: "Outcome",
  },
});
