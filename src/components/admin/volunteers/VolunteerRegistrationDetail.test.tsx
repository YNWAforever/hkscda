import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
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
  activity: { title: "Fixture activity", startsAt: "2026-09-06T00:00:00Z", remainingCapacity: 1 },
};
mock.module("@tanstack/react-query", () => ({
  ...query,
  useQueryClient: () => ({
    invalidateQueries: (input: unknown) => {
      invalidated.push(input);
    },
  }),
  useQuery: () => ({ data: { registration }, isLoading: false, error: null }),
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
  const markup = renderToStaticMarkup(
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
