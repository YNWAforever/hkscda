import { defineAdminCopy } from "../i18n/copy";
import { pluralCount } from "../i18n/format";

/** Copy for today's volunteer tasks and notifications (`VolunteerTasks`). */
export const volunteerTasksCopy = defineAdminCopy({
  zh: {
    title: "義工今日待辦與通知",
    intro: "記錄聯絡及跟進結果不會更改資格、名額或批准結果，也不等同訊息已送達。",
    calendarLink: "月曆：查看缺人、資格例外及場次詳情",
    steps: { pending: "待審批", contact: "聯絡跟進", notifications: "通知狀態" },
    loading: "載入中…",
    loadFailed: "未能載入待辦。",
    reload: "重新載入",
    pending: {
      title: "待審批",
      none: "目前沒有待審批報名。",
    },
    open: (title: string | undefined) => `開啟${title || "相關工作"}`,
    contact: {
      title: "待聯絡／核實",
      none: "目前沒有未完成跟進。",
      record: "記錄跟進結果",
      result: "處理結果與聯絡紀錄",
      complete: "完成此項跟進",
    },
    /** What a follow-up or notification is about, by its kind. */
    kinds: {
      volunteer_booking_changed: "報名／取消／條款更新",
      volunteer_qualification_review: "資格例外待核實",
      volunteer_operation_changed: "團體／改期跟進",
      volunteer_policy_contact: "政策／時間變更：聯絡已報名人士",
      volunteer_monthly_assessment_notification: "月度出席提示",
      volunteer_policy_reminder: "服務提醒",
    } as Record<string, string>,
    otherFollowUp: "營運跟進",
    otherNotification: "通知",
    notifications: {
      title: "通知處理狀態",
      none: "目前沒有通知工作。",
      line: (kind: string, status: string, attempts: number | undefined) =>
        `${kind} · ${status} · 已嘗試 ${attempts ?? ""} 次`,
      reason: (text: string) => `原因：${text}`,
      retry: "重試此通知",
    },
    /** How far the handling of a notification has got. */
    statuses: {
      queued: "等候處理",
      claimed: "處理中",
      failed: "失敗",
      provider_accepted: "供應商已接收",
      delivered: "已有送達證據",
    } as Record<string, string>,
    otherStatus: "待核實",
  },
  en: {
    title: "Volunteer tasks and notifications for today",
    intro:
      "Recording a contact or follow-up result does not change qualifications, places or approval results, and does not mean a message was delivered.",
    calendarLink: "Calendar: see shortfalls, qualification exceptions and session details",
    steps: {
      pending: "Awaiting approval",
      contact: "Contact follow-up",
      notifications: "Notification status",
    },
    loading: "Loading…",
    loadFailed: "Could not load the tasks. ",
    reload: "Reload",
    pending: {
      title: "Awaiting approval",
      none: "No registrations are awaiting approval.",
    },
    open: (title: string | undefined) => `Open ${title || "related task"}`,
    contact: {
      title: "To contact or verify",
      none: "No follow-ups are outstanding.",
      record: "Record follow-up result",
      result: "Result and contact record",
      complete: "Complete this follow-up",
    },
    kinds: {
      volunteer_booking_changed: "Registration, cancellation or terms update",
      volunteer_qualification_review: "Qualification exception to verify",
      volunteer_operation_changed: "Group or rescheduling follow-up",
      volunteer_policy_contact: "Policy or time change: contact registered volunteers",
      volunteer_monthly_assessment_notification: "Monthly attendance reminder",
      volunteer_policy_reminder: "Service reminder",
    },
    otherFollowUp: "Operations follow-up",
    otherNotification: "Notification",
    notifications: {
      title: "Notification handling status",
      none: "No notification jobs.",
      line: (kind: string, status: string, attempts: number | undefined) =>
        `${kind} · ${status} · Attempted ${pluralCount(attempts ?? 0, "time")}`,
      reason: (text: string) => `Reason: ${text}`,
      retry: "Retry this notification",
    },
    statuses: {
      queued: "Waiting to be handled",
      claimed: "In progress",
      failed: "Failed",
      provider_accepted: "Accepted by provider",
      delivered: "Delivery evidence received",
    },
    otherStatus: "Awaiting verification",
  },
});
