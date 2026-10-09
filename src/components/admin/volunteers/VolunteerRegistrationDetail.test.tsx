import { expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";
import type { ReactNode } from "react";
import { volunteerRegistrationCopy } from "./volunteerRegistrationCopy";

// The Chinese buttons are labelled with a status, so the status labels name the buttons.
const registrationStatusLabels = volunteerRegistrationCopy.zh.transitions;
const attendanceStatusLabels = volunteerRegistrationCopy.zh.attendanceActions;
const query = await import("@tanstack/react-query");
const router = await import("@tanstack/react-router");
const mutations: Array<{
  mutationFn: (status: string) => Promise<unknown>;
  onSettled: () => void;
}> = [];
const requests: Array<{ url: string; body: unknown }> = [];
const invalidated: unknown[] = [];
const registration = {
  id: "registration-1",
  updatedAt: "2026-09-05T00:00:00.123456+00:00",
  contactName: "Fixture",
  contactEmail: "fixture@example.invalid",
  contactPhone: "00000000",
  status: "pending",
  attendanceStatus: "not_marked",
  participantCount: 2,
  registrationType: "group",
  activity: {
    title: "Fixture activity",
    startsAt: "2026-09-06T00:00:00Z",
    endsAt: "2026-09-06T02:00:00Z",
    status: "published",
    remainingCapacity: 1,
  },
};
let registrationError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...query,
  useQueryClient: () => ({
    invalidateQueries: (input: unknown) => {
      invalidated.push(input);
    },
  }),
  useQuery: () => ({
    data: registrationError ? undefined : { registration },
    isLoading: false,
    error: registrationError,
    refetch: () => {},
  }),
  useMutation: (options: {
    mutationFn: (status: string) => Promise<unknown>;
    onSettled: () => void;
  }) => {
    mutations.push(options);
    return { mutate: () => {}, isPending: false, error: new Error("活動名額不足") };
  },
}));
mock.module("@tanstack/react-router", () => ({
  ...router,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, input: { body: string }) => {
    requests.push({ url, body: JSON.parse(input.body) });
    throw new Error("Capacity conflict");
  },
}));
const { VolunteerRegistrationDetail } = await import("./VolunteerRegistrationDetail");
test("status callback sends reviewed version and refreshes capacity after a rejected mutation", async () => {
  mutations.length = 0;
  requests.length = 0;
  invalidated.length = 0;
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("活動名額不足");
  expect(markup).toContain("剩餘名額");
  await expect(mutations[0].mutationFn("approved")).rejects.toThrow("Capacity conflict");
  expect(requests[0].body).toEqual({
    status: "approved",
    expectedUpdatedAt: registration.updatedAt,
  });
  mutations[0].onSettled();
  expect(invalidated).toContainEqual({ queryKey: ["volunteer-registration"] });
  expect(invalidated).toContainEqual({ queryKey: ["volunteer-activities"] });
});

test("shows a retry control instead of reporting a load failure as a deleted registration", () => {
  // error was folded into the same branch as `!data?.registration`, so a 500
  // and a genuinely deleted registration both read as "找不到義工報名。",
  // with no way to retry either way.
  registrationError = new Error("boom");
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).toContain("無法載入");
  expect(markup).toContain("重試");
  expect(markup).not.toContain("找不到義工報名");
  registrationError = null;
});

test("attendance callback carries reviewed version and exposes factual correction controls", async () => {
  mutations.length = 0;
  requests.length = 0;
  registration.status = "approved";
  registration.attendanceStatus = "attended";
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).toContain("更正出席事實");
  await expect(mutations[1].mutationFn("completed")).rejects.toThrow("Capacity conflict");
  expect(requests[0].body).toEqual({
    attendanceStatus: "completed",
    expectedUpdatedAt: registration.updatedAt,
    command: "record",
  });
  registration.status = "pending";
  registration.attendanceStatus = "not_marked";
});

test("pending registration offers only valid localized status actions", () => {
  registration.status = "pending";
  registration.attendanceStatus = "not_marked";
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).toContain(">" + registrationStatusLabels.approved + "</button>");
  expect(markup).toContain(">" + registrationStatusLabels.waitlisted + "</button>");
  expect(markup).toContain(">" + registrationStatusLabels.rejected + "</button>");
  expect(markup).not.toContain(">cancelled</button>");
  expect(markup).not.toContain(">attended</button>");
  expect(markup).not.toContain(">" + attendanceStatusLabels.attended + "</button>");
});

test("approved registration offers factual attendance after the activity ends", () => {
  registration.status = "approved";
  registration.attendanceStatus = "not_marked";
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).toContain(">" + attendanceStatusLabels.attended + "</button>");
  expect(markup).toContain(">" + attendanceStatusLabels.completed + "</button>");
  expect(markup).toContain(">" + attendanceStatusLabels.no_show + "</button>");
  expect(markup).not.toContain(">approved</button>");
  expect(markup).not.toContain(">cancelled</button>");
  registration.status = "pending";
});

test("cancelled registration has no staff transition or attendance action", () => {
  registration.status = "cancelled";
  registration.attendanceStatus = "not_marked";
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).not.toContain(">" + registrationStatusLabels.approved + "</button>");
  expect(markup).not.toContain(">" + attendanceStatusLabels.attended + "</button>");
  registration.status = "pending";
});

test("approved future booking cannot be marked attended early", () => {
  registration.status = "approved";
  registration.attendanceStatus = "not_marked";
  const previousStart = registration.activity.startsAt;
  const previousEnd = registration.activity.endsAt;
  registration.activity.startsAt = "2099-01-01T00:00:00Z";
  registration.activity.endsAt = "2099-01-01T02:00:00Z";
  const markup = renderAdminInChinese(
    <VolunteerRegistrationDetail registrationId="registration-1" />,
  );
  expect(markup).not.toContain(">" + attendanceStatusLabels.attended + "</button>");
  expect(markup).not.toContain(">" + attendanceStatusLabels.completed + "</button>");
  expect(markup).not.toContain(">" + attendanceStatusLabels.no_show + "</button>");
  registration.activity.startsAt = previousStart;
  registration.activity.endsAt = previousEnd;
  registration.status = "pending";
});
