import { defineAdminCopy } from "../i18n/copy";

export const volunteerHourlyRetryCopy = defineAdminCopy({
  zh: {
    open: "重跑本時段工作",
    title: "確認重跑義工背景工作",
    consequence: (when: string) =>
      `重跑 ${when} 的失敗工作可能產生場次、處理名額、候補及出席評核，並可能發出通知。請先查明失敗原因，再填寫重跑理由。`,
    confirm: "確認重跑",
    complete: "本時段工作已完成；已重新載入狀態。",
    refreshFailed: "工作已完成，但未能刷新狀態，請重新整理。",
    conflict: "工作狀態已變，請取消並重新整理後再確認。",
    unavailable: "重跑功能暫未可用，請聯絡管理員。",
    forbidden: "沒有重跑權限，請取消並重新登入。",
    invalid: "請檢查重跑理由，或取消並重新整理後再確認。",
    failed: "未能確認工作完成。請先重新整理及檢查狀態。",
  },
  en: {
    open: "Rerun this hour's job",
    title: "Confirm volunteer job rerun",
    consequence: (when: string) =>
      `Rerunning the failed job for ${when} may generate sessions, process places, waitlists and attendance assessments, and send notifications. Check the cause of failure first, then enter a reason.`,
    confirm: "Confirm rerun",
    complete: "This hour's job completed; the status has been refreshed.",
    refreshFailed: "The job completed, but the status could not be refreshed. Reload the page.",
    conflict: "The job has changed. Cancel, refresh the page and confirm again.",
    unavailable: "Job rerun is currently unavailable. Contact an administrator.",
    forbidden: "You do not have rerun permission. Cancel and sign in again.",
    invalid: "Check the reason, or cancel and refresh the page before confirming again.",
    failed: "Job completion could not be confirmed. Reload the page and check the status first.",
  },
});
