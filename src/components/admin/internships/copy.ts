import { internshipErrorText } from "../../../lib/internships/service";
import { defineAdminCopy } from "../i18n/copy";
import { pluralCount } from "../i18n/format";

/**
 * Copy for the internship application screen: the applications, the review form and the
 * administrators' intake settings. `statuses` holds the five application statuses with the same
 * Chinese words as the public internship page (`internshipStatuses`); a test keeps the two in
 * step. The messages for the intake form's checks and for the API's fixed errors are written once
 * in `lib/internships/service.ts`, and the `errors` here read them from there.
 */

/** The statuses in the order the filter lists them. */
export const INTERNSHIP_STATUS_KEYS = [
  "submitted",
  "needs_information",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export const internshipCopy = defineAdminCopy({
  zh: {
    title: "獸醫學生實習申請",
    intro: "獨立於一般義工級別及時段名額。請按學生證明及申請資料核實身份。",
    searchLabel: "搜尋申請人",
    statusFilterLabel: "申請狀態",
    allStatuses: "全部",
    applicantLabel: "申請人",
    chooseApplication: "選擇申請",
    pagerLabel: "實習申請",
    loading: "載入中…",
    listFailed: "未能載入實習申請",
    detailFailed: "未能載入申請詳情，請重試。",
    retry: "重試",
    statuses: {
      submitted: "待審核",
      needs_information: "待補資料",
      approved: "已批准",
      rejected: "未獲批准",
      withdrawn: "已撤回",
    },
    shelters: { cat: "貓舍", dog: "狗舍" },
    reviewHistory: "審核及補充紀錄",
    recorded: "資料已記錄",
    review: {
      outcome: "處理結果",
      needsInformation: "要求補充資料",
      approve: "批准",
      reject: "不批准",
      reason: "審核理由",
      verified: "已核實獸醫學生身份及所屬院校／課程",
      evidence: "核實證據來源",
      save: "保存審核決定",
    },
    settings: {
      loading: "載入實習收生設定…",
      summary: "管理員收生設定與版本",
      current: (enabled: boolean) =>
        `目前：${enabled ? "接受新申請" : "暫停新申請"}。先儲存草稿，再預覽發布。`,
      titleLabel: "標題",
      enabled: "接受新申請",
      sheltersLegend: "服務場地",
      opensAt: "開放時間",
      closesAt: "截止時間",
      timeHint: "（香港時間，留空不設限制）",
      instructions: "申請指引",
      saveDraft: "儲存草稿",
      preview: "預覽發布",
      beforeAfter: "發布前後",
      open: "開放",
      paused: "暫停",
      sheltersLine: (names: string[]) => `場地：${names.join("、")}`,
      preserved: (count: number) => `保留${count}份既有申請，已提交資料不重寫。`,
      publishReason: "發布理由",
      publish: "確認發布新版本",
      history: "版本歷史",
      duplicate: "複製為新草稿",
    },
    /** The message shown after an action works, by the code the screen keeps. */
    notices: {
      draft_saved: "草稿已儲存，未影響目前申請。",
      published: "新版本已發布；既有申請及核實證據保留。",
    },
    /** The message for each way an action can fail, by the code the screen keeps. */
    errors: {
      settings_failed: "設定未能儲存",
      review_failed: "未能完成審核",
      attachment_failed: "未能開啟私人附件",
      // These come from the intake form's checks and from the API's fixed messages.
      name_required: internshipErrorText("name_required", "zh"),
      shelter_required: internshipErrorText("shelter_required", "zh"),
      closes_before_opens: internshipErrorText("closes_before_opens", "zh"),
      invalid_intake: internshipErrorText("invalid_intake", "zh"),
      invalid_request: internshipErrorText("invalid_request", "zh"),
      forbidden: internshipErrorText("forbidden", "zh"),
      state_conflict: internshipErrorText("state_conflict", "zh"),
      unexpected: internshipErrorText("unexpected", "zh"),
    },
  },
  en: {
    title: "Veterinary student internship applications",
    intro:
      "These applications are separate from volunteer tiers and session places. Verify each applicant's identity against their student proof and application details.",
    searchLabel: "Search applicants",
    statusFilterLabel: "Application status",
    allStatuses: "All",
    applicantLabel: "Applicant",
    chooseApplication: "Choose an application",
    pagerLabel: "Internship applications",
    loading: "Loading…",
    listFailed: "Could not load the internship applications. Refresh the page and try again.",
    detailFailed: "Could not load the application details. Select Retry or refresh the page.",
    retry: "Retry",
    statuses: {
      submitted: "Pending review",
      needs_information: "Needs information",
      approved: "Approved",
      rejected: "Not approved",
      withdrawn: "Withdrawn",
    },
    shelters: { cat: "Cat shelter", dog: "Dog shelter" },
    reviewHistory: "Review and supplement records",
    recorded: "Details recorded",
    review: {
      outcome: "Outcome",
      needsInformation: "Ask for more information",
      approve: "Approve",
      reject: "Do not approve",
      reason: "Review reason",
      verified: "Veterinary student identity and institution or course verified",
      evidence: "Source of verification evidence",
      save: "Save review decision",
    },
    settings: {
      loading: "Loading internship intake settings…",
      summary: "Intake settings and versions (administrators)",
      current: (enabled: boolean) =>
        `Currently: ${enabled ? "accepting new applications" : "new applications paused"}. Save a draft first, then preview the changes before publishing.`,
      titleLabel: "Title",
      enabled: "Accept new applications",
      sheltersLegend: "Shelters",
      opensAt: "Opens at",
      closesAt: "Closes at",
      timeHint: " (Hong Kong time; leave blank for no limit)",
      instructions: "Application instructions",
      saveDraft: "Save draft",
      preview: "Preview changes",
      beforeAfter: "Before and after publishing",
      open: "Open",
      paused: "Paused",
      sheltersLine: (names: string[]) => `Shelters: ${names.join(", ")}`,
      preserved: (count: number) =>
        `${pluralCount(count, "existing application")} ${count === 1 ? "is" : "are"} kept. Submitted details are not rewritten.`,
      publishReason: "Reason for publishing",
      publish: "Publish new version",
      history: "Version history",
      duplicate: "Duplicate as new draft",
    },
    notices: {
      draft_saved: "Draft saved. Current applications are not affected.",
      published: "New version published. Existing applications and verification evidence are kept.",
    },
    errors: {
      settings_failed: "Could not save the settings. Check the form and try again.",
      review_failed: "Could not save the review. Check the form and try again.",
      attachment_failed: "Could not open the private attachment. Try again.",
      name_required: internshipErrorText("name_required", "en"),
      shelter_required: internshipErrorText("shelter_required", "en"),
      closes_before_opens: internshipErrorText("closes_before_opens", "en"),
      invalid_intake: internshipErrorText("invalid_intake", "en"),
      invalid_request: internshipErrorText("invalid_request", "en"),
      forbidden: internshipErrorText("forbidden", "en"),
      state_conflict: internshipErrorText("state_conflict", "en"),
      unexpected: internshipErrorText("unexpected", "en"),
    },
  },
});
