import { pledgeSelectionErrorText } from "../../../lib/sponsorshipAdmin/followupBulkSelection";
import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the pledge review list: the proof filter, the follow-up selection controls and the
 * review links. The titles, columns, statuses and totals are in `pageCopy/pledgeCopy.ts`; the
 * detail drawer is in `drawerCopy.ts`.
 */
export const pledgeLaneCopy = defineAdminCopy({
  zh: {
    selectColumn: "選取",
    reviewColumn: "審核",
    /** The accessible name of the row checkbox. */
    selectFollowup: (name: string) => `選取跟進 ${name}`,
    /** The label beside the checkbox on a mobile card. */
    selectFollowupCard: "選取跟進",
    reviewPledge: (name: string) => `審核 ${name}`,
    proofFilterLabel: "憑證審核篩選",
    allProofs: "所有憑證狀態",
    pendingProofs: "待核實憑證",
    selectionLabel: "助養跟進選取",
    selectVisible: "選取本頁待跟進",
    selectAllMatching: "選取全部符合條件（最多 1000 筆）",
    clearSelection: "清除選取",
    filterFirst: "選取全部前，請先篩選「待跟進」。",
    pinning: "正在固定選取範圍…",
    /** The message for each way the selection can fail, by the code the list keeps. */
    errors: {
      select_failed: "無法選取",
      pin_failed: "無法固定選取範圍",
      filter_changed: "篩選條件已變更；請重新選取",
      // These three come from the selection helpers, which keep their own text.
      out_of_range: pledgeSelectionErrorText("out_of_range", "zh"),
      list_changed: pledgeSelectionErrorText("list_changed", "zh"),
      too_many: pledgeSelectionErrorText("too_many", "zh"),
    },
  },
  en: {
    selectColumn: "Select",
    reviewColumn: "Review",
    selectFollowup: (name: string) => `Select ${name} for follow-up`,
    selectFollowupCard: "Select for follow-up",
    reviewPledge: (name: string) => `Review ${name}`,
    proofFilterLabel: "Filter by proof review",
    allProofs: "All proof statuses",
    pendingProofs: "Proofs to verify",
    selectionLabel: "Sponsorship follow-up selection",
    selectVisible: "Select follow-ups on this page",
    selectAllMatching: "Select all matching (up to 1,000)",
    clearSelection: "Clear selection",
    filterFirst: 'To select all matching pledges, first filter by the "Needs follow-up" status.',
    pinning: "Locking the selection…",
    errors: {
      select_failed: "Could not select the pledge. Refresh the page and try again.",
      pin_failed: "Could not lock the selection. Refresh the page and try again.",
      filter_changed: "The filters changed while you were selecting. Select the pledges again.",
      out_of_range: pledgeSelectionErrorText("out_of_range", "en"),
      list_changed: pledgeSelectionErrorText("list_changed", "en"),
      too_many: pledgeSelectionErrorText("too_many", "en"),
    },
  },
});

/** The sponsorship animal search, a picker that matches an animal to a pledge. */
export const animalPickerCopy = defineAdminCopy({
  zh: {
    searchLabel: "搜尋助養動物",
    searchPlaceholder: "名字或動物編號",
    loadFailed: "未能載入可配對動物",
    noCode: "未有公開編號",
  },
  en: {
    searchLabel: "Search sponsorship animals",
    searchPlaceholder: "Name or reference number",
    loadFailed: "Could not load the animals that can be matched. Refresh the page and try again.",
    noCode: "No public reference number",
  },
});
