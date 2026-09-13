import { expect, test } from "bun:test";
import {
  createVolunteerNotificationDispatcher,
  type ClaimedNotification,
  confirmedAuthEmail,
} from "./notification.server";
const job: ClaimedNotification = {
  id: "1",
  dedupKey: "person:2026-08:regular_reminder",
  attempts: 1,
  payload: {
    assessment_id: "a",
    profile_id: "p",
    type: "regular_reminder",
    channels: ["email"],
    dry_run: false,
  },
};
test("accepted provider response is persisted as accepted, never delivered", async () => {
  const states: string[] = [];
  const result = await createVolunteerNotificationDispatcher({
    resolve: async () => ({ to: "v@example.invalid", name: "義工", subject: "提醒", body: "內容" }),
    send: async (m, key) => {
      expect(key).toBe("volunteer-notification-person:2026-08:regular_reminder");
      return { kind: "accepted", providerMessageId: "provider-1" };
    },
    accepted: async () => {
      states.push("provider_accepted");
    },
    reject: async () => {},
    defer: async () => {},
  })(job);
  expect(result).toBe("provider_accepted");
  expect(states).toEqual(["provider_accepted"]);
});
test("dry run never calls provider and remains queued", async () => {
  let sent = false,
    deferred = "";
  const result = await createVolunteerNotificationDispatcher({
    resolve: async () => null,
    send: async () => {
      sent = true;
      return { kind: "accepted", providerMessageId: "x" };
    },
    accepted: async () => {},
    reject: async () => {},
    defer: async (_j, r) => {
      deferred = r;
    },
  })({ ...job, payload: { ...job.payload, dry_run: true } });
  expect(result).toBe("queued");
  expect(sent).toBe(false);
  expect(deferred).toBe("dry_run_no_provider_delivery");
});

test("auth fallback accepts only confirmed email", () => {
  expect(
    confirmedAuthEmail({ email: "pending@example.invalid", email_confirmed_at: null }),
  ).toBeNull();
  expect(
    confirmedAuthEmail({
      email: "verified@example.invalid",
      email_confirmed_at: "2026-09-13T00:00:00Z",
    }),
  ).toBe("verified@example.invalid");
});
