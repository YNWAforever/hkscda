import { defineAdminCopy } from "../i18n/copy";

const reasons = {
  available: ["符合目前報名規則", "Meets the current registration rules"],
  capacity_full: ["總容量已滿", "The total capacity is full"],
  role_full: ["職務上限已滿", "The role is full"],
  tier_quota_full: ["級別配額已滿", "The tier quota is full"],
  daily_quota_full: ["全日配額已滿", "The daily quota is full"],
  reserved_for_core_role: ["保留核心職務名額", "Places are reserved for a core role"],
  credentials_required: ["缺少所需資格", "A required qualification is missing"],
  role_not_allowed: ["未符合此職務資格", "Does not meet the qualifications for this role"],
  tier_not_allowed: ["未符合級別限制", "Does not meet the tier limit"],
  tier_weekday_not_allowed: ["級別不適用於當日", "This tier cannot register on that day"],
  minimum_age_not_met: ["未符合最低年齡", "Does not meet the minimum age"],
  date_closed: ["當日不開放", "The date is not open"],
  activity_closed: ["場次已關閉或已開始", "The session is closed or has started"],
  registration_not_open: ["尚未開放報名", "Registration is not open yet"],
  registration_closed: ["已過截止", "Registration has closed"],
  overlapping_duty: ["當值時間重疊", "The duty time overlaps another duty"],
  verified_profile_required: [
    "需要有效的已核實義工身份",
    "An active verified volunteer profile is required",
  ],
  legacy_identity_review_required: [
    "舊場次須核對身份及規則",
    "Review the identity and rules for this legacy session",
  ],
  group_scenario_mismatch: [
    "團體狀態與場次政策不符",
    "The group situation does not match the session policy",
  ],
  daily_policy_not_bound: ["全日政策未綁定", "The daily policy is not linked"],
  terms_required: ["須先接受適用條款", "The applicable terms must be accepted"],
} satisfies Record<string, [string, string]>;
const reason = (code: string, language: 0 | 1) =>
  (reasons as Record<string, [string, string]>)[code]?.[language] ??
  (language === 0 ? `目前規則未滿足（${code}）` : `Current rules are not met (${code})`);

export const registrationReviewCopy = defineAdminCopy({
  zh: {
    heading: "審核判斷摘要",
    status: "目前申請狀態",
    storedReason: "申請狀態原因",
    capacity: (approved: number, capacity: number, waiting: number) =>
      `已批准 ${approved} / ${capacity} 人 · 候補 ${waiting} 人`,
    snapshot: "名額是讀取時參考，不預留名額；提交時伺服器會重新驗證規則、名額及資料版本。",
    evaluation: "目前報名規則評估",
    unavailable: "未能取得目前規則評估，請重新載入核對；不要將缺少評估當作可批准。",
    conditionsUnavailable: "資格條件未能完整讀取，請核對場次政策。",
    age: (age: number) => `政策最低年齡：${age}`,
    tiers: "政策允許級別",
    tier: { newcomer: "新手", regular: "恆常", senior: "資深" },
    credentials: (mode: "all" | "any", keys: string[]) =>
      keys.length
        ? `資格（${mode === "all" ? "全部" : "任一"}）：${keys.join("、")}`
        : "政策沒有額外資格證明要求。",
    asOf: (time: string) => `評估時間：${time}`,
    reason: (code: string) => reason(code, 0),
    reload: "重新載入申請及評估",
  },
  en: {
    heading: "Review summary",
    status: "Current application status",
    storedReason: "Application status reason",
    capacity: (approved: number, capacity: number, waiting: number) =>
      `Approved ${approved} / ${capacity} people · Waitlisted ${waiting} people`,
    snapshot:
      "Places are a read-time reference and are not reserved. On submission the server rechecks rules, capacity and the record version.",
    evaluation: "Current registration rule assessment",
    unavailable:
      "The current rule assessment is unavailable. Reload to check; a missing assessment does not mean approval is allowed.",
    conditionsUnavailable:
      "The qualification conditions could not be fully read. Check the session policy.",
    age: (age: number) => `Policy minimum age: ${age}`,
    tiers: "Tiers allowed by policy",
    tier: { newcomer: "Newcomer", regular: "Regular", senior: "Senior" },
    credentials: (mode: "all" | "any", keys: string[]) =>
      keys.length
        ? `Qualifications (${mode === "all" ? "all" : "any"}): ${keys.join(", ")}`
        : "The policy has no additional credential requirement.",
    asOf: (time: string) => `Assessed at: ${time}`,
    reason: (code: string) => reason(code, 1),
    reload: "Reload application and assessment",
  },
});
