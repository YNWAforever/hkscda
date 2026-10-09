import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber } from "../i18n/format";

const ZH_REASONS: Record<string, string> = {
  available: "可以報名",
  capacity_full: "總容量已滿",
  role_full: "職務上限已滿",
  tier_quota_full: "級別配額已滿",
  daily_quota_full: "全日配額已滿",
  reserved_for_core_role: "保留核心職務名額",
  credentials_required: "缺少所需資格",
  role_not_allowed: "未符合此職務資格",
  tier_not_allowed: "未符合級別限制",
  tier_weekday_not_allowed: "級別不適用於當日",
  date_closed: "當日不開放",
  activity_closed: "場次已關閉或模擬時間已過開場",
  registration_not_open: "尚未開放報名",
  registration_closed: "已過截止",
  group_scenario_mismatch: "團體狀態與 A／B 政策不符",
  daily_scope_requires_review: "此草稿改動全日政策，請先使用全日設定預覽",
  minimum_age_not_met: "未符合最低年齡",
  overlapping_duty: "當值時間重疊",
};

const EN_REASONS: Record<string, string> = {
  available: "Can register",
  capacity_full: "The total capacity is full",
  role_full: "The role is full",
  tier_quota_full: "The tier quota is full",
  daily_quota_full: "The daily quota is full",
  reserved_for_core_role: "The places are reserved for a core role",
  credentials_required: "A required qualification is missing",
  role_not_allowed: "Does not meet the qualifications for this role",
  tier_not_allowed: "Does not meet the tier limit",
  tier_weekday_not_allowed: "The tier cannot register on that day",
  date_closed: "The date is not open",
  activity_closed: "The session is closed, or the simulated time is after the start",
  registration_not_open: "Registration is not open yet",
  registration_closed: "Registration has closed",
  group_scenario_mismatch: "The group situation does not match the paired policy",
  daily_scope_requires_review:
    "This draft changes the daily policy. Preview it in the daily quota settings first",
  minimum_age_not_met: "Does not meet the minimum age",
  overlapping_duty: "The duty time overlaps another duty",
};

/** Copy for the policy simulation screen (`VolunteerPolicySimulation`). */
export const policySimulationCopy = defineAdminCopy({
  zh: {
    title: "政策模擬",
    intro:
      "選擇已儲存草稿、現有場次、已核實義工和香港時間，使用與報名相同的規則試算。模擬不會報名、發布、釋放一次名額或發送通知。",
    back: "返回政策設定",
    loadFailed: "未能載入模擬資料",
    choose: "請選擇",
    fields: {
      draft: "已儲存草稿",
      session: "場次日期",
      volunteer: "已核實義工",
      role: "職務",
      time: "模擬香港時間",
    },
    draftOption: (name: string, revision: number) => `${name}（草稿版本 ${revision}）`,
    /** A tier by its stored value; a value the screen does not know shows nothing. */
    tier: (tier: string) =>
      (({ newcomer: "新手", regular: "普通", senior: "資深" }) as Record<string, string>)[tier] ??
      "",
    volunteerOption: (name: string, tier: string) => `${name}（${tier}）`,
    run: "執行模擬",
    failed: "未能模擬：請先確認草稿所有待設定欄位，並重新載入最新版本。",
    result: (allowed: boolean) => `模擬結果：${allowed ? "可以報名" : "不符合條件"}`,
    reason: (reason: string) => ZH_REASONS[reason] ?? "未符合此草稿規則，請核對場次及資格設定。",
    figures: (
      capacity: number | undefined,
      confirmed: number | undefined,
      remaining: number | undefined,
    ) => `有效容量 ${capacity ?? "—"} · 已確認 ${confirmed ?? "—"} · 餘額 ${remaining ?? "—"}`,
    boundary: "下一規則邊界：",
    note: "結果只對本次模擬時間及資料有效，實際報名會重新檢查。",
  },
  en: {
    title: "Policy simulation",
    intro:
      "Choose a saved draft, an existing session, a verified volunteer and a Hong Kong time to try the same rules that registration uses. A simulation does not register anyone, publish, release one-off places or send notifications.",
    back: "Back to policy settings",
    loadFailed: "Could not load the simulation data. Reload the page and try again.",
    choose: "Choose",
    fields: {
      draft: "Saved draft",
      session: "Session date",
      volunteer: "Verified volunteer",
      role: "Volunteer role",
      time: "Simulated Hong Kong time",
    },
    draftOption: (name: string, revision: number) =>
      `${name} (draft revision ${formatAdminNumber(revision, "en")})`,
    tier: (tier: string) =>
      (({ newcomer: "Newcomer", regular: "Regular", senior: "Senior" }) as Record<string, string>)[
        tier
      ] ?? "Unknown tier",
    volunteerOption: (name: string, tier: string) => `${name} (${tier})`,
    run: "Run simulation",
    failed:
      "Could not simulate. Complete every undecided setting in the draft, then reload the latest version.",
    result: (allowed: boolean) =>
      `Simulation result: ${allowed ? "Can register" : "Does not meet the conditions"}`,
    reason: (reason: string) =>
      EN_REASONS[reason] ??
      "This draft's rules are not met. Check the session and the qualification settings.",
    figures: (
      capacity: number | undefined,
      confirmed: number | undefined,
      remaining: number | undefined,
    ) =>
      `Effective capacity ${capacity === undefined ? "—" : formatAdminNumber(capacity, "en")} · Confirmed ${confirmed === undefined ? "—" : formatAdminNumber(confirmed, "en")} · Remaining ${remaining === undefined ? "—" : formatAdminNumber(remaining, "en")}`,
    boundary: "Next rule boundary: ",
    note: "The result only holds for this simulated time and this data. A real registration is checked again.",
  },
});
