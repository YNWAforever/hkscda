import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerTasksCopy } from "./volunteerTasksCopy";
import { volunteerWorkspaceCopy } from "../volunteerWorkspaceCopy";

/** What the page last did, as a code. The page writes it when it renders, so it follows the language. */
export type AssessmentMessage =
  | { code: "draft_saved" | "preview_ready" | "preview_blocked" | "published" | "requeued" }
  | { code: "run_done"; profiles?: number }
  | { code: "error"; cause: unknown };

/** The name of an assessment scope, `combined`, `cat` or `dog`, as the list of finished assessments writes it. */
function englishScopeName(scope: string): string {
  if (scope === "combined") return "Cats and dogs combined";
  if (scope === "cat" || scope === "dog") return volunteerCommonCopy.en.shelterName(scope);
  return "Other scope";
}

/** Copy for the monthly tier assessment page (`VolunteerAssessments`). */
export const assessmentsCopy = defineAdminCopy({
  zh: {
    title: "每月義工級別評核",
    sections: {
      settings: "評核設定",
      run: "執行評核",
      candidates: "候選核准",
      notifications: "通知狀態",
    },
    intro: "所有時段以香港時間計算。未知歷史覆蓋不會當作零出席，資深義工不會自動降級。",
    fields: {
      regularThreshold: "晉升恆常累積出席",
      seniorYears: "資深年資",
      observationMonths: "資深恆常觀察月數",
      attendanceUnit: "出席計算",
      shelterScope: "場地範圍",
      promotionTrigger: "晉升評核時點",
      regularMinimum: "恆常每月最低",
      seniorMinimum: "資深每月最低",
      regularZeroMonths: "恆常提醒相隔零出席月數",
      seniorZeroMonths: "資深提醒相隔零出席月數",
      assessmentDay: "每月執行日",
      assessmentTime: "香港時間",
      regularTemplate: "恆常提醒內容",
      seniorTemplate: "資深關懷內容",
      queueEnabled: "啟用通知佇列",
      emailConfigured: "電郵（已配置）",
      emailNotConfigured: "電郵（未配置；只可測試）",
      dryRun: "測試模式（只建立佇列，不會發送）",
    },
    undecided: "待決定",
    attendanceUnitOptions: {
      once_per_day: "同日只計一次",
      each_verified_nonoverlapping_session: "每個核實且不重疊時段",
    },
    shelterScopeOptions: { combined: "貓狗合計", separate: "貓狗分開" },
    promotionTriggerOptions: {
      verified_attendance: "每次核實出席",
      monthly_assessment: "每月評核",
    },
    save: "儲存草稿",
    preview: "預覽",
    effectiveLabel: "評核政策生效日期",
    reasonLabel: "發布原因",
    publish: "發布版本",
    run: {
      title: "執行已完成月份",
      monthLabel: "已完成評核月份",
      scopeLabel: "評核範圍",
      scopes: { combined: "貓狗合計", cat: "貓舍", dog: "狗舍" },
      button: "執行評核",
      /** One finished assessment: its month, its scope and that it is finished. */
      line: (month: string, scope: string) => `${month} · ${scope} · 已完成`,
      scopeName: (scope: string) => scope,
    },
    candidates: {
      title: "資深義工候選（須人手核准）",
      text: "候選只按已發布政策及已核實年資／恆常觀察證據產生，不會自動晉升。",
      unnamed: "未命名義工",
      line: (name: string, trigger: string, moment: string) =>
        `義工 ${name} · ${trigger} · ${moment}`,
      triggers: { verified_attendance: "核實出席觸發", other: "每月評核觸發" },
    },
    notifications: {
      title: "通知工作",
      text: "供應商接受不等於已送達；只有回傳送達證據才會顯示已送達。",
      line: (kind: string, status: string, attempts: number) =>
        `${kind} · ${status} · 嘗試 ${attempts}`,
      /** The kind of a notification job: Chinese shows the stored kind. */
      kind: (kind: string) => kind,
      status: (status: string) => status,
      requeue: "重新排隊",
    },
    messages: {
      draft_saved: "草稿已儲存",
      preview_ready: "預覽通過，可以發布",
      preview_blocked: "仍有待決定設定，暫不可發布",
      published: "版本已發布",
      requeued: "通知已重新排隊",
      /** The count of profiles is left out when the server did not say how many there were. */
      run_done: (profiles?: number) =>
        profiles === undefined
          ? "評核完成：通知已排入佇列，未標示為已送達"
          : `評核完成：${profiles} 人；通知已排入佇列，未標示為已送達`,
    },
    /** An error with no message of its own: the Chinese page has never said anything for one. */
    failed: "",
    /** Chinese shows saved settings that zod could not read as zod wrote them, so it has no text here. */
    unreadable: "",
  },
  en: {
    title: volunteerWorkspaceCopy.en.pages.assessments.label,
    sections: {
      settings: "Assessment settings",
      run: "Run the assessment",
      candidates: "Approve candidates",
      notifications: "Notification status",
    },
    intro:
      "All times are in Hong Kong time. Unknown history coverage is not treated as zero attendance, and senior volunteers are not demoted automatically.",
    fields: {
      regularThreshold: "Attendances needed to be promoted to regular",
      seniorYears: "Years of service needed to be senior",
      observationMonths: "Months of observation as regular before senior",
      attendanceUnit: "How attendance is counted",
      shelterScope: "Venue scope",
      promotionTrigger: "When promotion is assessed",
      regularMinimum: "Monthly minimum for regular volunteers",
      seniorMinimum: "Monthly minimum for senior volunteers",
      regularZeroMonths: "Months with no attendance before a reminder to regular volunteers",
      seniorZeroMonths: "Months with no attendance before a reminder to senior volunteers",
      assessmentDay: "Day of the month to run",
      assessmentTime: "Hong Kong time",
      regularTemplate: "Reminder text for regular volunteers",
      seniorTemplate: "Care message for senior volunteers",
      queueEnabled: "Enable the notification queue",
      emailConfigured: "Email (configured)",
      emailNotConfigured: "Email (not configured; test mode only)",
      dryRun: "Test mode (only builds the queue and sends nothing)",
    },
    undecided: "Undecided",
    attendanceUnitOptions: {
      once_per_day: "Once per day",
      each_verified_nonoverlapping_session: "Each verified, non-overlapping time slot",
    },
    shelterScopeOptions: { combined: "Cats and dogs combined", separate: "Cats and dogs separate" },
    promotionTriggerOptions: {
      verified_attendance: "At each verified attendance",
      monthly_assessment: "At the monthly assessment",
    },
    save: "Save draft",
    preview: "Preview",
    effectiveLabel: "Effective date of the assessment policy",
    reasonLabel: "Reason for publishing",
    publish: "Publish version",
    run: {
      title: "Run a completed month",
      monthLabel: "Completed month to assess",
      scopeLabel: "Assessment scope",
      scopes: {
        combined: "Cats and dogs combined",
        cat: volunteerCommonCopy.en.shelterName("cat"),
        dog: volunteerCommonCopy.en.shelterName("dog"),
      },
      button: "Run assessment",
      line: (month: string, scope: string) => `${month} · ${scope} · Completed`,
      scopeName: englishScopeName,
    },
    candidates: {
      title: "Senior volunteer candidates (staff must approve)",
      text: "Candidates are only found from the published policy and verified evidence of years of service and of observation as regular. Nobody is promoted automatically.",
      unnamed: "No name entered",
      line: (name: string, trigger: string, moment: string) => `${name} · ${trigger} · ${moment}`,
      triggers: {
        verified_attendance: "Triggered by a verified attendance",
        other: "Triggered by the monthly assessment",
      },
    },
    notifications: {
      title: "Notification jobs",
      text: "A provider accepting a message does not mean it was delivered. A message only shows as delivered when evidence of delivery comes back.",
      line: (kind: string, status: string, attempts: number) =>
        `${kind} · ${status} · Attempts: ${formatAdminNumber(attempts, "en")}`,
      kind: (kind: string) => volunteerTasksCopy.en.kinds[kind] ?? "Notification",
      status: (status: string) => volunteerTasksCopy.en.statuses[status] ?? "Unknown status",
      requeue: "Queue again",
    },
    messages: {
      draft_saved: "Draft saved.",
      preview_ready: "The preview passed. You can publish.",
      preview_blocked: "Some settings are still undecided, so the policy cannot be published yet.",
      published: "The version is published.",
      requeued: "The notification is queued again.",
      run_done: (profiles?: number) =>
        profiles === undefined
          ? "Assessment finished. Notifications are queued and are not marked as delivered."
          : `Assessment finished for ${pluralCount(profiles, "person", "people")}. Notifications are queued and are not marked as delivered.`,
    },
    failed: "The action failed. Try again.",
    unreadable:
      "The saved assessment settings could not be read. Reload the page. If it happens again, ask an administrator to check the settings.",
  },
});
