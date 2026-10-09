import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { describeEnglishPolicyLeaf, type PolicyLookups } from "./policyChangeCopy";

const ZH_LABELS: Record<string, string> = {
  timezone: "時區",
  schedule: "時間及日期",
  start_time: "開始時間",
  end_time: "結束時間",
  weekdays: "星期",
  location: "地點",
  effective_from: "生效日起",
  effective_until: "生效日止",
  excluded_dates: "除外日期",
  enabled: "開放",
  generation_days: "預先生成日數",
  capacity: "容量",
  volunteers: "義工",
  visitors: "訪客",
  shared_total: "共用總容量",
  group_in_shared_total: "團體計入共用容量",
  group_size: "團體人數",
  role_count_model: "領隊計數方式",
  eligibility: "資格",
  allowed_tiers: "可報級別",
  credentials: "所需技能",
  valid_at: "資格有效時間",
  min_age: "最低年齡",
  missing_credentials_message: "資格不足提示",
  roles: "職務名額",
  tier_quotas: "級別配額",
  daily_limits: "每日配額",
  release_rules: "補位規則",
  booking: "預約規則",
  individual_open: "個人開放",
  individual_close: "個人截止",
  group_open: "團體開放",
  group_close: "團體截止",
  group_freeze: "團體凍結",
  late_group_change: "臨時團體變更",
  scenario: "團體情況",
  scenario_templates: "配對政策",
  auto_approve: "自動批准",
  allow_waitlist: "開放候補",
  waitlist_limit: "候補上限",
  cancellation_close: "取消截止",
  remarks: "備註",
  label: "欄位名稱",
  hint: "提示",
  required: "必填",
  max_length: "字數上限",
  allow_free_text: "自由文字",
  options: "選項",
  terms: "條款",
  version_id: "條款版本",
  reconsent: "重新同意",
};

const EN_LABELS: Record<string, string> = {
  timezone: "Time zone",
  schedule: "Dates and times",
  start_time: "Start time",
  end_time: "End time",
  weekdays: "Weekdays",
  location: "Location",
  effective_from: "Effective from",
  effective_until: "Effective until",
  excluded_dates: "Excluded dates",
  enabled: "Open",
  generation_days: "Days to create ahead",
  capacity: "Capacity",
  volunteers: "Volunteers",
  visitors: "Visitors",
  shared_total: "Shared total capacity",
  group_in_shared_total: "Groups count towards the shared capacity",
  group_size: "Group size",
  role_count_model: "Leader counting method",
  eligibility: "Eligibility",
  allowed_tiers: "Tiers that can register",
  credentials: "Required skills",
  valid_at: "When qualifications must be valid",
  min_age: "Minimum age",
  missing_credentials_message: "Message when qualifications are missing",
  roles: "Volunteer role places",
  tier_quotas: "Tier quotas",
  daily_limits: "Daily quotas",
  release_rules: "Late release rules",
  booking: "Registration rules",
  individual_open: "Individual opening",
  individual_close: "Individual closing",
  group_open: "Group opening",
  group_close: "Group closing",
  group_freeze: "Group size freeze",
  late_group_change: "Late group change",
  scenario: "Group situation",
  scenario_templates: "Paired policies",
  auto_approve: "Auto-approve",
  allow_waitlist: "Allow waitlist",
  waitlist_limit: "Waitlist limit",
  cancellation_close: "Cancellation closing",
  remarks: "Notes",
  label: "Field name",
  hint: "Hint",
  required: "Required",
  max_length: "Maximum length",
  allow_free_text: "Free text",
  options: "Options",
  terms: "Terms",
  version_id: "Terms version",
  reconsent: "Reconfirmation of terms",
};

/** Where the value of a setting comes from. */
export type SettingOrigin = "common" | "shelter" | "template" | "inherited";

type Described = Record<string, unknown>;

/** The effective value of a setting, as a short phrase. Chinese writes a text or a number as stored. */
function describeZh(value: unknown): string {
  if (value === undefined) return "未設定";
  if (value === null) return "未指定";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} 項`;
  if (typeof value === "object" && value) {
    const v = value as Described;
    if (v.state === "value") return String(v.value);
    if (v.state === "unlimited") return "無上限";
    if (v.state === "unresolved" || v.state === "inherit") return "待設定";
  }
  return "已設定";
}

/** The same phrase in English: a stored code is named, and a number has its thousands separators. */
function describeEn(value: unknown, path: string, lookups: PolicyLookups): string {
  if (value === undefined) return "Not set";
  if (value === null) return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const key = path.split(".").at(-1) ?? path;
  if (typeof value === "string" || typeof value === "number") {
    return describeEnglishPolicyLeaf(value, key, lookups);
  }
  if (Array.isArray(value)) return pluralCount(value.length, "item");
  if (typeof value === "object" && value) {
    const v = value as Described;
    if (v.state === "value") return formatAdminNumber(Number(v.value), "en");
    if (v.state === "unlimited") return "Unlimited";
    if (v.state === "unresolved" || v.state === "inherit") return "Not set yet";
  }
  return "Set";
}

/** Copy for the table of where each policy setting comes from (`PolicySourceFields`). */
export const policySourceFieldsCopy = defineAdminCopy({
  zh: {
    summary: "每項設定來源及回復繼承",
    /** The text before the link to the source settings. */
    intro:
      "勾選即沿用場地來源，場地引用共用時再向上解析。取消勾選會將目前有效值複製為此模板覆寫；0、無上限及清除覆寫各自獨立。",
    manage: "管理共用／場地來源",
    updating: "正在更新有效設定…",
    headers: { setting: "設定", source: "來源", value: "有效值", inherit: "回復繼承" },
    origins: {
      common: "共用",
      shelter: "場地",
      template: "此模板",
      inherited: "繼承來源",
    } satisfies Record<SettingOrigin, string>,
    /** The name of a setting from the keys on its path. */
    settingName: (path: string) =>
      path
        .split(".")
        .map((segment) => ZH_LABELS[segment] ?? segment)
        .join(" · "),
    /** What the screen reader says for the box that makes a setting inherit. */
    inheritLabel: (path: string) =>
      `繼承 ${path
        .split(".")
        .map((segment) => ZH_LABELS[segment] ?? segment)
        .join(" ")}`,
    describe: (value: unknown, _path: string, _lookups: PolicyLookups) => describeZh(value),
    incomplete: "部分欄位未完整，請先補齊草稿。",
  },
  en: {
    summary: "Source of each setting and reverting to inherited",
    intro:
      "Tick a box to use the venue source; when the venue refers to the shared default, the value is resolved from there. Clearing a tick copies the current effective value into this template as an override. Zero, unlimited and clearing an override are separate choices. ",
    manage: "Manage shared and venue sources",
    updating: "Updating the effective settings…",
    headers: {
      setting: "Setting",
      source: "Source",
      value: "Effective value",
      inherit: "Revert to inherited",
    },
    origins: {
      common: "Shared",
      shelter: "Venue",
      template: "This template",
      inherited: "Inherited source",
    },
    settingName: (path: string) =>
      path
        .split(".")
        .map((segment) => EN_LABELS[segment] ?? "Other setting")
        .join(" · "),
    inheritLabel: (path: string) =>
      `Inherit ${path
        .split(".")
        .map((segment) => EN_LABELS[segment] ?? "Other setting")
        .join(", ")}`,
    describe: describeEn,
    incomplete: "Some fields are not complete. Complete the draft first.",
  },
});
