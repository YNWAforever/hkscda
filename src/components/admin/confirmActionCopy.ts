import { defineAdminCopy } from "./i18n/copy";

/**
 * Copy for `ConfirmActionDialog`: only the words the dialog owns. The title, the
 * consequence sentence and the confirm verb come from the screen that opens it.
 * The Chinese half reuses wording the admin already shows; the line that would be new
 * (the minimum-length hint) stays empty in Chinese and is drafted for the owner in
 * docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md.
 */
export const confirmActionCopy = defineAdminCopy({
  zh: {
    cancel: "取消",
    // Existing wording: content/adoptionInformationCopy.ts leave.discard.
    discardAndLeave: "捨棄並離開",
    // Existing wording: crm/formCopy.ts discardChanges.
    discardChanges: "放棄更改",
    reasonLabel: "原因",
    reasonHint: (_minLength: number) => "",
    // Existing wording: content/reviewCopy.ts processing.
    working: "處理中…",
    failed: "操作失敗，請稍後再試。",
  },
  en: {
    cancel: "Cancel",
    discardAndLeave: "Discard and leave",
    discardChanges: "Discard changes",
    reasonLabel: "Reason",
    reasonHint: (minLength: number) => `Enter at least ${minLength} characters.`,
    working: "Working…",
    failed: "Could not complete this. Try again.",
  },
});
