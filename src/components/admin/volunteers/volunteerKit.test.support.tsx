/**
 * Shared set-up for the English and Chinese render tests of the volunteer screens
 * (`Volunteer*English.test.tsx`). It holds no test of its own; it is named like a test file so the
 * admin Chinese guard treats the Chinese fixtures below as test data.
 *
 * Importing it installs the mocks, so a test file imports it with `await import` before it imports
 * a screen (the kit has no top-level `await` of its own, which a dynamic import does not wait for):
 *
 *   const kit = await import("./volunteerKit.test.support");
 *   const { VolunteerOverview } = await import("./VolunteerOverview");
 *
 * The screens read their data with `useQuery` and change it with `useMutation`. The mocks answer
 * `useQuery` from `kit.state.queries`, keyed by the first part of the query key, and give every
 * `useMutation` the error in `kit.state.mutationError` (`null` for none) and the result in
 * `kit.state.mutationData` (`undefined` for none, which also means it has not succeeded). Nothing is
 * numbered by call order, so a screen can gain or lose a hook without breaking a test. A key with no
 * answer shows as loading.
 */
import { mock } from "bun:test";
import type { ReactNode } from "react";
import * as realQuery from "@tanstack/react-query";
import * as realRouter from "@tanstack/react-router";

export type TestRole = "staff" | "admin" | "treasurer" | null;

export const state = {
  pathname: "/admin/volunteers",
  role: "admin" as TestRole,
  queries: {} as Record<string, unknown>,
  mutationError: null as unknown,
  mutationData: undefined as unknown,
};

/** Text as it appears in rendered markup, where React escapes quotes, ampersands and angle brackets. */
export function html(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Runs `work` with these answers for `useQuery` (and nothing for any other key). */
export function withQueries(queries: Record<string, unknown>, work: () => void) {
  const previous = state.queries;
  state.queries = queries;
  try {
    work();
  } finally {
    state.queries = previous;
  }
}

/** Runs `work` with every mutation failing with `error`. */
export function withMutationError(error: unknown, work: () => void) {
  const previous = state.mutationError;
  state.mutationError = error;
  try {
    work();
  } finally {
    state.mutationError = previous;
  }
}

/** Runs `work` with every mutation having succeeded with `data`. */
export function withMutationData(data: unknown, work: () => void) {
  const previous = state.mutationData;
  state.mutationData = data;
  try {
    work();
  } finally {
    state.mutationData = previous;
  }
}

/** An answer for a query that succeeded. */
export const ok = (data: unknown) => ({ data, isSuccess: true });
/** An answer for a query that failed. */
export const failed = (error: unknown = new Error("boom")) => ({ error, isError: true });

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    children,
    to,
    params,
    className,
    "aria-current": ariaCurrent,
  }: {
    children?: ReactNode;
    to: string;
    params?: { id?: string };
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={to.replace("$id", params?.id ?? "")} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
  useNavigate: () => async () => {},
  useBlocker: () => ({ status: "idle", reset() {}, proceed() {} }),
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname } }),
}));

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: () => {}, clear: () => {} }),
  useMutation: () => ({
    mutate: () => {},
    isPending: false,
    isError: state.mutationError !== null,
    error: state.mutationError,
    data: state.mutationData,
    isSuccess: state.mutationData !== undefined,
    reset: () => {},
  }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0]);
    if (key === "admin-me") {
      return {
        data: state.role ? { admin: { email: "staff@example.org", role: state.role } } : undefined,
      };
    }
    const base = {
      data: undefined,
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isSuccess: false,
      isPlaceholderData: false,
      refetch: () => {},
    };
    const found = state.queries[key];
    if (found && typeof found === "object") return { ...base, ...found };
    return { ...base, isLoading: true, isPending: true };
  },
}));

/**
 * Chinese in these fixtures is data staff or volunteers typed, so the English tests allow it. None
 * of it is a word the screens use as a label.
 */
export const FIXTURE = {
  organisation: "聖士提反書院",
  contact: "陳大文",
  volunteer: "黃雅達",
  activity: "週末晨更",
  location: "荃灣",
  role: "領犬隊",
  template: "雙週早班",
  evidence: "證書編號 123",
  reason: "電話確認過",
  note: "跟進電話已打",
  message: "希望安排一節講座",
  ageProfile: "中四至中六",
  dates: "十月任何週六",
  terms: "本人同意遵守守則",
  error: "網絡超時",
} as const;
export const FIXTURE_TEXT: string[] = Object.values(FIXTURE);

// ---------- the volunteer directory and a person
export const profile = (over: Record<string, unknown> = {}) => ({
  id: "profile-1",
  display_name: FIXTURE.volunteer,
  birth_date: "1990-01-01",
  tier: "newcomer",
  status: "pending",
  verified_at: null,
  joined_on: "2025-05-01",
  history_coverage_start: null,
  revision: 1,
  linked_email: "fixture@example.test",
  email_verified: true,
  account_linked: true,
  ...over,
});

export const directoryProfiles = [
  profile(),
  profile({
    id: "profile-2",
    display_name: "",
    tier: "regular",
    status: "active",
    verified_at: "2026-09-01T02:00:00Z",
    email_verified: false,
  }),
  profile({
    id: "profile-3",
    tier: "senior",
    status: "suspended",
    account_linked: false,
    linked_email: null,
  }),
  profile({ id: "profile-4", linked_email: null }),
];

export const personDetail = (over: Record<string, unknown> = {}) => ({
  profile: profile({ verified_at: "2026-09-01T02:00:00Z", status: "active", tier: "regular" }),
  credentials: [
    {
      id: "credential-1",
      credential_key: "key-1",
      label: FIXTURE.role,
      valid_from: "2026-01-01",
      valid_until: "2027-01-01",
      revoked_at: null,
      evidence: FIXTURE.evidence,
    },
    {
      id: "credential-2",
      credential_key: "key-2",
      label: FIXTURE.role,
      valid_from: "2025-01-01",
      valid_until: null,
      revoked_at: "2026-06-01T00:00:00Z",
      evidence: "",
    },
  ],
  registrations: [
    {
      id: "registration-1",
      activity_id: "activity-1",
      title: FIXTURE.activity,
      starts_at: "2026-10-10T01:00:00Z",
      ends_at: null,
      status: "approved",
      attendance_status: "completed",
      volunteer_hours: 3,
      duty_role: null,
    },
    {
      id: "registration-2",
      activity_id: "activity-2",
      title: FIXTURE.activity,
      starts_at: "2026-10-11T01:00:00Z",
      ends_at: null,
      status: "mystery_status",
      attendance_status: "mystery_attendance",
      volunteer_hours: null,
      duty_role: null,
    },
  ],
  attendance_events: [
    {
      id: "event-1",
      registration_id: "registration-1",
      command: "correct",
      reason: FIXTURE.reason,
      before_fact: { attendanceStatus: "attended", volunteerHours: 2 },
      after_fact: { attendanceStatus: "completed", volunteerHours: 3 },
      recorded_at: "2026-10-10T08:00:00Z",
    },
    {
      id: "event-2",
      registration_id: "registration-2",
      command: "record",
      reason: null,
      before_fact: {},
      after_fact: { attendanceStatus: "mystery_attendance" },
      recorded_at: "2026-10-11T08:00:00Z",
    },
  ],
  verification_history: [
    "claim",
    "verify",
    "suspend",
    "credential",
    "revoke",
    "update_profile",
    "mystery_event",
  ].map((event_type, index) => ({
    id: `verification-${index}`,
    event_type,
    reason: index % 2 ? "" : FIXTURE.reason,
    created_at: `2026-09-0${index + 1}T02:00:00Z`,
    actor_user_id: `actor-${index}`,
  })),
  coverage: {
    history_coverage_start: "2025-01-01",
    registration_total: 12,
    attendance_event_total: 7,
    verification_event_total: 9,
    credential_total: 3,
    records_limit: 100,
    scope: "linked_profile_records_only",
  },
  ...over,
});

// ---------- activities and registrations
export const activitySummary = (over: Record<string, unknown> = {}) => ({
  id: "activity-1",
  type: "cleaning_day",
  title: FIXTURE.activity,
  description: null,
  startsAt: "2026-08-01T02:00:00.000Z",
  endsAt: "2026-08-01T05:00:00.000Z",
  location: FIXTURE.location,
  capacity: 12,
  approvedParticipants: 4,
  pendingParticipants: 2,
  waitlistedParticipants: 1,
  remainingCapacity: 8,
  allowWaitlist: true,
  autoApprove: false,
  minAge: 16,
  underagePolicy: "allow_with_guardian_pending",
  registrationModes: ["individual", "group"],
  status: "published",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

export const registrationSummary = (over: Record<string, unknown> = {}) => ({
  id: "registration-1",
  activityId: "activity-1",
  supporterId: "supporter-1",
  registrationType: "group",
  status: "pending",
  statusReason: null,
  attendanceStatus: "not_marked",
  participantCount: 6,
  contactName: FIXTURE.volunteer,
  contactEmail: "ada@example.com",
  contactPhone: "91234567",
  language: "zh-HK",
  organizationName: FIXTURE.organisation,
  declaredAge: 30,
  youngestAge: 15,
  guardianName: FIXTURE.contact,
  guardianPhone: "98765432",
  notes: null,
  internalNotes: null,
  volunteerHours: null,
  statusToken: null,
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  activity: activitySummary(),
  ...over,
});

export const registrationDetail = (over: Record<string, unknown> = {}) => ({
  id: "registration-1",
  updatedAt: "2026-09-05T00:00:00.123456+00:00",
  contactName: FIXTURE.volunteer,
  contactEmail: "ada@example.com",
  contactPhone: "91234567",
  status: "pending",
  attendanceStatus: "not_marked",
  participantCount: 6,
  registrationType: "group",
  organizationName: FIXTURE.organisation,
  declaredAge: 30,
  youngestAge: 15,
  guardianName: FIXTURE.contact,
  volunteerHours: 3,
  notes: FIXTURE.note,
  profileId: "profile-1",
  activity: {
    title: FIXTURE.activity,
    startsAt: "2026-09-06T00:00:00Z",
    endsAt: "2026-09-06T02:00:00Z",
    status: "published",
    remainingCapacity: 4,
  },
  ...over,
});

// ---------- the activity workspace
export const workspaceRow = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: FIXTURE.activity,
  starts_at: "2026-10-10T01:00:00Z",
  ends_at: "2026-10-10T04:00:00Z",
  location: FIXTURE.location,
  status: "published",
  capacity: 12,
  template_key: "cat_saturday",
  shelter_key: "cat",
  policy_version_id: "policy-version-1",
  policy_revision: 3,
  updated_at: "2026-10-01T00:00:00Z",
  scenario: "confirmed_group",
  approved: 8,
  waitlisted: 2,
  shortages: [{ role: FIXTURE.role, missing: 2 }],
  registrations_closed_at: "2026-10-09T00:00:00Z",
  ...over,
});

export const workspaceRows = [
  workspaceRow(),
  workspaceRow({
    id: "22222222-2222-4222-8222-222222222222",
    status: "draft",
    template_key: null,
    shelter_key: null,
    policy_version_id: null,
    scenario: null,
    ends_at: null,
    shortages: [],
    registrations_closed_at: null,
  }),
  workspaceRow({
    id: "33333333-3333-4333-8333-333333333333",
    status: "closed",
    scenario: "no_confirmed_group",
    starts_at: "2026-10-12T01:00:00Z",
    shelter_key: "dog",
  }),
  workspaceRow({
    id: "44444444-4444-4444-8444-444444444444",
    status: "cancelled",
    scenario: "other",
    starts_at: "2026-11-30T01:00:00Z",
    shelter_key: "mystery_shelter",
  }),
  workspaceRow({
    id: "55555555-5555-4555-8555-555555555555",
    status: "mystery_status",
    starts_at: "2026-10-10T09:00:00Z",
  }),
];

export const workspaceTemplates = [
  {
    template_key: "cat_saturday",
    name: FIXTURE.template,
    version_id: "version-1",
    shelter: "cat",
    start_time: "09:00",
    end_time: "12:00",
  },
  {
    template_key: "dog_sunday",
    name: FIXTURE.template,
    version_id: "version-2",
    shelter: "dog",
    start_time: "10:00",
    end_time: "13:00",
  },
];

/** A saved bulk operation with a ready batch, a failed one, a skipped item and a notification of each kind. */
export function bulkOperation(over: Record<string, unknown> = {}) {
  const item = (key: string, state: string, extra: Record<string, unknown> = {}) => ({
    date: "2026-10-10",
    template_key: "cat_saturday",
    item_key: key,
    state,
    preview: { kind: "generated" },
    ...extra,
  });
  return {
    id: "99999999-9999-4999-8999-999999999999",
    action: "generate",
    selection: [workspaceRow()],
    created_at: "2026-10-09T01:00:00Z",
    expires_at: "2026-10-09T02:00:00Z",
    groups: [
      {
        index: 0,
        date: "2026-10-10",
        state: "pending",
        items: [
          item("item-a", "ready", { title: FIXTURE.activity, policy_version_id: "version-1" }),
        ],
      },
      {
        index: 1,
        date: "2026-10-11",
        state: "failed",
        reason: "transaction_failed",
        items: [
          item("item-b", "failed", {
            template_key: "mystery_template",
            policy_version_id: "version-9",
            preview: {
              kind: "edit",
              reason: "stale_preview",
              issues: ["date_closed", "capacity_full"],
              after: {
                title: FIXTURE.activity,
                starts_at: "2026-10-11T01:00:00Z",
                shelter_key: "dog",
                capacity: 10,
              },
              registrations: [{ kind: "applied" }, { kind: "skipped" }],
            },
            approved: 3,
            capacity: 8,
            starts_at: "2026-10-11T01:00:00Z",
            result: { kind: "failed" },
          }),
        ],
      },
      {
        index: 2,
        date: "2026-10-12",
        state: "conflicted",
        items: [
          item("item-c", "skipped", { template_key: "unknown_template", policy_version_id: null }),
        ],
      },
    ],
    notifications: [
      {
        id: "n-1",
        kind: "volunteer_operation_changed",
        queue_status: "delivered",
        follow_up: "open",
        completed_at: "2026-10-09T01:30:00Z",
        provider_message_id: null,
      },
      {
        id: "n-2",
        kind: "volunteer_policy_contact",
        queue_status: "failed",
        follow_up: "open",
        completed_at: null,
        provider_message_id: null,
      },
      {
        id: "n-3",
        kind: "volunteer_policy_contact",
        queue_status: "sent",
        follow_up: "completed",
        completed_at: null,
        provider_message_id: null,
      },
      {
        id: "n-4",
        kind: "volunteer_policy_contact",
        queue_status: "sent",
        follow_up: "open",
        completed_at: null,
        provider_message_id: "provider-1",
      },
      {
        id: "n-5",
        kind: "volunteer_policy_contact",
        queue_status: "queued",
        follow_up: "open",
        completed_at: null,
        provider_message_id: null,
      },
      {
        id: "n-6",
        kind: "volunteer_policy_contact",
        queue_status: "sent",
        follow_up: "open",
        completed_at: null,
        provider_message_id: null,
      },
    ],
    ...over,
  };
}
