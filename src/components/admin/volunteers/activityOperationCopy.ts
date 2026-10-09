import { volunteerRegistrationStatusLabelsFor } from "../../../lib/volunteers/labels";
import type { VolunteerRegistrationStatus } from "../../../lib/volunteers/types";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/** The kinds of bulk operation, in the order the operation menu lists them. */
export const BULK_OPERATIONS = [
  "generate",
  "copy",
  "edit",
  "rebind",
  "close",
  "cancel",
  "attendance",
] as const;
export type BulkOperation = (typeof BULK_OPERATIONS)[number];

const ENGLISH_HISTORY_ACTIONS: Record<string, string> = {
  "volunteer_activity.create": "Activity created",
  "volunteer_activity.update": "Activity updated",
  "volunteer_activity.clone": "Activity duplicated",
  "volunteer_activity.generated": "Activity generated from a template",
  "volunteer_bulk.generate": "Bulk operation: activities generated",
  "volunteer_bulk.copy": "Bulk operation: activity copied",
  "volunteer_bulk.edit": "Bulk operation: description edited",
  "volunteer_bulk.rebind": "Bulk operation: policy applied",
  "volunteer_bulk.close": "Bulk operation: registration closed",
  "volunteer_bulk.cancel": "Bulk operation: activity cancelled",
  "volunteer_bulk.attendance": "Bulk operation: attendance recorded",
};

/**
 * Copy for the bulk operation form (step 2), its progress (step 3) and the activity detail panel of
 * the activity workspace (`ActivityOperationForm`, `ActivityOperationPanel`, `ActivityDetailSheet`).
 */
export const activityOperationCopy = defineAdminCopy({
  zh: {
    operations: {
      generate: "批量產生活動",
      copy: "複製至指定日期",
      edit: "編輯說明",
      rebind: "套用已發布政策",
      close: "截止報名",
      cancel: "取消活動",
      attendance: "出席紀錄",
    },
    form: {
      label: "批量操作",
      title: "2. 預覽差異及例外",
      action: "操作",
      templates: "選取已發布模板（可多選）",
      templateLine: (name: string, shelter: string, start: string, end: string) =>
        `${name} · ${shelter} · ${start}–${end}`,
      templateOrPolicy: "已發布模板／政策",
      choose: (mode: BulkOperation) => `請選擇${mode === "copy" ? "（可沿用來源模板）" : ""}`,
      generateNote:
        "每個日期按有效政策產生新編號；不複製報名、同意紀錄或出席歷史。複製功能使用第一個鎖定場次。",
      start: "開始",
      end: "結束",
      fourWeeks: "四星期",
      eightWeeks: "八星期",
      weekdays: "星期",
      weekday: (index: number) => `星期${["日", "一", "二", "三", "四", "五", "六"][index]}`,
      excluded: "排除日期（YYYY-MM-DD，以逗號分隔）",
      editNote:
        "只修改標題及說明。容量、資格及政策須選「套用已發布政策」並檢查現有報名影響；時間及收容所變更須在政策設定預覽。",
      newTitle: "新標題",
      newDescription: "新說明",
      attendanceStatus: "出席狀態",
      attendanceOptions: {
        attended: "已出席",
        completed: "已完成服務",
        no_show: "未有出席",
        not_marked: "未記錄（須更正）",
      },
      correction: "更正已有紀錄（保留原因及歷史）",
      reason: "操作原因",
      preview: "預覽影響",
      undecided: "待決定的營運規則不能發布。團體查詢／待確認安排不等於已確認團體。",
    },
    progress: {
      label: "操作進度",
      heading: (operation: string | undefined) => `3. 執行結果 · ${operation ?? ""}`,
      hidePreview: "收起預覽",
      showPreview: "展開預覽",
      refresh: "更新進度",
      saved: (created: string, expires: string) =>
        `已儲存快照：${created}；${expires}前有效。每組獨立交易，同一天不拆組；執行時會重新檢查權限、政策與版本。 關閉頁面後可用本頁網址返回；先更新進度再重試。`,
      eligible: "可執行項目",
      skipped: "略過項目",
      conflicted: "版本衝突",
      failed: "失敗項目／組",
      reviewedAll: (count: number) => `已檢查餘下 ${count} 組新草稿的日期、政策、容量和例外`,
      runSequence: "順序執行已審閱組",
      runningSequence: "順序執行中…",
      sequenceNote: "每組仍逐一呼叫既有交易；遇到衝突、失敗或網絡不確定會停止並讀取狀態。",
      reviewEach: "取消、關閉、政策或容量影響、出席更正及有例外的組須逐組審閱。",
      conflictAlert: "有組別已變更，請重新鎖定範圍並預覽；不要重用舊預覽。",
      technical: "操作技術詳情",
      technicalText: (id: string) => `操作編號 ${id}；最多 100 場。同一天的項目在同一組。`,
      notificationsLabel: "通知及跟進狀態",
      notificationKinds: { staff: "職員跟進", other: "通知" },
      notificationStates: {
        delivered: "已送達",
        failed: "處理失敗",
        completed: "已完成跟進",
        accepted: "供應商已接收（未代表送達）",
        queued: "排隊中",
        waiting: "待跟進",
      },
      notificationLine: (kind: string, state: string, when: string | null) =>
        `${kind}：${state}${when ? ` · ${when}` : ""}`,
      noNotifications: "此操作暫無通知或跟進紀錄。",
      batch: (number: number, date: string, count: number, state: string) =>
        `第 ${number} 組 · ${date} · ${count} 場 · ${state}`,
      policy: (name: string, state: string, approved: number | undefined) =>
        `政策：${name} · ${state} · ${approved === undefined ? "受影響報名人數待核對" : "受影響已確認報名 " + approved + " 人"}`,
      capacity: (current: number | undefined, after: number | undefined) =>
        `容量：${current ?? "未有現值"} → ${after ?? current ?? "未有預覽值"}`,
      after: (title: string, when: string, shelter: string, capacity: number) =>
        `套用後：${title} · ${when}· ${shelter} · 容量 ${capacity}`,
      issueSeparator: "、",
      attendanceEffect: (applied: number, skipped: number) =>
        `出席可更新 ${applied}、略過 ${skipped}`,
      itemTechnical: "項目技術詳情",
      itemTechnicalText: (key: string, template: string, policy: string | null) =>
        `項目 ${key} · 模板 ${template} · 政策版本 ${policy ?? "未綁定"}`,
      transaction: (result: string) => `交易結果：${result}`,
      reviewedBatch: "已檢查本組每個日期及影響",
      retry: "以原操作重試",
      runBatch: "執行此組",
      policyToCheck: "政策版本待核對",
      policyUnbound: "未綁定政策",
    },
    detail: {
      fallbackTitle: "活動詳情",
      description: "查看活動、報名、出席及操作歷史；關閉後保留篩選與頁碼。",
      loading: "正在載入詳情…",
      /** What separates an error message from the button after it: nothing in Chinese, a space in English. */
      errorGap: "",
      retry: "重試",
      edit: "編輯此活動",
      registrations: (total: number) => `報名及出席（${total}）`,
      registrationLine: (name: string, status: string, attendance: string) =>
        `${name} · ${status} · ${attendance}`,
      /** A registration status as the panel has always shown it: the stored value. */
      registrationStatus: (stored: string) => stored,
      attendanceStatus: (stored: string) => stored,
      previousRegistrations: "上一頁報名",
      nextRegistrations: "下一頁報名",
      history: (total: number) => `操作紀錄（${total}）`,
      /** An operation in the history as the panel has always shown it: the stored action. */
      historyAction: (stored: string) => stored,
      historyLine: (when: string, action: string) => `${when} · ${action}`,
      previousHistory: "上一頁紀錄",
      nextHistory: "下一頁紀錄",
      historyPage: (page: number) => `第${page}頁`,
    },
  },
  en: {
    operations: {
      generate: "Generate activities in bulk",
      copy: "Copy to chosen dates",
      edit: "Edit description",
      rebind: "Apply a published policy",
      close: "Close registration",
      cancel: "Cancel activities",
      attendance: "Attendance records",
    },
    form: {
      label: "Bulk operation",
      title: "2. Preview the changes and exceptions",
      action: "Action",
      templates: "Choose published templates (you can choose several)",
      templateLine: (name: string, shelter: string, start: string, end: string) =>
        `${name} · ${shelter} · ${start}–${end}`,
      templateOrPolicy: "Published template or policy",
      choose: (mode: BulkOperation) =>
        `Choose${mode === "copy" ? " (or keep the source template)" : ""}`,
      generateNote:
        "Each date gets a new reference under the policy in effect. Registrations, consent records and attendance history are not copied. Copying uses the first locked session.",
      start: "Start",
      end: "End",
      fourWeeks: "Four weeks",
      eightWeeks: "Eight weeks",
      weekdays: "Weekdays",
      weekday: (index: number) =>
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index],
      excluded: "Excluded dates (YYYY-MM-DD, separated by commas)",
      editNote:
        "This only changes the title and the description. To change capacity, qualifications or policy, choose Apply a published policy and check the effect on existing registrations. Changes to time and shelter must be previewed in the policy settings.",
      newTitle: "New title",
      newDescription: "New description",
      attendanceStatus: "Attendance status",
      attendanceOptions: {
        attended: "Attended",
        completed: "Service completed",
        no_show: "Did not attend",
        not_marked: "Not recorded (needs a correction)",
      },
      correction: "Correct an existing record (the reason and history are kept)",
      reason: "Reason for the action",
      preview: "Preview impact",
      undecided:
        "Operating rules that are still undecided cannot be published. A group enquiry or an arrangement awaiting confirmation is not a confirmed group.",
    },
    progress: {
      label: "Operation progress",
      heading: (operation: string | undefined) => `3. Result · ${operation ?? ""}`,
      hidePreview: "Hide preview",
      showPreview: "Show preview",
      refresh: "Refresh progress",
      saved: (created: string, expires: string) =>
        `Snapshot saved ${created} and valid until ${expires}. Each batch is its own transaction, and items on the same day stay in one batch. Permissions, policy and versions are checked again when it runs. If you close the page, return to it from this page's address. Refresh the progress before you retry.`,
      eligible: "Items that can run",
      skipped: "Skipped items",
      conflicted: "Version conflicts",
      failed: "Failed items or batches",
      reviewedAll: (count: number) =>
        `I have checked the dates, policies, capacity and exceptions of the remaining ${pluralCount(count, "new draft batch", "new draft batches")}`,
      runSequence: "Run the reviewed batches in order",
      runningSequence: "Running in order…",
      sequenceNote:
        "Each batch still runs its existing transaction one at a time. If there is a conflict, a failure or an unclear network result, it stops and reads the status.",
      reviewEach:
        "Batches that cancel or close, affect policy or capacity, correct attendance or have exceptions must be reviewed one by one.",
      conflictAlert:
        "A batch has changed. Lock the range again and preview; do not reuse the old preview.",
      technical: "Operation technical details",
      technicalText: (id: string) =>
        `Operation reference ${id}. Up to 100 sessions. Items on the same day are in the same batch.`,
      notificationsLabel: "Notification and follow-up status",
      notificationKinds: { staff: "Staff follow-up", other: "Notification" },
      notificationStates: {
        delivered: "Delivered",
        failed: "Failed",
        completed: "Follow-up completed",
        accepted: "Accepted by the provider (not the same as delivered)",
        queued: "Queued",
        waiting: "Awaiting follow-up",
      },
      notificationLine: (kind: string, state: string, when: string | null) =>
        `${kind}: ${state}${when ? ` · ${when}` : ""}`,
      noNotifications: "No notification or follow-up records for this operation yet.",
      batch: (number: number, date: string, count: number, state: string) =>
        `Batch ${formatAdminNumber(number, "en")} · ${date} · ${pluralCount(count, "session")} · ${state}`,
      policy: (name: string, state: string, approved: number | undefined) =>
        `Policy: ${name} · ${state} · ${approved === undefined ? "Affected registrations to check" : "Confirmed registrations affected: " + formatAdminNumber(approved, "en")}`,
      capacity: (current: number | undefined, after: number | undefined) =>
        `Capacity: ${current ?? "no current value"} → ${after ?? current ?? "no preview value"}`,
      after: (title: string, when: string, shelter: string, capacity: number) =>
        `After: ${title} · ${when} · ${shelter} · Capacity ${capacity}`,
      issueSeparator: " ",
      attendanceEffect: (applied: number, skipped: number) =>
        `Attendance can be updated for ${formatAdminNumber(applied, "en")} and is skipped for ${formatAdminNumber(skipped, "en")}`,
      itemTechnical: "Item technical details",
      itemTechnicalText: (key: string, template: string, policy: string | null) =>
        `Item ${key} · Template ${template} · Policy version ${policy ?? "not linked"}`,
      transaction: (result: string) => `Transaction result: ${result}`,
      reviewedBatch: "I have checked every date and effect in this batch",
      retry: "Retry as the same operation",
      runBatch: "Run this batch",
      policyToCheck: "Policy version to check",
      policyUnbound: "No policy linked",
    },
    detail: {
      fallbackTitle: "Activity details",
      description:
        "See the activity, registrations, attendance and operation history. Filters and page numbers are kept when you close this.",
      loading: "Loading details…",
      errorGap: " ",
      retry: "Retry",
      edit: "Edit this activity",
      registrations: (total: number) =>
        `Registrations and attendance (${formatAdminNumber(total, "en")})`,
      registrationLine: (name: string, status: string, attendance: string) =>
        `${name} · ${status} · ${attendance}`,
      registrationStatus: (stored: string) =>
        volunteerRegistrationStatusLabelsFor("en")[stored as VolunteerRegistrationStatus] ??
        "Unknown",
      attendanceStatus: (stored: string) =>
        (volunteerCommonCopy.en.attendance as Record<string, string>)[stored] ?? "Unknown",
      previousRegistrations: "Previous registrations",
      nextRegistrations: "Next registrations",
      history: (total: number) => `Operation history (${formatAdminNumber(total, "en")})`,
      historyAction: (stored: string) => ENGLISH_HISTORY_ACTIONS[stored] ?? "Other action",
      historyLine: (when: string, action: string) => `${when} · ${action}`,
      previousHistory: "Previous history",
      nextHistory: "Next history",
      historyPage: (page: number) => `Page ${formatAdminNumber(page, "en")}`,
    },
  },
});
