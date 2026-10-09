import {
  localisePolicyMessage,
  localisePolicyReason,
} from "../../../lib/volunteers/policy/messages";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { policyChangeCopy } from "./policyChangeCopy";

/** One item of the problems a preview reports. The database sends a code; older code sent a path and a message. */
type PreviewIssue = { path?: string; message?: string } | string;

/** Copy for the volunteer policy settings screen (`VolunteerPolicySettings`). */
export const policySettingsCopy = defineAdminCopy({
  zh: {
    loadFailed: "未能載入義工政策。",
    loading: "正在載入義工政策…",
    title: "義工政策設定",
    links: {
      sources: "共用來源、場地及資格",
      simulation: "政策模擬",
      daily: "管理全日配額及補位",
    },
    createTemplate: "新增模板（複製目前設定）",
    /** The name a copied template starts with. */
    copyName: (name: string) => `${name}（副本）`,
    intro: (revision: number, dirty: boolean) =>
      `先儲存草稿，再預覽受影響活動。修訂 ${revision}${dirty ? "（尚未儲存）" : ""}`,
    sections: {
      basic: "基本時段與資格",
      rules: "名額及報名規則",
      source: "來源",
      publish: "預覽與發布",
    },
    fields: {
      template: "政策模板",
      name: "名稱",
      venue: "場地",
      startTime: "開始時間",
      endTime: "結束時間",
      location: "地點",
      places: "義工名額",
      minimumAge: "最低年齡",
      noteTitle: "備註標題",
      noteHint: "備註提示",
      credentials: "所需資格（每行一項）",
      tiers: "級別",
    },
    advancedSummary: (roles: number, quotas: number, daily: number, release: number) =>
      `進階規則：職務 ${roles}、級別配額 ${quotas}、每日限制 ${daily}、補位規則 ${release}。這些規則會保留；未解析項目如下。`,
    assessment: {
      title: "每月級別評核",
      text: "評核門檻及通知安排由獨立版本管理。前往級別評核查看目前設定、已發布版本及執行紀錄。",
      link: "管理每月級別評核",
    },
    readiness: { title: "發布準備狀態", none: "沒有未解析設定。" },
    /** Between the name of a setting and what is wrong with it. */
    separator: "：",
    save: "儲存草稿",
    publish: {
      title: "預覽及發布",
      effectiveDate: "生效日期",
      endDate: "結束日期（可留空）",
      reason: "發布原因",
      affected: "受影響活動",
      activityLine: (a: {
        title: string;
        capacity: number;
        approved: number;
        waitlisted: number;
      }) => `${a.title} · 名額 ${a.capacity} · 已批 ${a.approved} · 候補 ${a.waitlisted}`,
      preview: "建立預覽",
      publish: "發布政策",
      previewTitle: (previous: string | undefined, candidate: string) =>
        `預覽：${previous ?? "沒有舊版本"} → ${candidate}`,
      /** A problem the preview reports. */
      issueLine: (issue: PreviewIssue) => {
        const item: { path?: string; message?: string } = typeof issue === "string" ? {} : issue;
        return `${item.path ?? ""}：${item.message ?? ""}`;
      },
      manifestLine: (title: string, capacity: number, conflicts: string) =>
        `${title} · 名額 ${capacity}${conflicts ? " · 衝突：" + conflicts : ""}`,
      /** What separates the conflicts of a session. */
      conflictSeparator: "、",
      /** The name of a conflict between a session and the new policy. */
      conflictName: (code: string) => code,
    },
    limited: {
      before: (limit: number | undefined) =>
        `政策影響選取顯示最接近的 ${limit ?? ""} 個未來場次；全部場次可在 `,
      link: "活動營運中心",
      after: " 依日期查閱及重新綁定。",
    },
    duplicate: { title: "複製已發布版本", button: (date: string) => `${date} · 複製` },
    generate: {
      title: "建立活動",
      dateLabel: "建立活動日期",
      button: "建立當日活動",
    },
    unsaved: "尚有未儲存變更；離開頁面前請先儲存。",
    notices: {
      draft_saved: () => "草稿已儲存。",
      published: (count: number) => "已發布，更新 " + count + " 個活動。",
      generated: () => "活動建立指令已完成。",
    },
    errors: {
      save_and_date: "請先儲存草稿並選擇生效日期。",
      preview_and_reason: "請先預覽並填寫發布原因。",
      conflict: "草稿已被其他管理員更新，請重新載入。",
      failed: "操作失敗。",
      // Chinese shows a draft that zod refused as zod wrote it, so these have no Chinese text.
      invalidHeader: "",
      invalidLine: (_name: string, _text: string) => "",
      moreProblems: (_count: number) => "",
      issueTexts: {} as Record<string, string>,
    },
    confirmSwitch: "目前有未儲存修改，確定切換模板？",
  },
  en: {
    loadFailed: "Could not load the volunteer policy. Reload the page or try again later.",
    loading: "Loading the volunteer policy…",
    title: "Volunteer policy settings",
    links: {
      sources: "Shared sources, venues and qualifications",
      simulation: "Policy simulation",
      daily: "Manage daily quotas and late release",
    },
    createTemplate: "Create a template (copy the current settings)",
    copyName: (name: string) => `${name} (copy)`,
    intro: (revision: number, dirty: boolean) =>
      `Save the draft first, then preview the affected activities. Revision ${formatAdminNumber(revision, "en")}${dirty ? " (not saved yet)" : ""}`,
    sections: {
      basic: "Basic schedule and eligibility",
      rules: "Places and registration rules",
      source: "Sources",
      publish: "Preview and publish",
    },
    fields: {
      template: "Policy template",
      name: "Name",
      venue: "Venue",
      startTime: "Start time",
      endTime: "End time",
      location: "Location",
      places: "Volunteer places",
      minimumAge: "Minimum age",
      noteTitle: "Note title",
      noteHint: "Note hint",
      credentials: "Required qualification identifiers (one per line)",
      tiers: "Tiers",
    },
    advancedSummary: (roles: number, quotas: number, daily: number, release: number) =>
      `Advanced rules: ${pluralCount(roles, "role")}, ${pluralCount(quotas, "tier quota")}, ${pluralCount(daily, "daily limit")} and ${pluralCount(release, "late release rule")}. These rules are kept. Unresolved items are listed below.`,
    assessment: {
      title: "Monthly tier assessment",
      text: "Assessment thresholds and notification arrangements are managed as separate versions. Go to the tier assessment to see the current settings, the published versions and the run records.",
      link: "Manage the monthly tier assessment",
    },
    readiness: { title: "Publishing readiness", none: "No settings are unresolved." },
    separator: ": ",
    save: "Save draft",
    publish: {
      title: "Preview and publish",
      effectiveDate: "Effective date",
      endDate: "End date (optional)",
      reason: "Reason for publishing",
      affected: "Affected activities",
      activityLine: (a: {
        title: string;
        capacity: number;
        approved: number;
        waitlisted: number;
      }) =>
        `${a.title} · Places ${formatAdminNumber(a.capacity, "en")} · Approved ${formatAdminNumber(a.approved, "en")} · Waitlisted ${formatAdminNumber(a.waitlisted, "en")}`,
      preview: "Create preview",
      publish: "Publish policy",
      previewTitle: (previous: string | undefined, candidate: string) =>
        `Preview: ${previous ?? "No earlier version"} → ${candidate}`,
      issueLine: (issue: PreviewIssue) => {
        if (typeof issue === "string")
          return "This setting needs a change. Fix the draft and preview again.";
        const text = issue.message
          ? (localisePolicyMessage(issue.message, "en") ??
            localisePolicyReason(issue.message, "en"))
          : "Fix this setting and preview again.";
        return issue.path ? `${policyChangeCopy.en.issuePath(issue.path)}: ${text}` : text;
      },
      manifestLine: (title: string, capacity: number, conflicts: string) =>
        `${title} · Places ${formatAdminNumber(capacity, "en")}${conflicts ? " · Conflicts: " + conflicts : ""}`,
      conflictSeparator: ", ",
      conflictName: (code: string) => {
        if (code === "historical_session") return "the session has already started";
        if (code === "capacity_below_occupancy") return "the capacity is below the approved places";
        return "other conflict";
      },
    },
    limited: {
      before: (limit: number | undefined) =>
        `The policy preview shows the ${formatAdminNumber(limit ?? 500, "en")} nearest future sessions. You can look up all sessions by date and rebind them in the `,
      link: "activity workspace",
      after: ".",
    },
    duplicate: {
      title: "Duplicate a published version",
      button: (date: string) => `${date} · Duplicate`,
    },
    generate: {
      title: "Create activity",
      dateLabel: "Date for the new activity",
      button: "Create the activity for this date",
    },
    unsaved: "You have unsaved changes. Save before leaving the page.",
    notices: {
      draft_saved: () => "Draft saved.",
      published: (count: number) =>
        `Published. ${pluralCount(count, "activity", "activities")} updated.`,
      generated: () => "The command to create the activity has finished.",
    },
    errors: {
      save_and_date: "Save the draft and choose an effective date first.",
      preview_and_reason: "Preview first and enter the reason for publishing.",
      conflict: "The draft was updated by another administrator. Reload the page and try again.",
      failed: "The action failed. Try again.",
      invalidHeader: "Could not save. Fix these settings and save again:",
      invalidLine: (name: string, text: string) => `${name}: ${text}`,
      moreProblems: (count: number) => `${pluralCount(count, "more problem")} not shown.`,
      /** What zod's own issue codes mean to staff, for a problem the policy has no message for. */
      issueTexts: {
        invalid_type: "This setting is missing or holds the wrong kind of value. Check it.",
        too_small: "The value is too small. Increase it.",
        too_big: "The value is too large. Reduce it.",
        invalid_string: "The text is not in the right format. Check it.",
        invalid_option: "Choose one of the listed options.",
        unrecognized_keys: "This setting is not recognised. Remove it.",
        other: "Check this value and try again.",
      } as Record<string, string>,
    },
    confirmSwitch: "You have unsaved changes. Switch template and discard them?",
  },
});
