import { localisePolicyReason } from "../../../lib/volunteers/policy/messages";
import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate, formatAdminNumber, pluralCount } from "../i18n/format";
import { policyCommonCopy } from "./policyCommonCopy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/**
 * Names the policy screens can put to the keys and values of a policy: the registered venues and
 * qualifications, whose names staff typed. English shows these names instead of the stored keys.
 */
export type PolicyLookups = {
  shelters?: Record<string, string>;
  credentials?: Record<string, string>;
};

const ZH_LABELS: Record<string, string> = {
  name: "名稱",
  template_key: "模板",
  shelter: "場地",
  scenario: "場次類別",
  timezone: "時區",
  schedule: "時段",
  weekdays: "服務星期",
  starts_at: "開始",
  ends_at: "結束",
  start_time: "開始時間",
  end_time: "結束時間",
  capacity: "容量",
  maximum: "上限",
  count_scope: "計數範圍",
  counting_scope: "計數範圍",
  roles: "職務名額",
  tier_quotas: "級別配額",
  daily_limits: "全日限制",
  release_rules: "晚期補位",
  eligibility: "資格要求",
  allowed_tiers: "允許級別",
  minimum_age: "最低年齡",
  credentials: "課程資格",
  booking: "報名窗口",
  windows: "報名窗口",
  reminders: "提醒",
  remarks: "備註",
  source: "來源",
  sources: "來源",
  terms: "條款",
  assessment: "評核",
  state: "設定狀態",
  value: "數值",
  keys: "資格項目",
  mode: "方式",
  group: "團體",
  individual: "個人",
  enabled: "啟用",
  role_count_model: "職務計數方式",
  newcomer: "新手",
  regular: "恆常",
  senior: "資深",
  label: "名稱",
  key: "識別碼",
  minimum: "最低名額",
  minutes: "分鐘",
  days: "日數",
  before: "之前",
  after: "之後",
  cancel: "取消",
  cancellation: "取消",
  booking_windows: "報名窗口",
  slot: "時段",
};

/**
 * English names for every key a policy holds. The Chinese list above is shorter: it shows any key it
 * has no name for as it is stored, and English never does, so this list names the others too.
 */
const EN_LABELS: Record<string, string> = {
  name: "Name",
  template_key: "Template",
  shelter: "Venue",
  scenario: "Session category",
  timezone: "Time zone",
  schedule: "Schedule",
  weekdays: "Service weekdays",
  starts_at: "Start",
  ends_at: "End",
  start_time: "Start time",
  end_time: "End time",
  capacity: "Capacity",
  maximum: "Maximum",
  count_scope: "Counting scope",
  counting_scope: "Counting scope",
  roles: "Volunteer role places",
  tier_quotas: "Tier quotas",
  daily_limits: "Daily limits",
  release_rules: "Late release",
  eligibility: "Eligibility",
  allowed_tiers: "Allowed tiers",
  minimum_age: "Minimum age",
  min_age: "Minimum age",
  credentials: "Course qualifications",
  booking: "Registration windows",
  windows: "Registration windows",
  reminders: "Reminders",
  remarks: "Notes",
  source: "Source",
  sources: "Sources",
  terms: "Terms",
  assessment: "Assessment",
  state: "Setting status",
  value: "Value",
  keys: "Qualifications",
  mode: "Method",
  group: "Group",
  individual: "Individual",
  enabled: "Enabled",
  role_count_model: "Role counting method",
  newcomer: "Newcomer",
  regular: "Regular",
  senior: "Senior",
  label: "Name",
  key: "Identifier",
  minimum: "Minimum places",
  minutes: "Minutes",
  days: "Days",
  before: "Before",
  after: "After",
  cancel: "Cancellation",
  cancellation: "Cancellation",
  booking_windows: "Registration windows",
  slot: "Time slot",
  // The keys the Chinese list leaves out.
  schema_version: "Format version",
  inheritance: "Inherited settings",
  effective_from: "Effective from",
  effective_until: "Effective until",
  excluded_dates: "Excluded dates",
  generation_days: "Days to create ahead",
  location: "Location",
  volunteers: "Volunteer places",
  visitors: "Visitor places",
  shared_total: "Shared total places",
  group_in_shared_total: "Groups count towards the shared total",
  group_size: "Group size",
  valid_at: "When qualifications are checked",
  missing_credentials_message: "Message when qualifications are missing",
  tiers: "Tiers",
  reserved: "Reserved places",
  scope: "Scope",
  count_mode: "Counting method",
  include_group_visitors: "Include group visitors",
  priority: "Priority",
  semantics: "Release mode",
  within_hours: "Hours before the session",
  condition: "Condition",
  operator: "Comparison",
  threshold: "Threshold",
  action: "Action",
  type: "Type",
  pool: "Role to release from",
  quantity: "Number to release",
  quota: "Quota",
  new_maximum: "New maximum",
  daily_anchor: "Daily time basis",
  individual_open: "Individual opening",
  individual_close: "Individual closing",
  group_open: "Group opening",
  group_close: "Group closing",
  group_freeze: "Group size freeze",
  late_group_change: "Late group change",
  scenario_templates: "Templates by group situation",
  with_group: "With a group",
  without_group: "Without a group",
  auto_approve: "Auto-approve",
  allow_waitlist: "Allow waitlist",
  waitlist_limit: "Waitlist limit",
  waitlist_order: "Waitlist order",
  cancellation_close: "Cancellation closing",
  hint: "Hint",
  required: "Required",
  max_length: "Maximum length",
  allow_free_text: "Free text allowed",
  options: "Options",
  version_id: "Terms version",
  reconsent: "Terms confirmation",
  reason: "Reason",
  at: "Time of day",
};

const EN_OTHER_SETTING = "Other setting";

/** English names for the values a policy setting can hold, by the key that holds them. */
const EN_VALUES: Record<string, Record<string, string>> = {
  state: {
    value: "Fixed number",
    unlimited: "Unlimited",
    unresolved: "Undecided",
    inherit: "Inherit",
  },
  scenario: {
    none: "Not applicable",
    confirmed_group: "Confirmed group",
    no_confirmed_group: "No confirmed group",
  },
  group_freeze: { at_group_close: "At group closing", at_session_start: "At session start" },
  late_group_change: { revalidate: "Revalidate", manual_review: "Manual review" },
  role_count_model: {
    leader_separate: "Leader counted separately",
    leader_in_assistants: "Leader counted within the assistants",
  },
  count_mode: { distinct_people: "Different people", attendances: "Attendances" },
  scope: {
    session: "Single session",
    shelter_day: "Whole day, same venue",
    all_shelters_day: "Whole day, all venues",
  },
  semantics: { dynamic: "Dynamic", once: "One-off" },
  operator: { lt: "Fewer than", lte: "No more than" },
  type: { release_reserved: "Release reserved role places", relax_quota: "Relax a quota" },
  daily_anchor: {
    first_session: "First session of the day",
    last_session: "Last session of the day",
  },
  mode: {
    all: "All",
    any: "Any",
    hours_before: "Hours before the session",
    calendar_days_before: "Hong Kong calendar days before",
    unrestricted: "No restriction",
    disabled: "Disabled",
  },
  // The choices an undecided setting offers (`options` of an unresolved setting).
  options: {
    distinct_people: "Different people",
    attendances: "Attendances",
    relax_quota: "Relax a quota",
    hours_before: "Hours before the session",
    calendar_days_before: "Hong Kong calendar days before",
    leader_separate: "Leader counted separately",
    leader_in_assistants: "Leader counted within the assistants",
    "168_hours": "168 hours",
    "7_calendar_days": "7 calendar days",
    "48_hours": "48 hours",
  },
  weekdays: { preserve: "Keep the existing weekday limits" },
  valid_at: { signup: "At registration", session: "On the session date" },
  reconsent: {
    existing_acceptance_valid: "Earlier agreement stays valid",
    require_current: "The current terms must be agreed",
  },
  waitlist_order: { first_come_first_served: "First come, first served" },
};

/** Keys whose value is an identifier staff typed (or a template identifier): shown as stored. */
const IDENTIFIER_KEYS = new Set([
  "key",
  "pool",
  "quota",
  "template_key",
  "with_group",
  "without_group",
]);
/** Keys whose value is a day, such as `2026-10-09`. */
const DATE_KEYS = new Set(["effective_from", "effective_until", "excluded_dates"]);
/** Keys whose value is text staff typed: a name, a note or a place, shown as typed. */
const TEXT_KEYS = new Set([
  "name",
  "label",
  "hint",
  "source",
  "location",
  "missing_credentials_message",
]);
const TIERS: Record<string, string> = {
  newcomer: "Newcomer",
  regular: "Regular",
  senior: "Senior",
};
const LOOKS_LIKE_A_CODE = /^(?=.*[a-z])[a-z0-9]+([_-][a-z0-9]+)+$/;

/**
 * The English text of one value of a policy: a value with a name (a tier, a venue, a qualification,
 * a setting such as "At group closing"), a day, a number, or text staff typed as it is. A value that
 * looks like a stored code and has no name is "Other value", never the code.
 */
export function describeEnglishPolicyLeaf(
  value: string | number,
  key: string,
  lookups: PolicyLookups,
): string {
  if (typeof value === "number") {
    if (key === "weekdays") return policyCommonCopy.en.weekday(value);
    return formatAdminNumber(value, "en");
  }
  if (TIERS[value]) return TIERS[value];
  const named = EN_VALUES[key]?.[value];
  if (named) return named;
  if (key === "shelter")
    return lookups.shelters?.[value] ?? volunteerCommonCopy.en.shelterName(value);
  if (key === "keys") return lookups.credentials?.[value] ?? "Unnamed qualification";
  if (key === "reason") return localisePolicyReason(value, "en");
  if (key === "version_id") return "A terms version is linked";
  if (key === "timezone" && value === "Asia/Hong_Kong") return "Hong Kong time";
  if (DATE_KEYS.has(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatAdminDate(value, "en");
  if (IDENTIFIER_KEYS.has(key) || TEXT_KEYS.has(key)) return value;
  return LOOKS_LIKE_A_CODE.test(value) ? "Other value" : value;
}

/** The English name of a path in a policy, such as `release_rules.0.semantics`. */
function englishIssuePath(path: string): string {
  return path
    .split(".")
    .map((segment) =>
      /^\d+$/.test(segment)
        ? `Item ${Number(segment) + 1}`
        : (EN_LABELS[segment] ?? EN_OTHER_SETTING),
    )
    .join(" / ");
}

/** Copy for the comparison of two policy versions (`PolicyChangeSummary`) and the names it uses. */
export const policyChangeCopy = defineAdminCopy({
  zh: {
    sectionLabel: "政策修改比較",
    title: (count: number) => `修改比較 · ${count} 項`,
    unchanged: "與比較版本相同。",
    before: "原設定",
    after: "此版本",
    notSet: "未設定",
    yes: "是",
    no: "否",
    noItems: "沒有項目",
    /** What separates the items of a list. */
    itemSeparator: "；",
    /** What separates the named parts of one setting. */
    fieldSeparator: " · ",
    /** One named part of a setting. */
    field: (label: string, text: string) => `${label}：${text}`,
    /** The name of one key of a policy. */
    label: (key: string) => ZH_LABELS[key] ?? key,
    /** The title of one change: the names of the keys on its path. */
    pathTitle: (path: string) =>
      path
        .split(".")
        .map((segment) => ZH_LABELS[segment] ?? segment)
        .join(" / "),
    /** A path in a list of what still has to be decided: the path as stored, as it has always been. */
    issuePath: (path: string) => path,
    /** One value that is not a list, an object or a yes or no. */
    leaf: (value: string | number, _key: string, _lookups: PolicyLookups) =>
      ZH_LABELS[String(value)] ?? String(value),
  },
  en: {
    sectionLabel: "Policy changes",
    title: (count: number) => `Changes · ${pluralCount(count, "item")}`,
    unchanged: "Same as the version compared.",
    before: "Before",
    after: "This version",
    notSet: "Not set",
    yes: "Yes",
    no: "No",
    noItems: "None",
    itemSeparator: "; ",
    fieldSeparator: " · ",
    field: (label: string, text: string) => `${label}: ${text}`,
    label: (key: string) => EN_LABELS[key] ?? EN_OTHER_SETTING,
    pathTitle: (path: string) =>
      path
        .split(".")
        .map((segment) => EN_LABELS[segment] ?? EN_OTHER_SETTING)
        .join(" / "),
    issuePath: englishIssuePath,
    leaf: describeEnglishPolicyLeaf,
  },
});
