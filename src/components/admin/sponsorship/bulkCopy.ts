import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/**
 * Copy for the bulk follow-up assignment panel on the pledge list, and for the reminder draft
 * panel in the pledge detail drawer. The preview and results tables the bulk panel opens are in
 * `bulk/copy.ts`. The text of a reminder draft itself is outward copy and is not here: it comes
 * from the server in the supporter's own language.
 */

/** Bulk assign the sponsorship follow-up owner. */
export const followupBulkCopy = defineAdminCopy({
  zh: {
    panelLabel: "助養跟進批量分派",
    heading: "批量分派助養跟進",
    intro:
      "只改負責職員；不確認付款、不審核憑證、不發送提醒。預覽有效 15 分鐘；套用時逐筆檢查狀態、版本及職員權限。",
    ownerLabel: "負責職員",
    ownerAria: "批量分派負責職員",
    chooseOwner: "選擇已啟用的職員",
    pickerFailed: "無法載入職員名單，請重試。",
    selectedCount: (count: number) => `已選 ${count} 筆（上限 1000）`,
    processing: "處理中…",
    preview: "建立分派預覽",
    reload: "重新讀取結果",
    unassigned: "未分派",
    reviewTitle: (assignee: string, count: number) => `負責職員：${assignee} · ${count} 筆`,
    /** The message for each way the panel can fail, by the code the panel keeps. */
    errors: {
      restore_failed: "未能讀取已保存的操作，請重新讀取結果。",
      reload_failed: "未能讀取已保存的操作，請稍後重新讀取結果。",
      preview_failed: "無法建立預覽",
      apply_failed: "無法套用；請重新讀取結果",
    },
  },
  en: {
    panelLabel: "Bulk follow-up assignment for sponsorships",
    heading: "Bulk assign sponsorship follow-up",
    intro:
      "This only changes the follow-up owner. It does not confirm payments, review proofs or send reminders. The preview is valid for 15 minutes. When you apply, each pledge's status, version and the staff member's permission are checked again.",
    ownerLabel: "Follow-up owner",
    ownerAria: "Bulk follow-up owner",
    chooseOwner: "Choose an enabled staff member",
    pickerFailed: "Could not load the staff list. Try again.",
    selectedCount: (count: number) => `${formatAdminNumber(count, "en")} selected (maximum 1,000)`,
    processing: "Processing…",
    preview: "Preview assignment",
    reload: "Reload result",
    unassigned: "Unassigned",
    reviewTitle: (assignee: string, count: number) =>
      `Follow-up owner: ${assignee} · ${pluralCount(count, "pledge")}`,
    errors: {
      restore_failed: "Could not load the saved operation. Select Reload result to try again.",
      reload_failed:
        "Could not load the saved operation. Wait a moment, then select Reload result.",
      preview_failed: "Could not create the preview. Try again.",
      apply_failed:
        "Could not apply the assignment. Select Reload result to check the current state.",
    },
  },
});

/** The read-only reminder draft for a sponsorship month. */
export const reminderDraftCopy = defineAdminCopy({
  zh: {
    title: "助養月份跟進草稿",
    intro: "只檢視已過月份及已核實付款紀錄；此處不會發送通知。",
    checking: "正在重新核對…",
    checkAgain: "重新核對草稿",
    create: "核對並產生草稿",
    failed: "無法產生草稿；請稍後重試。",
    recipient: (name: string, email: string) => `收件人：${name} <${email}>`,
    ledger: (month: string, amount: string) =>
      `待核對月份：${month}；內部紀錄未核對承諾：${amount}。此數字不是欠款認定，亦不會寫入電郵草稿。`,
    internalOnly: (generatedAt: string) =>
      `只供內部審閱。草稿於 ${generatedAt} 產生；資料或憑證變動後須重新核對。發送需另行審批。`,
    subjectLabel: "主旨草稿",
    bodyLabel: "內容草稿",
    /** Why no draft can be made, by the reason the server gives. */
    unavailable: {
      status: "這項助養尚未處於進行中；請先核實目前狀態。",
      recipient: "沒有有效收件電郵或姓名；請先核實支持者資料。",
      proof_pending: "付款憑證待核實；請先完成審核，避免誤發提醒。",
      invalid_ledger: "月份紀錄不完整；請交由財務核對。",
      no_past_open_period: "沒有已過月份的未核對承諾；目前無需建立草稿。",
      adjustment_review: "月份紀錄包含退款或沖銷；請先由財務核對。",
    },
  },
  en: {
    title: "Sponsorship month follow-up draft",
    intro:
      "This only checks past months and verified payment records. No notification is sent from here.",
    checking: "Checking again…",
    checkAgain: "Check draft again",
    create: "Check and create draft",
    failed: "Could not create the draft. Try again in a moment.",
    recipient: (name: string, email: string) => `Recipient: ${name} <${email}>`,
    ledger: (month: string, amount: string) =>
      `Month to reconcile: ${month}. Unreconciled pledge in the internal records: ${amount}. This figure is not a finding that money is owed, and it is not written into the email draft.`,
    internalOnly: (generatedAt: string) =>
      `For internal review only. The draft was made on ${generatedAt}. Check it again if the details or proofs change. Sending needs separate approval.`,
    subjectLabel: "Draft subject",
    bodyLabel: "Draft body",
    unavailable: {
      status: "This sponsorship is not confirmed yet. Verify its current status first.",
      recipient: "There is no valid recipient email or name. Verify the supporter's details first.",
      proof_pending:
        "A payment proof is waiting to be verified. Finish the review first, so a reminder is not sent by mistake.",
      invalid_ledger: "The month records are incomplete. Ask finance to reconcile them.",
      no_past_open_period:
        "No past month has an unreconciled pledge, so no draft is needed right now.",
      adjustment_review:
        "The month records include a refund or reversal. Ask finance to reconcile them first.",
    },
  },
});
