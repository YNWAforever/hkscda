import { z } from "zod";
import { policySourcePaths } from "./sourcePaths";

const count = z.number().int().min(0).max(100000);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const unresolvedSchema = z
  .object({
    state: z.literal("unresolved"),
    reason: z.string().min(1).max(500),
    options: z.array(z.string().max(100)).max(20).optional(),
  })
  .strict();
const inheritSchema = z.object({ state: z.literal("inherit") }).strict();
const configurable = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, unresolvedSchema, inheritSchema]);
export const limitSchema = z.union([
  z.object({ state: z.literal("value"), value: count }).strict(),
  z.object({ state: z.literal("unlimited") }).strict(),
  unresolvedSchema,
  inheritSchema,
]);
export const tierSchema = z.enum(["newcomer", "regular", "senior"]);
const tiers = z
  .array(tierSchema)
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length, "級別不可重複");
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((v) => new Set(v).size === v.length, "星期不可重複");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "日期無效",
  );
export const credentialsSchema = z
  .object({ mode: z.enum(["all", "any"]), keys: z.array(key).max(20) })
  .strict()
  .refine((v) => v.mode === "all" || v.keys.length > 0, "OR 資格不可留空");
export const windowSchema = z.union([
  z.object({ mode: z.literal("hours_before"), value: count }).strict(),
  z.object({ mode: z.literal("calendar_days_before"), value: count, at: time }).strict(),
  z.object({ mode: z.literal("unrestricted") }).strict(),
  z.object({ mode: z.literal("disabled") }).strict(),
  unresolvedSchema,
  inheritSchema,
]);
export const roleSchema = z
  .object({
    key,
    label: z.string().min(1).max(80),
    minimum: count,
    reserved: count,
    maximum: limitSchema,
    allowed_tiers: tiers,
    credentials: credentialsSchema,
  })
  .strict();
const scope = z.enum(["session", "shelter_day", "all_shelters_day"]);
export const releaseRuleSchema = z
  .object({
    key,
    priority: count,
    semantics: configurable(z.enum(["dynamic", "once"])).optional(),
    within_hours: count,
    condition: z
      .object({ tiers, operator: z.enum(["lt", "lte"]), threshold: configurable(count) })
      .strict(),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("release_reserved"), pool: key, quantity: count }).strict(),
      z
        .object({
          type: z.literal("relax_quota"),
          quota: key,
          new_maximum: count,
          scope,
          daily_anchor: configurable(z.enum(["first_session", "last_session"])).optional(),
        })
        .strict(),
    ]),
    allowed_tiers: tiers,
    credentials: credentialsSchema,
    weekdays: configurable(z.union([z.literal("preserve"), weekdays])),
  })
  .strict();
export const policyDraftSchema = z
  .object({
    schema_version: z.literal(1),
    template_key: key,
    name: z.string().min(1).max(150),
    shelter: key,
    inheritance: z.array(z.enum(policySourcePaths)).max(60).optional(),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "IANA 時區無效"),
    schedule: z
      .object({
        start_time: configurable(time),
        end_time: configurable(time),
        weekdays: configurable(weekdays),
        location: configurable(z.string().min(1).max(200)),
        effective_from: date.nullable(),
        effective_until: date.nullable(),
        excluded_dates: z.array(date).max(366),
        enabled: z.boolean(),
        generation_days: count,
      })
      .strict(),
    capacity: z
      .object({
        volunteers: limitSchema,
        visitors: limitSchema,
        shared_total: limitSchema,
        group_in_shared_total: configurable(z.boolean()),
        group_size: configurable(z.object({ minimum: count, maximum: count }).strict()),
        role_count_model: configurable(z.enum(["leader_separate", "leader_in_assistants"])),
      })
      .strict(),
    eligibility: z
      .object({
        allowed_tiers: tiers,
        credentials: credentialsSchema,
        valid_at: z.enum(["signup", "session"]),
        missing_credentials_message: z.string().max(500).optional(),
        min_age: configurable(z.number().int().min(0).max(120)),
      })
      .strict(),
    roles: z.array(roleSchema).max(30),
    tier_quotas: z
      .array(
        z.object({ key, tiers, maximum: limitSchema, weekdays: configurable(weekdays) }).strict(),
      )
      .max(20),
    daily_limits: z
      .array(
        z
          .object({
            key,
            tiers,
            maximum: limitSchema,
            scope: z.enum(["shelter_day", "all_shelters_day"]),
            count_mode: configurable(z.enum(["distinct_people", "attendances"])),
            include_group_visitors: configurable(z.boolean()),
          })
          .strict(),
      )
      .max(20),
    release_rules: z.array(z.union([releaseRuleSchema, unresolvedSchema])).max(20),
    booking: z
      .object({
        individual_open: windowSchema,
        individual_close: windowSchema,
        group_open: windowSchema,
        group_close: windowSchema,
        scenario: z.enum(["none", "confirmed_group", "no_confirmed_group"]),
        scenario_templates: configurable(
          z.object({ with_group: configurable(key), without_group: configurable(key) }).strict(),
        ).optional(),
        group_freeze: configurable(z.enum(["at_group_close", "at_session_start"])),
        late_group_change: configurable(z.enum(["revalidate", "manual_review"])),
        auto_approve: z.boolean(),
        allow_waitlist: z.boolean(),
        waitlist_limit: limitSchema,
        waitlist_order: z.literal("first_come_first_served"),
        cancellation_close: windowSchema,
      })
      .strict(),
    remarks: z
      .object({
        label: z.string().min(1).max(80),
        hint: z.string().max(500),
        required: z.boolean(),
        max_length: z.number().int().min(1).max(5000),
        allow_free_text: z.boolean(),
        options: z.array(z.string().min(1).max(80)).max(30),
      })
      .strict(),
    terms: z
      .object({
        version_id: z.string().uuid().nullable(),
        reconsent: z.enum(["existing_acceptance_valid", "require_current"]),
      })
      .strict(),
    source: z.string().min(1).max(300),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.inheritance?.length) return; // Cross-field checks run on the resolved snapshot.
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (
      typeof p.schedule.start_time === "string" &&
      typeof p.schedule.end_time === "string" &&
      p.schedule.start_time >= p.schedule.end_time
    )
      issue(["schedule", "end_time"], "結束時間必須晚於開始時間");
    if (
      p.schedule.effective_from &&
      p.schedule.effective_until &&
      p.schedule.effective_from > p.schedule.effective_until
    )
      issue(["schedule", "effective_until"], "生效日期範圍無效");
    for (const name of ["roles", "tier_quotas", "daily_limits"] as const) {
      const keys = p[name].map((v) => v.key);
      if (new Set(keys).size !== keys.length) issue([name], "識別碼不可重複");
    }
    for (const audience of ["individual", "group"] as const) {
      const open = p.booking[`${audience}_open`];
      const close = p.booking[`${audience}_close`];
      if ("mode" in open && "mode" in close && open.mode === close.mode) {
        if (
          open.mode === "hours_before" &&
          close.mode === "hours_before" &&
          open.value < close.value
        )
          issue(["booking", `${audience}_open`], "開放時間不可晚於截止時間");
        if (
          open.mode === "calendar_days_before" &&
          close.mode === "calendar_days_before" &&
          (open.value < close.value || (open.value === close.value && open.at > close.at))
        )
          issue(["booking", `${audience}_open`], "開放時間不可晚於截止時間");
      }
    }
    const group = p.capacity.group_size;
    if ("minimum" in group && group.minimum > group.maximum)
      issue(["capacity", "group_size"], "團體最低人數不可高於上限");
    if (p.capacity.role_count_model === "leader_in_assistants") {
      const leader = p.roles.find((r) => r.key === "leader");
      const assistant = p.roles.find((r) => r.key === "assistant");
      if (
        !leader ||
        !assistant ||
        leader.minimum > assistant.minimum ||
        leader.reserved > assistant.reserved
      )
        issue(["capacity", "role_count_model"], "包含領隊模型需要足夠輔助名額涵蓋領隊");
    }
    const cap = p.capacity.volunteers;
    if (cap.state === "value") {
      if (
        p.roles.reduce((n, r) => n + r.reserved, 0) -
          (p.capacity.role_count_model === "leader_in_assistants"
            ? (p.roles.find((r) => r.key === "leader")?.reserved ?? 0)
            : 0) >
        cap.value
      )
        issue(["roles"], "保留位超出義工總容量");
      if (
        p.roles.reduce((n, r) => n + r.minimum, 0) -
          (p.capacity.role_count_model === "leader_in_assistants"
            ? (p.roles.find((r) => r.key === "leader")?.minimum ?? 0)
            : 0) >
        cap.value
      )
        issue(["roles"], "最低職務人數超出義工總容量");
    }
    p.roles.forEach((r, i) => {
      if (
        r.maximum.state === "value" &&
        (r.minimum > r.maximum.value || r.reserved > r.maximum.value)
      )
        issue(["roles", i], "最低或保留位超出職務上限");
    });
    const pools = new Set<string>();
    const priorities = new Set<number>();
    p.release_rules.forEach((r, i) => {
      if ("state" in r) return;
      if (priorities.has(r.priority)) issue(["release_rules", i], "補位優先次序不可重複");
      priorities.add(r.priority);
      if (r.action.type === "release_reserved") {
        const action = r.action;
        const role = p.roles.find((role) => role.key === action.pool);
        if (!role || r.action.quantity > role.reserved)
          issue(["release_rules", i], "釋放池不存在或釋放數超出保留位");
        if (pools.has(r.action.pool)) issue(["release_rules", i], "不可重複釋放同一保留池");
        pools.add(r.action.pool);
      } else {
        const a = r.action;
        const quota =
          a.scope === "session"
            ? p.tier_quotas.find((q) => q.key === a.quota)
            : p.daily_limits.find((q) => q.key === a.quota && q.scope === a.scope);
        if (!quota) issue(["release_rules", i], "放寬配額或作用域不存在");
      }
    });
  });
export type PolicyDraft = z.infer<typeof policyDraftSchema>;
export function getPolicyReadiness(policy: PolicyDraft): {
  ready: boolean;
  issues: { path: string; message: string }[];
} {
  const issues: { path: string; message: string }[] = [];
  function visit(value: unknown, path: string) {
    if (!value || typeof value !== "object") return;
    if ("state" in value && (value.state === "unresolved" || value.state === "inherit")) {
      issues.push({
        path,
        message:
          value.state === "inherit"
            ? "需要解析繼承值"
            : String("reason" in value ? value.reason : "未完成設定"),
      });
      return;
    }
    for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
  }
  if (
    policy.capacity.volunteers.state === "unlimited" ||
    (policy.capacity.volunteers.state === "value" && policy.capacity.volunteers.value === 0)
  )
    issues.push({ path: "capacity.volunteers", message: "啟用模板需要有限正數義工容量" });
  policy.release_rules.forEach((rule, index) => {
    if (!("state" in rule) && typeof rule.semantics !== "string")
      issues.push({
        path: `release_rules.${index}.semantics`,
        message: "補位需要明選動態或一次釋放",
      });
    if (
      !("state" in rule) &&
      rule.action.type === "relax_quota" &&
      rule.action.scope !== "session" &&
      typeof rule.action.daily_anchor !== "string"
    )
      issues.push({
        path: `release_rules.${index}.action.daily_anchor`,
        message: "每日補位需要明選首場或末場作時間基準",
      });
  });
  if (policy.inheritance?.length)
    issues.push({ path: "inheritance", message: "請預覽解析共用／場地來源後發布" });
  visit(policy, "");
  return { ready: issues.length === 0, issues };
}
export const policyReadySchema = policyDraftSchema.superRefine((p, ctx) => {
  for (const issue of getPolicyReadiness(p).issues)
    ctx.addIssue({ code: "custom", path: issue.path.split("."), message: issue.message });
});

/** Configuration arithmetic only. Database command remains authoritative for admission. */
export function countCatGroupSeats(
  group: number,
  leader: number,
  assistants: number,
  newcomers: number,
  model: "leader_separate" | "leader_in_assistants",
  total: number,
) {
  for (const value of [group, leader, assistants, newcomers, total]) count.parse(value);
  const occupied = group + assistants + newcomers + (model === "leader_separate" ? leader : 0);
  return {
    occupied,
    remaining: Math.max(0, total - occupied),
    feasible: occupied <= total && (model === "leader_separate" || leader <= assistants),
  };
}
export const monthlyPolicySchema = z
  .object({
    regular_attendance_threshold: count,
    senior_years: z.number().min(0).max(100),
    senior_regular_observation_months: configurable(count),
    attendance_unit: configurable(z.enum(["once_per_day", "each_verified_nonoverlapping_session"])),
    shelter_scope: configurable(z.enum(["combined", "separate"])),
    promotion_trigger: configurable(z.enum(["verified_attendance", "monthly_assessment"])),
    regular_monthly_minimum: count,
    senior_monthly_minimum: count,
    regular_zero_months: count,
    senior_zero_months: count,
    senior_auto_demotion: z.literal(false),
    assessment_day: z.number().int().min(1).max(31),
    assessment_time: configurable(time),
    short_month: z.enum(["last_day", "skip"]),
    timezone: z.string(),
    notifications: z
      .object({
        enabled: z.boolean(),
        dry_run: z.boolean(),
        channels: z.array(z.enum(["email", "whatsapp"])).max(2),
        regular_template: z.string().max(2000),
        senior_template: z.string().max(2000),
        max_attempts: z.number().int().min(1).max(20),
      })
      .strict(),
  })
  .strict();
