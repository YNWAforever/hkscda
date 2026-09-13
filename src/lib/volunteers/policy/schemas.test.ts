import { describe, expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
import {
  getPolicyReadiness,
  policyDraftSchema,
  policyReadySchema,
  countCatGroupSeats,
  limitSchema,
} from "./schemas";

describe("bounded volunteer policy", () => {
  test("catalogue drafts preserve unresolved decisions without blocking afternoon", () => {
    for (const policy of initialPolicyCatalogue)
      expect(policyDraftSchema.safeParse(policy).success).toBe(true);
    expect(
      policyReadySchema.safeParse(
        initialPolicyCatalogue.find((p) => p.template_key === "cat-afternoon-chores"),
      ).success,
    ).toBe(true);
    expect(
      policyReadySchema.safeParse(
        initialPolicyCatalogue.find((p) => p.template_key === "dog-cleaning-b"),
      ).success,
    ).toBe(false);
  });
  test("capacities are editable values, not permanent client constants", () => {
    for (const [key, value] of [
      ["cat-afternoon-chores", 6],
      ["dog-cleaning-b", 12],
    ] as const) {
      const policy = structuredClone(initialPolicyCatalogue.find((p) => p.template_key === key)!);
      policy.capacity.volunteers = { state: "value", value };
      expect(policyDraftSchema.safeParse(policy).success).toBe(true);
    }
  });
  test("inherit, zero, unlimited and unresolved are distinct", () => {
    for (const value of [
      { state: "inherit" },
      { state: "value", value: 0 },
      { state: "unlimited" },
      { state: "unresolved", reason: "待選" },
    ])
      expect(limitSchema.safeParse(value).success).toBe(true);
    expect(limitSchema.safeParse({ state: "value", value: -1 }).success).toBe(false);
  });
  test("rejects scripts, arbitrary operators and excessive reservations", () => {
    const policy = structuredClone(initialPolicyCatalogue[0]);
    expect(policyDraftSchema.safeParse({ ...policy, script: "eval(1)" }).success).toBe(false);
    expect(
      policyDraftSchema.safeParse({ ...policy, release_rules: [{ operator: "execute_sql" }] })
        .success,
    ).toBe(false);
    policy.roles = [
      {
        key: "helper",
        label: "輔助",
        minimum: 0,
        reserved: 6,
        maximum: { state: "unlimited" },
        allowed_tiers: ["regular"],
        credentials: { mode: "all", keys: [] },
      },
    ];
    expect(policyDraftSchema.safeParse(policy).success).toBe(false);
  });
  test("CFG-06/07 client arithmetic, including leader included model", () => {
    expect(countCatGroupSeats(10, 1, 8, 5, "leader_separate", 25)).toEqual({
      occupied: 24,
      remaining: 1,
      feasible: true,
    });
    expect(countCatGroupSeats(15, 1, 8, 1, "leader_separate", 25).occupied).toBe(25);
    expect(countCatGroupSeats(15, 1, 8, 5, "leader_separate", 25).feasible).toBe(false);
    expect(countCatGroupSeats(15, 1, 10, 0, "leader_separate", 25).occupied).toBe(26);
    expect(countCatGroupSeats(15, 1, 10, 0, "leader_in_assistants", 25).feasible).toBe(true);
  });
});

test("CFG16 relax quota needs no pool; unknown operators and mismatched scopes rejected", () => {
  const p = structuredClone(
    initialPolicyCatalogue.find((p) => p.template_key === "dog-cleaning-b")!,
  );
  p.booking.group_open = { mode: "disabled" };
  p.booking.group_close = { mode: "disabled" };
  p.daily_limits[0].count_mode = "distinct_people";
  p.release_rules = [
    {
      key: "late_newcomers",
      priority: 1,
      semantics: "dynamic",
      within_hours: 48,
      condition: { tiers: ["regular", "senior"], operator: "lt", threshold: 5 },
      action: {
        type: "relax_quota",
        quota: "dog_newcomers",
        new_maximum: 10,
        scope: "shelter_day",
        daily_anchor: "first_session",
      },
      allowed_tiers: ["newcomer"],
      credentials: { mode: "all", keys: [] },
      weekdays: "preserve",
    },
  ];
  expect(policyReadySchema.safeParse(p).success).toBe(true);
  const raw = JSON.parse(JSON.stringify(p));
  raw.release_rules[0].condition.operator = "eval";
  expect(policyDraftSchema.safeParse(raw).success).toBe(false);
  raw.release_rules[0].condition.operator = "lt";
  raw.release_rules[0].action.scope = "session";
  expect(policyDraftSchema.safeParse(raw).success).toBe(false);
});

test("invalid temporal windows and zero active capacity rejected", () => {
  const p = structuredClone(initialPolicyCatalogue[0]);
  p.booking.individual_open = { mode: "hours_before", value: 24 };
  p.booking.individual_close = { mode: "hours_before", value: 48 };
  expect(policyDraftSchema.safeParse(p).success).toBe(false);
  p.booking.individual_close = { mode: "hours_before", value: 0 };
  p.capacity.volunteers = { state: "value", value: 0 };
  expect(policyReadySchema.safeParse(p).success).toBe(false);
});

test("publication requires finite positive volunteer capacity; competing maxima are not summed", () => {
  const p = structuredClone(initialPolicyCatalogue[0]);
  p.capacity.volunteers = { state: "unlimited" };
  expect(policyDraftSchema.safeParse(p).success).toBe(true);
  expect(policyReadySchema.safeParse(p).success).toBe(false);
  p.capacity.volunteers = { state: "value", value: 5 };
  p.roles = [
    {
      key: "one",
      label: "職務一",
      minimum: 0,
      reserved: 0,
      maximum: { state: "value", value: 5 },
      allowed_tiers: ["regular"],
      credentials: { mode: "all", keys: [] },
    },
    {
      key: "two",
      label: "職務二",
      minimum: 0,
      reserved: 0,
      maximum: { state: "value", value: 5 },
      allowed_tiers: ["senior"],
      credentials: { mode: "all", keys: [] },
    },
  ];
  expect(policyReadySchema.safeParse(p).success).toBe(true);
});

test("actual invalid calendar dates and reversed windows fail", () => {
  const p = structuredClone(initialPolicyCatalogue[0]);
  p.schedule.effective_from = "2026-02-30";
  expect(policyDraftSchema.safeParse(p).success).toBe(false);
  p.schedule.effective_from = "2026-02-01";
  p.booking.individual_open = { mode: "calendar_days_before", value: 7, at: "15:00" };
  p.booking.individual_close = { mode: "calendar_days_before", value: 7, at: "14:00" };
  expect(policyDraftSchema.safeParse(p).success).toBe(false);
  p.booking.individual_close = { mode: "calendar_days_before", value: 7, at: "15:00" };
  expect(policyDraftSchema.safeParse(p).success).toBe(true);
});

test("daily release anchor is an explicit publication decision", () => {
  const p = structuredClone(
    initialPolicyCatalogue.find((p) => p.template_key === "dog-cleaning-b")!,
  );
  p.booking.group_open = { mode: "disabled" };
  p.booking.group_close = { mode: "disabled" };
  p.daily_limits[0].count_mode = "distinct_people";
  p.release_rules = [
    {
      key: "late_daily",
      priority: 1,
      semantics: "dynamic",
      within_hours: 48,
      condition: { tiers: ["regular", "senior"], operator: "lt", threshold: 2 },
      action: {
        type: "relax_quota",
        quota: "dog_newcomers",
        scope: "shelter_day",
        new_maximum: 10,
      },
      allowed_tiers: ["newcomer"],
      credentials: { mode: "all", keys: [] },
      weekdays: "preserve",
    },
  ];
  expect(policyDraftSchema.safeParse(p).success).toBe(true);
  expect(policyReadySchema.safeParse(p).success).toBe(false);
  const r = p.release_rules[0];
  if ("state" in r || r.action.type !== "relax_quota") throw new Error("Fixture");
  r.action.daily_anchor = "last_session";
  expect(policyReadySchema.safeParse(p).success).toBe(true);
});

test("release semantics requires an explicit publication choice", () => {
  const p = structuredClone(initialPolicyCatalogue[0]);
  p.release_rules = [
    {
      key: "late",
      priority: 1,
      within_hours: 48,
      condition: { tiers: ["senior"], operator: "lt", threshold: 1 },
      action: { type: "relax_quota", quota: "regular", scope: "session", new_maximum: 5 },
      allowed_tiers: ["regular"],
      credentials: { mode: "all", keys: [] },
      weekdays: "preserve",
    },
  ];
  expect(getPolicyReadiness(p).issues.some((i) => i.path === "release_rules.0.semantics")).toBe(
    true,
  );
});
