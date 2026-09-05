import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  VolunteerActivitySummary,
  VolunteerRegistrationStatus,
  VolunteerRegistrationSummary,
} from "../../../lib/volunteers/types";

const realReactQuery = await import("@tanstack/react-query");
const realReactRouter = await import("@tanstack/react-router");

const activity: VolunteerActivitySummary = {
  id: "activity-1",
  type: "cleaning_day",
  title: "清潔日",
  description: null,
  startsAt: "2026-08-01T02:00:00.000Z",
  endsAt: "2026-08-01T05:00:00.000Z",
  location: "荃灣",
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
};

function registration(
  overrides: Partial<VolunteerRegistrationSummary> = {},
): VolunteerRegistrationSummary & { activity: VolunteerActivitySummary } {
  return {
    id: "registration-1",
    activityId: activity.id,
    supporterId: "supporter-1",
    registrationType: "group",
    status: "pending",
    statusReason: null,
    attendanceStatus: "not_marked",
    participantCount: 6,
    contactName: "黃雅達",
    contactEmail: "ada@example.com",
    contactPhone: "91234567",
    language: "zh-HK",
    organizationName: "聖士提反書院",
    declaredAge: 30,
    youngestAge: 15,
    guardianName: "陳大文",
    guardianPhone: "98765432",
    notes: null,
    internalNotes: null,
    volunteerHours: null,
    statusToken: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    activity,
    ...overrides,
  };
}

let registrationRows = [registration()];
let registrationTotal = 1;

let mutationError: Error | null = null;
mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({
    mutate: () => {},
    isPending: false,
    isError: false,
    error: mutationError,
    reset: () => {},
  }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0]);
    if (key === "volunteer-activities") {
      return {
        data: { activities: [activity], total: 1 },
        error: null,
        isLoading: false,
        isFetching: false,
      };
    }
    return {
      data: { registrations: registrationRows, total: registrationTotal },
      error: null,
      isLoading: false,
      isFetching: false,
    };
  },
}));

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: React.ReactNode;
    className?: string;
    params?: { id?: string };
    to: string;
  }) => (
    <a className={className} href={to.replace("$id", params?.id ?? "")}>
      {children}
    </a>
  ),
}));

const { VolunteerManagement } = await import("./VolunteerManagement");

function render(status: VolunteerRegistrationStatus = "pending", total = 1) {
  registrationRows = [registration({ status })];
  registrationTotal = total;
  return renderToStaticMarkup(<VolunteerManagement />);
}

describe("VolunteerManagement", () => {
  test("renders without throwing on realistic data", () => {
    expect(render()).toContain("義工與活動管理");
  });

  test("names the activity a registration is for, never a bare id", () => {
    // The old cell fell back to `registration.activityId` — a raw UUID — when
    // the joined activity was missing.
    const markup = render();
    expect(markup).toContain("清潔日");
    expect(markup).not.toContain(activity.id);
  });

  test("shows the detail the old table dropped", () => {
    const markup = render();
    expect(markup).toContain("91234567"); // phone
    expect(markup).toContain("聖士提反書院"); // organisation
    expect(markup).toContain("團體"); // individual vs group
    expect(markup).toContain("需家長同意"); // guardian flag
  });

  test("labels statuses in Chinese rather than leaking the database enums", () => {
    const markup = render("pending");
    expect(markup).toContain("待審批");
    for (const raw of ["approved", "waitlisted", "rejected", "not_marked"]) {
      expect(markup).not.toContain(`>${raw}<`);
    }
  });

  test("offers the full triage set on a pending registration", () => {
    const markup = render("pending");
    expect(markup).toContain("已批准");
    expect(markup).toContain("候補中");
    expect(markup).toContain("已拒絕");
  });

  test("stops offering actions once the volunteer has cancelled", () => {
    // Staff reversing a volunteer's own cancellation would re-book someone who
    // opted out.
    expect(render("cancelled")).toContain("無需處理");
  });

  test("hides page controls for a single page and shows them beyond one", () => {
    expect(render("pending", 1)).not.toContain("下一頁");
    expect(render("pending", 90)).toContain("下一頁");
  });
});

test("approval conflicts remain visible while the create form is closed", () => {
  mutationError = new Error("活動名額不足");
  try {
    expect(render()).toContain("活動名額不足");
  } finally {
    mutationError = null;
  }
});
