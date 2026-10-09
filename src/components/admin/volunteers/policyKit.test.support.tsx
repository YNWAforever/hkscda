/**
 * Fixtures for the English and Chinese render tests of the volunteer policy and settings screens
 * (`Policy*English.test.tsx` and the like). It holds no test of its own; it is named like a test file so
 * the admin Chinese guard treats the Chinese below as test data.
 *
 * It installs the same mocks as `volunteerKit.test.support.tsx` (by importing it), so a test file imports
 * this one with `await import` before it imports a screen.
 *
 * The Chinese here is data that staff typed: the names of templates, roles, venues and qualifications and
 * the notes on a registration form. None of it is a word a screen uses as a label, so a Chinese label that
 * leaks into the English screen cannot hide in it. A saved draft is built from the catalogue's draft with
 * every Chinese name replaced by one of these, so the screens show what staff would have typed.
 */
import {
  initialMonthlyPolicy,
  initialPolicyCatalogue,
} from "../../../lib/volunteers/policy/catalogue";
import { policyReason } from "../../../lib/volunteers/policy/messages";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import * as kit from "./volunteerKit.test.support";

export { kit };

export const POLICY_TEXT = {
  templates: [
    "雙週早班",
    "單週午班",
    "月初大掃除",
    "夜貓社教",
    "狗仔早操",
    "領犬訓練日",
    "車隊接送",
    "週末義賣",
    "探訪長者",
  ],
  location: "荃灣中心",
  locationTwo: "荃灣中心新翼",
  guide: "導賞員",
  driver: "接駁司機",
  remarkLabel: "叮囑事項",
  remarkHint: "請寫明可出席的時間",
  remarkOptions: ["餵貓", "梳毛"],
  venues: ["荃灣動物之家", "元朗中心"],
  qualifications: ["急救證書", "駕駛牌照"],
  evidence: "證書編號 123",
  reminder: "多謝你的付出",
  care: "期待再見",
  volunteer: "黃雅達",
  failure: "網絡超時",
} as const;

/** All the Chinese data above, for the tests that allow it in an English screen. */
export const POLICY_ALLOW: string[] = [
  ...POLICY_TEXT.templates,
  POLICY_TEXT.location,
  POLICY_TEXT.locationTwo,
  POLICY_TEXT.guide,
  POLICY_TEXT.driver,
  POLICY_TEXT.remarkLabel,
  POLICY_TEXT.remarkHint,
  ...POLICY_TEXT.remarkOptions,
  ...POLICY_TEXT.venues,
  ...POLICY_TEXT.qualifications,
  POLICY_TEXT.evidence,
  POLICY_TEXT.reminder,
  POLICY_TEXT.care,
  POLICY_TEXT.volunteer,
  POLICY_TEXT.failure,
  ...Object.values(kit.FIXTURE),
];

/** The built-in names of the catalogue, which the template picker of the advanced fields reads as data. */
export const CATALOGUE_NAMES: string[] = initialPolicyCatalogue.map((policy) => policy.name);

/** The catalogue's draft with the given key, cloned, its Chinese names replaced by data from above. */
export function cleanDraft(key = "cat-cleaning-a", over: (draft: PolicyDraft) => void = () => {}) {
  const index = initialPolicyCatalogue.findIndex((policy) => policy.template_key === key);
  const draft = structuredClone(initialPolicyCatalogue[index]);
  draft.name = POLICY_TEXT.templates[index];
  if (typeof draft.schedule.location === "string") draft.schedule.location = POLICY_TEXT.location;
  draft.remarks = {
    ...draft.remarks,
    label: POLICY_TEXT.remarkLabel,
    hint: POLICY_TEXT.remarkHint,
    options: [...POLICY_TEXT.remarkOptions],
  };
  draft.roles = draft.roles.map((role, i) => ({
    ...role,
    label: i % 2 ? POLICY_TEXT.driver : POLICY_TEXT.guide,
  }));
  if (draft.eligibility.missing_credentials_message) {
    draft.eligibility.missing_credentials_message = POLICY_TEXT.remarkHint;
  }
  over(draft);
  return draft;
}

/** Every catalogue draft as a saved draft, so the template picker shows data and not the built-in names. */
export function savedDrafts(revision = 3) {
  return initialPolicyCatalogue.map((policy) => ({
    template_key: policy.template_key,
    body: cleanDraft(policy.template_key),
    revision,
  }));
}

/** A draft that uses every kind of setting the advanced fields can show, each in more than one state. */
export function richDraft(): PolicyDraft {
  return cleanDraft("cat-cleaning-a", (draft) => {
    // A registered venue the catalogue has no template for, so the picker of templates stays empty.
    draft.shelter = "venue-yuen-long";
    draft.booking.scenario = "confirmed_group";
    draft.booking.individual_open = { mode: "hours_before", value: 168 };
    draft.booking.individual_close = { mode: "calendar_days_before", value: 1, at: "18:00" };
    draft.booking.group_open = { mode: "unrestricted" };
    draft.booking.group_close = { mode: "disabled" };
    draft.booking.cancellation_close = {
      state: "unresolved",
      reason: policyReason("pending_admin"),
    };
    draft.booking.group_freeze = { state: "inherit" };
    draft.booking.late_group_change = "revalidate";
    draft.booking.waitlist_limit = { state: "unlimited" };
    draft.booking.auto_approve = true;
    draft.booking.allow_waitlist = true;
    draft.capacity.volunteers = { state: "value", value: 25 };
    draft.capacity.visitors = { state: "unlimited" };
    draft.capacity.shared_total = { state: "inherit" };
    draft.capacity.group_in_shared_total = {
      state: "unresolved",
      reason: policyReason("pending_admin"),
    };
    draft.capacity.group_size = { minimum: 10, maximum: 15 };
    draft.capacity.role_count_model = "leader_in_assistants";
    draft.eligibility.credentials = { mode: "any", keys: ["socialisation_training"] };
    draft.tier_quotas = [
      {
        key: "newcomers",
        tiers: ["newcomer"],
        maximum: { state: "value", value: 5 },
        weekdays: [0, 6],
      },
      {
        key: "mid_week",
        tiers: ["newcomer", "regular"],
        maximum: { state: "inherit" },
        weekdays: { state: "unresolved", reason: policyReason("pending_admin") },
      },
    ];
    draft.daily_limits = [
      {
        key: "daily_newcomers",
        tiers: ["newcomer"],
        maximum: { state: "value", value: 8 },
        scope: "shelter_day",
        count_mode: "distinct_people",
        include_group_visitors: false,
      },
      {
        key: "all_venues_cap",
        tiers: ["newcomer", "regular", "senior"],
        maximum: { state: "unresolved", reason: policyReason("pending_admin") },
        scope: "all_shelters_day",
        count_mode: { state: "unresolved", reason: policyReason("pending_admin") },
        include_group_visitors: { state: "inherit" },
      },
    ];
    draft.release_rules = [
      { state: "unresolved", reason: policyReason("cat_late_release_pending") },
      {
        key: "release_leader",
        priority: 1,
        semantics: "dynamic",
        within_hours: 48,
        condition: { tiers: ["regular", "senior"], operator: "lt", threshold: 2 },
        action: { type: "release_reserved", pool: "leader", quantity: 1 },
        allowed_tiers: ["newcomer"],
        credentials: { mode: "all", keys: [] },
        weekdays: "preserve",
      },
      {
        key: "relax_daily",
        priority: 2,
        within_hours: 24,
        condition: {
          tiers: ["senior"],
          operator: "lte",
          threshold: { state: "unresolved", reason: policyReason("enter_experienced_threshold") },
        },
        action: {
          type: "relax_quota",
          quota: "daily_newcomers",
          new_maximum: 12,
          scope: "all_shelters_day",
          daily_anchor: { state: "unresolved", reason: policyReason("pending_admin") },
        },
        allowed_tiers: ["newcomer", "regular"],
        credentials: { mode: "any", keys: ["driving_license"] },
        weekdays: [1, 3],
      },
    ];
  });
}

/** What the registry of venues and qualifications answers, in the shape of `SourceListing`. */
export function registry() {
  return {
    shelters: [
      {
        key: "cat",
        label: POLICY_TEXT.venues[0],
        timezone: "Asia/Hong_Kong",
        location: POLICY_TEXT.location,
        revision: 2,
      },
      {
        key: "venue-yuen-long",
        label: POLICY_TEXT.venues[1],
        timezone: "Asia/Hong_Kong",
        location: POLICY_TEXT.location,
        revision: 1,
      },
    ],
    credentials: [
      { key: "socialisation_training", label: POLICY_TEXT.qualifications[0], revision: 1 },
      { key: "driving_license", label: POLICY_TEXT.qualifications[1], revision: 4 },
    ],
    sources: [{ scope_key: "common", revision: 2, current_version_id: "version-common" }],
    drafts: savedDrafts().map((draft) => ({
      template_key: draft.template_key,
      name: draft.body.name,
      revision: draft.revision,
    })),
  };
}

/** The list the policy settings screen reads. */
export function settingsList(over: Record<string, unknown> = {}, key = "cat-cleaning-a") {
  return {
    drafts: savedDrafts(),
    versions: [
      {
        id: "version-1",
        template_key: key,
        effective_from: "2026-10-01T00:00:00Z",
        reason: POLICY_TEXT.remarkHint,
      },
    ],
    activities: [
      {
        id: "activity-1",
        title: kit.FIXTURE.activity,
        starts_at: "2026-10-10T01:00:00Z",
        capacity: 12,
        template_key: key,
        approved_participants: 4,
        waitlisted_participants: 1,
      },
      {
        id: "activity-2",
        title: kit.FIXTURE.activity,
        starts_at: "2026-10-12T01:00:00Z",
        capacity: 1234,
        template_key: null,
        approved_participants: 1200,
        waitlisted_participants: 3,
      },
    ],
    activity_total: 800,
    activity_limit: 500,
    ...over,
  };
}

/** A preview of publishing the draft, with a session in each kind of conflict. */
export function policyPreview(over: Record<string, unknown> = {}) {
  const previous = cleanDraft("cat-afternoon-chores", (draft) => {
    draft.capacity.volunteers = { state: "value", value: 5 };
  });
  const candidate = cleanDraft("cat-afternoon-chores", (draft) => {
    draft.name = POLICY_TEXT.templates[1];
    draft.capacity.volunteers = { state: "value", value: 6 };
    draft.schedule.weekdays = [1, 3];
    draft.booking.scenario = "confirmed_group";
    draft.booking.group_freeze = "at_session_start";
    draft.eligibility.credentials = {
      mode: "any",
      keys: ["socialisation_training", "unlisted_key"],
    };
    draft.schedule.location = POLICY_TEXT.locationTwo;
    draft.schedule.effective_from = "2026-10-01";
    draft.remarks.required = true;
  });
  return {
    preview_id: "preview-1",
    candidate,
    previous,
    issues: [],
    manifest: [
      {
        id: "activity-1",
        title: kit.FIXTURE.activity,
        starts_at: "2026-10-10T01:00:00Z",
        capacity: 1200,
        template_key: "cat-afternoon-chores",
        approved_participants: 4,
        waitlisted_participants: 1,
        conflicts: [],
      },
      {
        id: "activity-2",
        title: kit.FIXTURE.activity,
        starts_at: "2026-10-12T01:00:00Z",
        capacity: 3,
        template_key: "cat-afternoon-chores",
        approved_participants: 4,
        waitlisted_participants: 0,
        conflicts: ["historical_session", "capacity_below_occupancy", "mystery_conflict"],
      },
    ],
    ...over,
  };
}

/** The monthly policy with its Chinese text replaced, as the assessments page would load it. */
export function monthlyPolicy(over: Record<string, unknown> = {}) {
  return {
    ...structuredClone(initialMonthlyPolicy),
    regular_attendance_threshold: 10,
    senior_regular_observation_months: 6,
    attendance_unit: "once_per_day",
    shelter_scope: "combined",
    promotion_trigger: "monthly_assessment",
    assessment_time: "09:30",
    notifications: {
      enabled: true,
      dry_run: false,
      channels: ["email"],
      regular_template: POLICY_TEXT.reminder,
      senior_template: POLICY_TEXT.care,
      max_attempts: 3,
    },
    ...over,
  } as typeof initialMonthlyPolicy;
}

/** The raw keys, codes and field paths that a screen in English must not show as text. */
export function rawKeysIn(markup: string, allow: string[] = []): string[] {
  const text = markup
    .replace(/<[^>]*>/g, "\n")
    .replace(/&[a-z#0-9]+;/g, " ")
    .split("\n")
    .join(" ");
  const found = text.match(/\b[a-z][a-z0-9]*(?:[_.][a-z0-9]+)+\b/g) ?? [];
  return [...new Set(found)].filter((word) => !allow.includes(word));
}
