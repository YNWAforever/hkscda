import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { volunteerWorkspaceCopy } from "../volunteerWorkspaceCopy";

/** A figure the preview may not have: blank when the server sent none, grouped like the rest. */
const figure = (value: number | undefined) =>
  value === undefined ? "" : formatAdminNumber(value, "en");

/**
 * Copy for group requests and volunteer rescheduling (`VolunteerOperations`, `OperationPreview`).
 * The same screen is also the public page for volunteers, which always shows the Chinese half.
 */
export const volunteerOperationsCopy = defineAdminCopy({
  zh: {
    title: "團體申請及義工改期",
    /** Shown to staff while the browser checks who is signed in (the wording of the supporter page). */
    checkingSignIn: "正在驗證登入狀態…",
    intro: "所有時間為香港時間。團體查詢不等於已確認團體；確認及改期均重新檢查當前政策和名單。",
    backPublic: "返回義工服務",
    backAdmin: "返回義工月曆",
    stepsLabel: "本頁步驟",
    steps: {
      create: "團體加入場次",
      records: "團體記錄",
      reschedule: "個人改期",
    },
    loading: "讀取資料中…",
    /** Shown when a failed action gave no message. */
    notDone: "操作未完成，請重新檢查。",
    /** The notice under the heading, kept as a code by the screen. */
    notices: {
      previewReady: "預覽完成；請核對下方資料後確認。",
      requested: "團體申請已建立，尚未計入已確認人數。",
      applied: "變更已完成，名單及場次資料已更新。",
    },
    create: {
      title: "把團體查詢加入指定場次",
      note: "我們會保存本次提交的聯絡資料。提交後仍待職員核實。",
      enquiry: "已有團體查詢",
      choose: "請選擇",
      session: "希望參加的場次",
      size: "團體人數",
      submit: "提交待確認團體",
      noEnquiries: "未有與此已驗證電郵相符的團體查詢。請先提交團體查詢，或聯絡職員協助。",
    },
    records: {
      title: "團體申請記錄",
      line: (organisation: string, headcount: number, status: string, session: string) =>
        `${organisation} · ${headcount} 人 · ${status} · ${session}`,
      statuses: { pending: "待確認", confirmed: "已確認", cancelled: "已取消" },
      none: "尚未有團體申請。",
      originalSession: "原場次",
    },
    staff: {
      title: "確認團體、調整人數或取消",
      request: "團體申請",
      action: "操作",
      confirm: "確認／調整人數",
      cancel: "取消團體",
      size: "確認人數",
      lateAck: "如已過團體凍結截點，確認已人工核對此臨時變更",
      preview: "預覽團體影響",
    },
    reschedule: {
      title: "義工改期",
      note: "確認改期前會保留原有預約。我們會再次核對目的場次的資格、名額及條款；未能改期時，原有預約不受影響。",
      registration: "現有報名",
      destination: "目的場次",
      role: "目的職務",
      preview: "預覽改期影響",
    },
    preview: {
      title: "確認此變更",
      group: (headcount: number | undefined, capacity: number | undefined, scenario: string) =>
        `團體總人數：${headcount ?? ""}；可供義工使用的總位：${capacity ?? ""}；情況：${scenario}。`,
      scenarios: { confirmed_group: "A 有團體", other: "B 無團體" },
      late: "這是凍結截點後的人工核對變更。",
      move: (capacity: number | undefined, remaining: number | undefined) =>
        `目的場次總位 ${capacity ?? ""}，目前剩餘 ${remaining ?? ""}。確認前伺服器會再次檢查。`,
      terms: "目的場次條款",
      accept: "我已閱讀並同意目的場次條款",
      staffCannotAccept: "請義工本人登入改期頁面閱讀及同意目的場次條款，職員不能代為同意。",
      reason: "變更原因",
      apply: "確認套用變更",
    },
  },
  en: {
    title: volunteerWorkspaceCopy.en.pages.operations.label,
    checkingSignIn: "Checking your sign-in…",
    intro:
      "All times are Hong Kong time. A group enquiry is not a confirmed group. Confirming and rescheduling both check the current policy and list again.",
    backPublic: "Back to volunteer services",
    backAdmin: "Back to the volunteer calendar",
    stepsLabel: "Steps on this page",
    steps: {
      create: "Add group to session",
      records: "Group records",
      reschedule: "Individual rescheduling",
    },
    loading: "Loading…",
    notDone: "The action was not completed. Check the details and try again.",
    notices: {
      previewReady: "Preview ready. Check the details below, then confirm.",
      requested: "Group request created. It is not yet counted in the confirmed numbers.",
      applied: "Change applied. The list and the session details are updated.",
    },
    create: {
      title: "Add a group enquiry to a session",
      note: "We keep the contact details submitted this time. Staff still need to verify the request after you submit it.",
      enquiry: "Existing group enquiry",
      choose: "Choose",
      session: "Session to join",
      size: "Group size",
      submit: "Submit group for confirmation",
      noEnquiries:
        "No group enquiry matches this verified email. Submit a group enquiry first or ask staff for help.",
    },
    records: {
      title: "Group request records",
      line: (organisation: string, headcount: number, status: string, session: string) =>
        `${organisation} · ${pluralCount(headcount, "person", "people")} · ${status} · ${session}`,
      statuses: {
        pending: "Awaiting confirmation",
        confirmed: "Confirmed",
        cancelled: "Cancelled",
      },
      none: "No group requests yet.",
      originalSession: "Original session",
    },
    staff: {
      title: "Confirm, change the size of or cancel a group",
      request: "Group request",
      action: "Action",
      confirm: "Confirm or change size",
      cancel: "Cancel group",
      size: "Confirmed size",
      lateAck:
        "If the group freeze cut-off has passed, confirm you have checked this late change by hand",
      preview: "Preview group impact",
    },
    reschedule: {
      title: "Volunteer rescheduling",
      note: "The original booking is kept until you confirm the new one. We check the destination session's qualifications, places and terms again. If rescheduling fails, the original booking is not affected.",
      registration: "Current registration",
      destination: "Destination session",
      role: "Destination role",
      preview: "Preview rescheduling impact",
    },
    preview: {
      title: "Confirm this change",
      group: (headcount: number | undefined, capacity: number | undefined, scenario: string) =>
        `Total group size: ${figure(headcount)}. Total places available to volunteers: ${figure(capacity)}. Scenario: ${scenario}.`,
      scenarios: { confirmed_group: "A, with a group", other: "B, without a group" },
      late: "This is a change checked by hand after the freeze cut-off.",
      move: (capacity: number | undefined, remaining: number | undefined) =>
        `The destination session has ${figure(capacity)} places in total and ${figure(remaining)} left. The server checks again before confirming.`,
      terms: "Destination session terms",
      accept: "I have read and agree to the destination session terms",
      staffCannotAccept:
        "The volunteer must sign in to the rescheduling page to read and agree to the destination session terms. Staff cannot agree on their behalf.",
      reason: "Reason for the change",
      apply: "Confirm and apply the change",
    },
  },
});
