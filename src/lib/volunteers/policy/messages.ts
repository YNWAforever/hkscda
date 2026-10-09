import type { AdminLanguage } from "../../admin/language";

type Text = Record<AdminLanguage, string>;

/**
 * The messages of the volunteer policy forms, by code. Each has the zh-HK text it has always had and an
 * English text for the admin. The server still sends and stores the zh-HK text (`schemas.ts` builds its
 * validation issues and `catalogue.ts` its unresolved reasons from it), so everything that reads the
 * default language gets exactly the output it did before. The English admin finds the English text of
 * a message by the exact zh-HK text it holds, with `localisePolicyMessage` and `localisePolicyReason`.
 */
const VALIDATION = {
  tiers_duplicate: {
    zh: "級別不可重複",
    en: "Each tier can only be chosen once. Remove the duplicate.",
  },
  weekdays_duplicate: {
    zh: "星期不可重複",
    en: "Each weekday can only be chosen once. Remove the duplicate.",
  },
  date_invalid: { zh: "日期無效", en: "Enter a valid date." },
  credentials_any_empty: {
    zh: "OR 資格不可留空",
    en: "Choose at least one qualification when any one of them is enough.",
  },
  timezone_invalid: {
    zh: "IANA 時區無效",
    en: "Enter a valid IANA time zone, such as Asia/Hong_Kong.",
  },
  end_before_start: {
    zh: "結束時間必須晚於開始時間",
    en: "The end time must be later than the start time. Change one of the times.",
  },
  effective_range_invalid: {
    zh: "生效日期範圍無效",
    en: "The effective date range is not valid. Choose an end date after the start date.",
  },
  keys_duplicate: {
    zh: "識別碼不可重複",
    en: "Identifiers must all be different. Change the duplicate identifier.",
  },
  window_order: {
    zh: "開放時間不可晚於截止時間",
    en: "Registration must not open later than it closes. Change one of the two windows.",
  },
  group_size_order: {
    zh: "團體最低人數不可高於上限",
    en: "The group minimum must not be higher than the maximum. Change one of them.",
  },
  leader_model: {
    zh: "包含領隊模型需要足夠輔助名額涵蓋領隊",
    en: "When the leader counts within the assistants, the assistant places must cover the leader. Raise the assistant places.",
  },
  reserved_over_capacity: {
    zh: "保留位超出義工總容量",
    en: "The reserved places are more than the total volunteer places. Lower them or raise the volunteer places.",
  },
  minimum_over_capacity: {
    zh: "最低職務人數超出義工總容量",
    en: "The minimum numbers of the roles are more than the total volunteer places. Lower them or raise the volunteer places.",
  },
  role_over_maximum: {
    zh: "最低或保留位超出職務上限",
    en: "A role's minimum or reserved places are above its maximum. Raise the maximum or lower them.",
  },
  priority_duplicate: {
    zh: "補位優先次序不可重複",
    en: "Late release priorities must all be different. Change the duplicate priority.",
  },
  release_pool_invalid: {
    zh: "釋放池不存在或釋放數超出保留位",
    en: "The role to release places from does not exist, or the number is more than it reserves. Choose a role and a smaller number.",
  },
  release_pool_duplicate: {
    zh: "不可重複釋放同一保留池",
    en: "The same role's reserved places can only be released once. Delete the duplicate rule.",
  },
  quota_missing: {
    zh: "放寬配額或作用域不存在",
    en: "The quota to relax, or its scope, does not exist. Choose a quota from the list.",
  },
  inherit_unresolved: {
    zh: "需要解析繼承值",
    en: "An inherited value has to be resolved. Preview the policy to resolve it.",
  },
  setting_incomplete: {
    zh: "未完成設定",
    en: "This setting is not finished. Complete it.",
  },
  capacity_finite: {
    zh: "啟用模板需要有限正數義工容量",
    en: "An enabled template needs a limited number of volunteer places above zero. Enter a number above zero.",
  },
  release_semantics: {
    zh: "補位需要明選動態或一次釋放",
    en: "Late release needs a choice between dynamic and one-off release. Choose one.",
  },
  release_anchor: {
    zh: "每日補位需要明選首場或末場作時間基準",
    en: "Daily late release needs the first or the last session as its time basis. Choose one.",
  },
  inheritance_preview: {
    zh: "請預覽解析共用／場地來源後發布",
    en: "Preview the policy to resolve the shared and venue sources, then publish.",
  },
  template_mismatch: {
    zh: "模板識別不一致",
    en: "The template identifier does not match. Reload the page and try again.",
  },
} as const satisfies Record<string, Text>;

export type PolicyValidationCode = keyof typeof VALIDATION;

/** The message for a policy validation code. Defaults to zh-HK, the text the schema and the server use. */
export function policyValidationMessage(
  code: PolicyValidationCode,
  language: AdminLanguage = "zh",
): string {
  return VALIDATION[code][language];
}

const VALIDATION_CODES = Object.keys(VALIDATION) as PolicyValidationCode[];

/** Every validation code, for the tests that drive them all. */
export const POLICY_VALIDATION_CODES: readonly PolicyValidationCode[] = VALIDATION_CODES;

/** The code whose zh-HK text is exactly `text`, or `null` for any other text. */
export function policyValidationCode(text: string): PolicyValidationCode | null {
  return VALIDATION_CODES.find((code) => VALIDATION[code].zh === text) ?? null;
}

/**
 * The reasons an unresolved setting carries. The zh-HK text is what the catalogue and the admin store
 * in the policy, so it never changes with the language; English finds its text by that stored text.
 */
const REASONS = {
  // The catalogue's templates.
  dog_group_open_window: {
    zh: "狗舍團體開放窗口待設定",
    en: "The dog shelter group opening window is not set yet.",
  },
  dog_group_close_window: {
    zh: "狗舍團體截止窗口待設定",
    en: "The dog shelter group closing window is not set yet.",
  },
  daily_newcomer_counting: {
    zh: "每日新手按不同人或人次計算",
    en: "Choose whether daily newcomers are counted as different people or as attendances.",
  },
  dog_late_release_pending: {
    zh: "T−48h 熟手不足門檻、晚期每日或單場配額作用域及星期限制待選；以 relax_quota 放寬新手至10，無需保留池",
    en: "Still to choose: the threshold for too few experienced volunteers 48 hours before the session; the scope of the late release quota (the whole day or one session); the weekday limits. Relax the newcomer quota to 10; no reserved pool is needed.",
  },
  dog_group_window_unspecified: {
    zh: "狗舍團體窗口未指定",
    en: "The dog shelter group window is not specified.",
  },
  dog_group_close_unspecified: {
    zh: "狗舍團體截止未指定",
    en: "The dog shelter group closing time is not specified.",
  },
  dog_groups_in_total: {
    zh: "團體是否計入總數10",
    en: "Choose whether groups count towards the total of 10.",
  },
  dog_group_size_range: {
    zh: "團體人數範圍待設定",
    en: "The group size range is not set yet.",
  },
  experienced_places: {
    zh: "恆常／資深名額待選；5–6只是例子",
    en: "Choose the places for regular and senior volunteers; 5–6 is only an example.",
  },
  cat_morning_start: {
    zh: "貓舍早上開始時間待設定",
    en: "The cat shelter morning start time is not set yet.",
  },
  cat_morning_end: {
    zh: "貓舍早上結束時間待設定",
    en: "The cat shelter morning end time is not set yet.",
  },
  cat_open_seven_days: {
    zh: "T−7須明選168小時或香港日曆日",
    en: "Choose 168 hours or Hong Kong calendar days for opening 7 days before the session.",
  },
  cat_group_close_same_mode: {
    zh: "T−7團體截止須與個人開放採相同時間模式",
    en: "Group closing 7 days before the session must use the same time mode as individual opening.",
  },
  cat_late_release_pending: {
    zh: "T−48h 資深不足5：清潔A/B適用範圍、釋放池、可接收者及新手上限待設定",
    en: "48 hours before the session, with fewer than 5 seniors: the scope of cleaning A and B, the reserved pool, who can receive places and the newcomer maximum are not set yet.",
  },
  cat_leader_counting: {
    zh: "領隊獨立或包含於輔助",
    en: "Choose whether the leader is counted separately or within the assistants.",
  },
  cat_visit_open: {
    zh: "T−7開放：選擇168小時或香港日曆日",
    en: "Opening 7 days before the session: choose 168 hours or Hong Kong calendar days.",
  },
  evening_open: {
    zh: "T−7或T−48開放待選",
    en: "Choose whether registration opens 7 days or 48 hours before the session.",
  },
  adoption_start: { zh: "指定開始時間待設定", en: "The start time is not set yet." },
  adoption_end: { zh: "指定結束時間待設定", en: "The end time is not set yet." },
  adoption_location: { zh: "指定場地待設定", en: "The location is not set yet." },
  adoption_weekdays: { zh: "指定服務日期待設定", en: "The service days are not set yet." },
  adoption_places: { zh: "指定名額待設定", en: "The number of places is not set yet." },
  // The monthly tier assessment.
  monthly_observation: {
    zh: "保持恆常觀察期間及計法待選",
    en: "Choose how long the observation period for staying regular lasts and how it is counted.",
  },
  monthly_attendance_unit: {
    zh: "同日一次或每個核實非重疊時段一次",
    en: "Choose between one count per day and one count per verified non-overlapping time slot.",
  },
  monthly_shelter_scope: {
    zh: "貓狗出席是否合計",
    en: "Choose whether cat and dog attendance are counted together.",
  },
  monthly_promotion_trigger: {
    zh: "第N次核實後或月初評核",
    en: "Choose between promotion after the Nth verified attendance and promotion at the monthly assessment.",
  },
  monthly_assessment_time: {
    zh: "香港時間執行時刻待設定",
    en: "The time of day to run the assessment, in Hong Kong time, is not set yet.",
  },
  // The superseded shared daily limit.
  shared_daily_old_twenty: {
    zh: "舊全日20未經新版確認",
    en: "The old daily limit of 20 has not been confirmed in the new version.",
  },
  shared_daily_scope: {
    zh: "適用場地及跨場地範圍",
    en: "Choose the venue and cross-venue scope this applies to.",
  },
  shared_daily_count_mode: {
    zh: "不同人或人次",
    en: "Choose between different people and attendances.",
  },
  shared_daily_group_visitors: {
    zh: "是否計團體訪客",
    en: "Choose whether group visitors are counted.",
  },
  // The reasons the admin screens write when a setting is left undecided.
  pending_admin: { zh: "待管理員設定", en: "Waiting for an administrator to set it." },
  pick_with_group_template: {
    zh: "請選擇有團體模板",
    en: "Choose the template to use when there is a group.",
  },
  pick_without_group_template: {
    zh: "請選擇無團體模板",
    en: "Choose the template to use when there is no group.",
  },
  pick_paired_template: { zh: "請選擇配對模板", en: "Choose the paired template." },
  pick_release_semantics: { zh: "請選擇釋放方式", en: "Choose the release mode." },
  pick_daily_anchor_pending: {
    zh: "待選全日首場或末場時間基準",
    en: "Choose the first or the last session of the day as the time basis.",
  },
  pick_daily_anchor: {
    zh: "請選擇全日時間基準",
    en: "Choose the time basis for the whole day.",
  },
  enter_experienced_threshold: {
    zh: "請填寫熟手不足門檻",
    en: "Enter the threshold for too few experienced volunteers.",
  },
  pick_first_or_last: { zh: "請選擇首場或末場", en: "Choose the first or the last session." },
} as const satisfies Record<string, Text>;

export type PolicyReasonCode = keyof typeof REASONS;

const REASON_CODES = Object.keys(REASONS) as PolicyReasonCode[];

/** Every reason code, for the tests that drive them all. */
export const POLICY_REASON_CODES: readonly PolicyReasonCode[] = REASON_CODES;

/** The reason text to store in an unresolved setting: always zh-HK, as it always was. */
export function policyReason(code: PolicyReasonCode, language: AdminLanguage = "zh"): string {
  return REASONS[code][language];
}

/**
 * A stored reason as the admin shows it. Chinese shows the text as stored. English shows the English
 * text of a reason it knows, and for any other stored text the message for an unfinished setting,
 * because a stored Chinese sentence is never shown in English.
 */
export function localisePolicyReason(stored: string, language: AdminLanguage): string {
  if (language === "zh") return stored;
  const code = REASON_CODES.find((candidate) => REASONS[candidate].zh === stored);
  return code ? REASONS[code].en : VALIDATION.setting_incomplete.en;
}

/**
 * A validation message in `language`. Chinese keeps the text; English finds the text of a message it
 * knows by the exact zh-HK text, and returns `null` for any other, so the caller can describe the
 * problem from its zod code instead.
 */
export function localisePolicyMessage(text: string, language: AdminLanguage): string | null {
  if (language === "zh") return text;
  const code = policyValidationCode(text);
  return code ? VALIDATION[code].en : null;
}
