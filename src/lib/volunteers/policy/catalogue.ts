import { policyReason } from "./messages";
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
dogB.booking.group_open = unresolved(policyReason("dog_group_open_window"));
dogB.booking.group_close = unresolved(policyReason("dog_group_close_window"));
dogB.tier_quotas = [
  { key: "newcomer_weekdays", tiers: ["newcomer"], maximum: unlimited, weekdays: [1, 3, 0] },
];
dogB.daily_limits = [
  {
    key: "dog_newcomers",
    tiers: ["newcomer"],
    maximum: limit(5),
    scope: "shelter_day",
    count_mode: unresolved(policyReason("daily_newcomer_counting"), [
      "distinct_people",
      "attendances",
    ]),
    include_group_visitors: false,
  },
];
dogB.release_rules = [unresolved(policyReason("dog_late_release_pending"), ["relax_quota"])];
const dogA = base("dog-cleaning-a", "狗舍清潔 A：有確認團體", "dog", "09:30", "12:30", 10);
dogA.booking.scenario = "confirmed_group";
dogA.booking.scenario_templates = { with_group: "dog-cleaning-a", without_group: "dog-cleaning-b" };
dogA.booking.group_open = unresolved(policyReason("dog_group_window_unspecified"));
dogA.booking.group_close = unresolved(policyReason("dog_group_close_unspecified"));
dogA.capacity.group_in_shared_total = unresolved(policyReason("dog_groups_in_total"));
dogA.capacity.shared_total = limit(10);
dogA.capacity.group_size = unresolved(policyReason("dog_group_size_range"));
dogA.roles = [
  {
    ...role("experienced", "恆常／資深", 0, 0, null),
    maximum: unresolved(policyReason("experienced_places")),
  },
];
function catMorning(key: string, name: string, total: number) {
  const p = base(key, name, "cat", "09:00", "12:00", total);
  p.schedule.start_time = unresolved(policyReason("cat_morning_start"));
  p.schedule.end_time = unresolved(policyReason("cat_morning_end"));
  p.booking.individual_open = unresolved(policyReason("cat_open_seven_days"), [
    "hours_before",
    "calendar_days_before",
  ]);
  p.booking.group_open = { mode: "unrestricted" };
  p.booking.group_close = unresolved(policyReason("cat_group_close_same_mode"), [
    "hours_before",
    "calendar_days_before",
  ]);
  p.release_rules = [unresolved(policyReason("cat_late_release_pending"))];
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
  role_count_model: unresolved(policyReason("cat_leader_counting"), [
    "leader_separate",
    "leader_in_assistants",
  ]),
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
visit.booking.individual_open = unresolved(policyReason("cat_visit_open"), [
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
evening.booking.individual_open = unresolved(policyReason("evening_open"), [
  "168_hours",
  "7_calendar_days",
  "48_hours",
]);
function adoption(key: string, name: string, credentials: string[]) {
  const p = base(key, name, "adoption", "09:00", "17:00", 1);
  p.schedule.start_time = unresolved(policyReason("adoption_start"));
  p.schedule.end_time = unresolved(policyReason("adoption_end"));
  p.schedule.location = unresolved(policyReason("adoption_location"));
  p.schedule.weekdays = unresolved(policyReason("adoption_weekdays"));
  p.capacity.volunteers = unresolved(policyReason("adoption_places"));
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
  senior_regular_observation_months: unresolved(policyReason("monthly_observation")),
  attendance_unit: unresolved(policyReason("monthly_attendance_unit")),
  shelter_scope: unresolved(policyReason("monthly_shelter_scope")),
  promotion_trigger: unresolved(policyReason("monthly_promotion_trigger")),
  regular_monthly_minimum: 1,
  senior_monthly_minimum: 2,
  regular_zero_months: 1,
  senior_zero_months: 2,
  senior_auto_demotion: false,
  assessment_day: 1,
  assessment_time: unresolved(policyReason("monthly_assessment_time")),
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
  maximum: unresolved(policyReason("shared_daily_old_twenty")),
  scope: unresolved(policyReason("shared_daily_scope")),
  count_mode: unresolved(policyReason("shared_daily_count_mode")),
  include_group_visitors: unresolved(policyReason("shared_daily_group_visitors")),
};
