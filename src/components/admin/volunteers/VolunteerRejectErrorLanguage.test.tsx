import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

/**
 * A failed rejection is shown inside the reject dialog, which prints what the mutation rejects
 * with. `fetchAdminJson` writes every `/volunteers` API failure as zh-HK text, so each screen's
 * mutationFn rewrites a failed rejection in the admin's language. These tests render each screen
 * in Chinese and in English, take the status mutationFn it hands to useMutation, and make it fail.
 */

const realReactQuery = await import("@tanstack/react-query");
const realReactRouter = await import("@tanstack/react-router");
const { AdminApiError } = await import("../../../lib/admin/session");
const { volunteerErrorMessage } = await import("../../../lib/volunteers/apiResult");

const REGISTRATION = {
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

type MutationOptions = { mutationFn: (input: unknown) => Promise<unknown> };
const mutations: MutationOptions[] = [];
const calls: Array<{ url: string; method: string | undefined }> = [];
let failure: unknown = null;

mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    if (failure) throw failure;
    return { ok: true };
  },
  getAdminAccessToken: async () => "token",
}));

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: (options: MutationOptions) => {
    mutations.push(options);
    return { mutate: () => {}, mutateAsync: async () => {}, isPending: false, error: null };
  },
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data:
      queryKey[0] === "volunteer-activities"
        ? { activities: [], total: 0 }
        : queryKey[0] === "volunteer-registrations"
          ? { registrations: [], total: 0 }
          : { registration: REGISTRATION },
    error: null,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

const { renderAdminInChinese, renderAdminInEnglish, expectNoChineseText } =
  await import("../i18n/testing");
const { VolunteerManagement } = await import("./VolunteerManagement");
const { VolunteerRegistrationDetail } = await import("./VolunteerRegistrationDetail");

/** What `fetchAdminJson` throws for a 409 from a `/volunteers` route: zh-HK text, always. */
const conflict = () =>
  new AdminApiError({ status: 409, message: volunteerErrorMessage({}, 409, "zh") });

/**
 * Renders the screen, then runs each mutationFn it registered until one sends the status PATCH,
 * and returns what that one rejected with.
 */
async function failedStatusChange(render: () => string, input: unknown): Promise<unknown> {
  mutations.length = 0;
  render();
  for (const options of [...mutations]) {
    calls.length = 0;
    const outcome = await Promise.resolve()
      .then(() => options.mutationFn(input))
      .then(
        () => null,
        (error: unknown) => error,
      );
    if (calls.some((call) => call.url.endsWith("/status") && call.method === "PATCH")) {
      return outcome;
    }
  }
  throw new Error("no mutation sent the status PATCH");
}

const managementReject = {
  id: REGISTRATION.id,
  status: "rejected",
  expectedUpdatedAt: REGISTRATION.updatedAt,
  reason: "no-show history",
};
const detailReject = { status: "rejected", reason: "no-show history" };

const screens = [
  {
    name: "the registrations table (VolunteerManagement)",
    element: () => <VolunteerManagement />,
    reject: managementReject,
    approve: { ...managementReject, status: "approved", reason: undefined },
  },
  {
    name: "the registration page (VolunteerRegistrationDetail)",
    element: () => <VolunteerRegistrationDetail registrationId={REGISTRATION.id} />,
    reject: detailReject,
    approve: { status: "approved" },
  },
];

for (const screen of screens) {
  describe(`a failed rejection on ${screen.name}`, () => {
    test("en: the dialog gets English text, not the API's zh-HK text", async () => {
      failure = conflict();
      const error = await failedStatusChange(
        () => renderAdminInEnglish(screen.element()),
        screen.reject,
      );
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toBe(volunteerErrorMessage({}, 409, "en"));
      expectNoChineseText(message);
      failure = null;
    });

    test("zh: the dialog keeps the zh-HK text", async () => {
      failure = conflict();
      const error = await failedStatusChange(
        () => renderAdminInChinese(screen.element()),
        screen.reject,
      );
      expect((error as Error).message).toBe(volunteerErrorMessage({}, 409, "zh"));
      failure = null;
    });

    test("any other status change rejects with the API error as before (the inline alert maps it)", async () => {
      const original = conflict();
      failure = original;
      const error = await failedStatusChange(
        () => renderAdminInEnglish(screen.element()),
        screen.approve,
      );
      expect(error).toBe(original);
      failure = null;
    });
  });
}
