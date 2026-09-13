import { policyDraftSchema, monthlyPolicySchema, type PolicyDraft } from "./schemas";

const unresolved = (reason: string, options?: string[]) => ({
  state: "unresolved" as const,
  reason,
  ...(options ? { options } : {}),
});
const limit = (value: number) => ({ state: "value" as const, value });
const unlimited = { state: "unlimited" as const };
const allDays = [0, 1, 2, 3, 4, 5, 6];
const experienced: ("regular" | "senior")[] = ["regular", "senior"];
const allTiers: ("newcomer" | "regular" | "senior")[] = ["newcomer", "regular", "senior"];
const noCredentials = { mode: "all" as const, keys: [] };
const source =
  "HKSCDA Implementation Master Instruction v3 2026-09-13 sections 4-5; operational defaults preserve unrestricted signup/manual review";
function base(
  template_key: string,
  name: string,
  shelter: PolicyDraft["shelter"],
  start_time: string,
  end_time: string,
  capacity: number,
): PolicyDraft {
  return {
    schema_version: 1,
    template_key,
    name,
    shelter,
    timezone: "Asia/Hong_Kong",
    schedule: {
      start_time,
      end_time,
      weekdays: allDays,
      location: shelter === "dog" ? "狗舍" : shelter === "cat" ? "貓舍" : "領養日場地",
      effective_from: null,
      effective_until: null,
      excluded_dates: [],
      enabled: true,
      generation_days: 0,
    },
    capacity: {
      volunteers: limit(capacity),
      visitors: limit(0),
      shared_total: unlimited,
      group_in_shared_total: false,
      group_size: { minimum: 0, maximum: 0 },
      role_count_model: "leader_separate",
    },
    eligibility: {
      allowed_tiers: experienced,
      credentials: noCredentials,
      valid_at: "session",
      min_age: 21,
    },
    roles: [],
    tier_quotas: [],
    daily_limits: [],
    release_rules: [],
    booking: {
      individual_open: { mode: "unrestricted" },
      individual_close: { mode: "hours_before", value: 0 },
      group_open: { mode: "disabled" },
      group_close: { mode: "disabled" },
      scenario: "none",
      group_freeze: "at_group_close",
      late_group_change: "manual_review",
      auto_approve: false,
      allow_waitlist: false,
      waitlist_limit: limit(0),
      waitlist_order: "first_come_first_served",
      cancellation_close: { mode: "unrestricted" },
    },
    remarks: {
      label: "Remark",
      hint: "可填寫農務、維修、美容或其他當值備註；不會自動授予資格",
      required: false,
      max_length: 1000,
      allow_free_text: true,
      options: ["農務", "維修", "美容"],
    },
    terms: { version_id: null, reconsent: "existing_acceptance_valid" },
    source,
  };
}
function role(
  key: string,
  label: string,
  minimum: number,
  reserved: number,
  maximum: number | null,
  allowed_tiers: PolicyDraft["eligibility"]["allowed_tiers"] = experienced,
): PolicyDraft["roles"][number] {
  return {
    key,
    label,
    minimum,
    reserved,
    maximum: maximum === null ? unlimited : limit(maximum),
    allowed_tiers,
    credentials: noCredentials,
  };
}
const chores = base("cat-afternoon-chores", "貓舍下午雜務", "cat", "13:00", "17:00", 5);
const dogB = base("dog-cleaning-b", "狗舍清潔 B：無確認團體", "dog", "09:30", "12:30", 10);
dogB.booking.scenario = "no_confirmed_group";
dogB.booking.scenario_templates = { with_group: "dog-cleaning-a", without_group: "dog-cleaning-b" };
dogB.eligibility.allowed_tiers = allTiers;
dogB.booking.group_open = unresolved("狗舍團體開放窗口待設定");
dogB.booking.group_close = unresolved("狗舍團體截止窗口待設定");
dogB.tier_quotas = [
  { key: "newcomer_weekdays", tiers: ["newcomer"], maximum: unlimited, weekdays: [1, 3, 0] },
];
dogB.daily_limits = [
  {
    key: "dog_newcomers",
    tiers: ["newcomer"],
    maximum: limit(5),
    scope: "shelter_day",
    count_mode: unresolved("每日新手按不同人或人次計算", ["distinct_people", "attendances"]),
    include_group_visitors: false,
  },
];
dogB.release_rules = [
  unresolved(
    "T−48h 熟手不足門檻、晚期每日或單場配額作用域及星期限制待選；以 relax_quota 放寬新手至10，無需保留池",
    ["relax_quota"],
  ),
];
const dogA = base("dog-cleaning-a", "狗舍清潔 A：有確認團體", "dog", "09:30", "12:30", 10);
dogA.booking.scenario = "confirmed_group";
dogA.booking.scenario_templates = { with_group: "dog-cleaning-a", without_group: "dog-cleaning-b" };
dogA.booking.group_open = unresolved("狗舍團體窗口未指定");
dogA.booking.group_close = unresolved("狗舍團體截止未指定");
dogA.capacity.group_in_shared_total = unresolved("團體是否計入總數10");
dogA.capacity.shared_total = limit(10);
dogA.capacity.group_size = unresolved("團體人數範圍待設定");
dogA.roles = [
  {
    ...role("experienced", "恆常／資深", 0, 0, null),
    maximum: unresolved("恆常／資深名額待選；5–6只是例子"),
  },
];
function catMorning(key: string, name: string, total: number) {
  const p = base(key, name, "cat", "09:00", "12:00", total);
  p.schedule.start_time = unresolved("貓舍早上開始時間待設定");
  p.schedule.end_time = unresolved("貓舍早上結束時間待設定");
  p.booking.individual_open = unresolved("T−7須明選168小時或香港日曆日", [
    "hours_before",
    "calendar_days_before",
  ]);
  p.booking.group_open = { mode: "unrestricted" };
  p.booking.group_close = unresolved("T−7團體截止須與個人開放採相同時間模式", [
    "hours_before",
    "calendar_days_before",
  ]);
  p.release_rules = [
    unresolved("T−48h 資深不足5：清潔A/B適用範圍、釋放池、可接收者及新手上限待設定"),
  ];
  return p;
}
const catA = catMorning("cat-cleaning-a", "貓舍清潔 A：有確認團體", 25);
catA.booking.scenario = "confirmed_group";
catA.booking.scenario_templates = { with_group: "cat-cleaning-a", without_group: "cat-cleaning-b" };
catA.eligibility.allowed_tiers = allTiers;
catA.capacity = {
  volunteers: limit(25),
  visitors: limit(15),
  shared_total: limit(25),
  group_in_shared_total: true,
  group_size: { minimum: 10, maximum: 15 },
  role_count_model: unresolved("領隊獨立或包含於輔助", ["leader_separate", "leader_in_assistants"]),
};
catA.roles = [
  role("leader", "資深領隊", 1, 1, 1, ["senior"]),
  role("assistant", "恆常／資深輔助", 8, 8, 10),
];
catA.roles.push(role("volunteer", "一般義工", 0, 0, null, ["newcomer"]));
catA.tier_quotas = [
  { key: "newcomers", tiers: ["newcomer"], maximum: limit(5), weekdays: allDays },
];
const catB = catMorning("cat-cleaning-b", "貓舍清潔 B：無確認團體", 20);
catB.booking.scenario = "no_confirmed_group";
catB.booking.scenario_templates = { with_group: "cat-cleaning-a", without_group: "cat-cleaning-b" };
catB.eligibility.allowed_tiers = allTiers;
catB.roles = [role("experienced", "熟手", 10, 10, null)];
catB.roles.push(role("volunteer", "一般義工", 0, 0, null, ["newcomer"]));
catB.tier_quotas = [
  { key: "newcomers", tiers: ["newcomer"], maximum: limit(10), weekdays: allDays },
];
const visit = base("cat-afternoon-visit", "貓舍下午參觀", "cat", "15:00", "16:30", 3);
visit.capacity.visitors = limit(20);
visit.roles = [
  role("leader", "資深領隊", 1, 1, 1, ["senior"]),
  role("assistant", "恆常／資深輔助", 1, 1, 2),
];
visit.booking.individual_open = unresolved("T−7開放：選擇168小時或香港日曆日", [
  "hours_before",
  "calendar_days_before",
]);
const evening = base("cat-evening-socialisation", "貓舍晚間社教化", "cat", "19:00", "21:00", 8);
evening.schedule.weekdays = [1, 3, 5];
evening.eligibility.allowed_tiers = allTiers;
evening.eligibility.credentials = { mode: "all", keys: ["socialisation_training"] };
evening.eligibility.missing_credentials_message = "本時段僅限已修畢社教化訓練班之義工報名";
evening.roles = [
  {
    ...role("duty", "受訓資深當值", 1, 1, 1, ["senior"]),
    credentials: evening.eligibility.credentials,
  },
  {
    ...role("helper", "受訓義工", 0, 0, 7, allTiers),
    credentials: evening.eligibility.credentials,
  },
];
evening.booking.individual_open = unresolved("T−7或T−48開放待選", [
  "168_hours",
  "7_calendar_days",
  "48_hours",
]);
function adoption(key: string, name: string, credentials: string[]) {
  const p = base(key, name, "adoption", "09:00", "17:00", 1);
  p.schedule.start_time = unresolved("指定開始時間待設定");
  p.schedule.end_time = unresolved("指定結束時間待設定");
  p.schedule.location = unresolved("指定場地待設定");
  p.schedule.weekdays = unresolved("指定服務日期待設定");
  p.capacity.volunteers = unresolved("指定名額待設定");
  p.eligibility.credentials = { mode: "all", keys: credentials };
  return p;
}
export const initialPolicyCatalogue: PolicyDraft[] = [
  chores,
  dogA,
  dogB,
  catA,
  catB,
  visit,
  evening,
  adoption("adoption-dog-handler", "領養日領犬", ["experienced_dog_handler"]),
  adoption("adoption-driver", "領養日車隊", ["driving_license", "transport_experience"]),
].map((p) => policyDraftSchema.parse(p));
export const initialMonthlyPolicy = monthlyPolicySchema.parse({
  regular_attendance_threshold: 10,
  senior_years: 2,
  senior_regular_observation_months: unresolved("保持恆常觀察期間及計法待選"),
  attendance_unit: unresolved("同日一次或每個核實非重疊時段一次"),
  shelter_scope: unresolved("貓狗出席是否合計"),
  promotion_trigger: unresolved("第N次核實後或月初評核"),
  regular_monthly_minimum: 1,
  senior_monthly_minimum: 2,
  regular_zero_months: 1,
  senior_zero_months: 2,
  senior_auto_demotion: false,
  assessment_day: 1,
  assessment_time: unresolved("香港時間執行時刻待設定"),
  short_month: "last_day",
  timezone: "Asia/Hong_Kong",
  notifications: {
    enabled: false,
    dry_run: true,
    channels: [],
    regular_template: "溫馨提示",
    senior_template: "關懷",
    max_attempts: 3,
  },
});
/** The superseded daily 20 is deliberately not included in any active scope. */
export const unresolvedSharedDailyLimit = {
  maximum: unresolved("舊全日20未經新版確認"),
  scope: unresolved("適用場地及跨場地範圍"),
  count_mode: unresolved("不同人或人次"),
  include_group_visitors: unresolved("是否計團體訪客"),
};
