import { defineAdminCopy } from "../i18n/copy";
import { pluralCount } from "../i18n/format";

/** Copy for the group enquiry screen (`GroupEnquiryManagement`). */
export const groupEnquiryCopy = defineAdminCopy({
  zh: {
    title: "團體查詢",
    intro: "管理團體活動查詢、內部備註、狀態及失敗通知重試。",
    refresh: "重新整理",
    filters: {
      search: "搜尋",
      searchPlaceholder: "團體名稱或聯絡人",
      status: "狀態",
      allStatuses: "全部狀態",
    },
    statuses: {
      new: "新查詢",
      in_progress: "處理中",
      resolved: "已解決",
      closed: "已結案",
    },
    activityTypes: {
      group_workshop: "團體工作坊",
      school_talk: "學校講座",
      shelter_visit: "中心參觀",
      other: "其他",
    },
    notifications: {
      pending: "待發送",
      sent: "已發送",
      failed: "發送失敗",
    },
    columns: {
      organisation: "團體",
      activity: "活動類型",
      status: "狀態",
      notification: "通知",
      created: "查詢日期",
    },
    about: (count: number) => `約 ${count} 人`,
    empty: "沒有符合條件的團體查詢。",
    pagerLabel: "團體查詢",
    /** What went wrong when the update of an enquiry failed. */
    updateErrors: {
      conflict: "資料已被其他職員更新，請重新整理頁面後再試。",
      failed: "更新失敗，請稍後再試。",
    },
    detail: {
      activityType: "活動類型",
      otherDescription: (text: string) => `（${text}）`,
      participants: "人數",
      notProvided: "未提供",
      preferredDates: "期望日期",
      message: "查詢內容",
      notificationFailed: (error: string | null) => `通知發送失敗：${error ?? "未提供錯誤訊息"}`,
      notes: "內部備註",
      notesPlaceholder: "只有職員看到，例如跟進安排或聯絡紀錄",
      updateStatus: "更新狀態並儲存備註：",
      resend: "重新發送通知",
    },
  },
  en: {
    title: "Group enquiries",
    intro:
      "Manage group activity enquiries, internal notes, statuses and retries of failed notifications.",
    refresh: "Refresh",
    filters: {
      search: "Search",
      searchPlaceholder: "Group name or contact person",
      status: "Status",
      allStatuses: "All statuses",
    },
    statuses: {
      new: "New",
      in_progress: "In progress",
      resolved: "Resolved",
      closed: "Closed",
    },
    activityTypes: {
      group_workshop: "Group workshop",
      school_talk: "School talk",
      shelter_visit: "Centre visit",
      other: "Other",
    },
    notifications: {
      pending: "Waiting to send",
      sent: "Sent",
      failed: "Failed to send",
    },
    columns: {
      organisation: "Group",
      activity: "Activity type",
      status: "Status",
      notification: "Notification",
      created: "Enquiry date",
    },
    about: (count: number) => `About ${pluralCount(count, "person", "people")}`,
    empty: "No group enquiries match your filters.",
    pagerLabel: "Group enquiries",
    updateErrors: {
      conflict: "Another staff member updated this enquiry. Refresh the page and try again.",
      failed: "Could not update the enquiry. Try again later.",
    },
    detail: {
      activityType: "Activity type",
      otherDescription: (text: string) => ` (${text})`,
      participants: "Participants",
      notProvided: "Not provided",
      preferredDates: "Preferred dates",
      message: "Enquiry",
      notificationFailed: (error: string | null) =>
        `The notification failed to send: ${error ?? "no error message was provided"}`,
      notes: "Internal notes",
      notesPlaceholder: "Visible to staff only, such as follow-up plans or contact records",
      updateStatus: "Update the status and save the notes:",
      resend: "Resend notification",
    },
  },
});
