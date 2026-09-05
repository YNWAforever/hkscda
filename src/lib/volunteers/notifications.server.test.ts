import { describe, expect, mock, test } from "bun:test";

import { createResendMailProvider } from "../notifications/provider.server";
import { sendVolunteerRegistrationEmail } from "./notifications.server";

const registration = {
  id: "registration-1",
  activityId: "activity-1",
  supporterId: "supporter-1",
  contactEmail: "volunteer@example.invalid",
  contactName: "Volunteer",
  registrationType: "individual",
  participantCount: 1,
  language: "en",
  status: "pending",
  activity: { title: "Care day" },
} as never;

function fakeClient({
  conflictStatus,
  sentPersistenceFails = false,
}: { conflictStatus?: "queued" | "sent" | "failed"; sentPersistenceFails?: boolean } = {}) {
  const operations: Array<{ action: string; payload?: Record<string, unknown> }> = [];
  const existing = conflictStatus
    ? { id: "message-1", status: conflictStatus, updated_at: new Date().toISOString() }
    : null;
  return {
    operations,
    client: {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            operations.push({ action: "insert", payload });
            return {
              select: () => ({
                single: async () =>
                  existing
                    ? { data: null, error: { code: "23505" } }
                    : { data: { id: "message-1" }, error: null },
              }),
            };
          },
          select() {
            const builder = {
              eq() {
                return builder;
              },
              contains() {
                return builder;
              },
              maybeSingle: async () => ({ data: existing, error: null }),
            };
            return builder;
          },
          update(payload: Record<string, unknown>) {
            operations.push({ action: "update", payload });
            const builder = {
              eq() {
                return builder;
              },
              lt() {
                return builder;
              },
              select() {
                return builder;
              },
              maybeSingle: async () => ({
                data:
                  sentPersistenceFails && payload.status === "sent" ? null : { id: "message-1" },
                error: null,
              }),
              then(resolve: (value: { error: null }) => unknown) {
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return builder;
          },
        };
      },
    } as never,
  };
}

const config = () => ({
  resendApiKey: "fake-key",
  from: "sender@example.invalid",
  replyTo: "reply@example.invalid",
  notificationEmail: "admin@example.invalid",
});
const input = { registration, statusUrl: "https://example.invalid/status/test" };

describe("sendVolunteerRegistrationEmail", () => {
  test.each([
    ["resolved rejection", async () => ({ data: null, error: { name: "rate_limit_exceeded" } })],
    [
      "thrown transport",
      async () => {
        throw new Error("offline");
      },
    ],
    ["missing provider id", async () => ({ data: null, error: null })],
  ])("records %s as failed and never sent", async (_name, transport) => {
    const { client, operations } = fakeClient();
    const send = mock(transport);
    const result = await sendVolunteerRegistrationEmail(client, input, {
      getEmailConfig: config,
      createMailProvider: async () => createResendMailProvider(send as never),
      logger: { error() {} },
    });
    expect(result).toBe("failed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(operations.some((op) => op.payload?.status === "failed")).toBe(true);
    expect(operations.some((op) => op.payload?.status === "sent")).toBe(false);
  });

  test("persists accepted provider id before returning sent", async () => {
    const { client, operations } = fakeClient();
    const result = await sendVolunteerRegistrationEmail(client, input, {
      getEmailConfig: config,
      createMailProvider: async () => ({
        send: async () => ({ kind: "accepted", providerMessageId: "email-123" }),
      }),
    });
    expect(result).toBe("sent");
    expect(operations.find((op) => op.payload?.status === "sent")?.payload).toMatchObject({
      payload: { providerMessageId: "email-123" },
    });
  });

  test("throws when accepted delivery status cannot be persisted", async () => {
    const { client } = fakeClient({ sentPersistenceFails: true });
    await expect(
      sendVolunteerRegistrationEmail(client, input, {
        getEmailConfig: config,
        createMailProvider: async () => ({
          send: async () => ({ kind: "accepted", providerMessageId: "email-123" }),
        }),
      }),
    ).rejects.toThrow("status was not persisted");
  });

  test("skips an already sent claim without calling the provider", async () => {
    const { client } = fakeClient({ conflictStatus: "sent" });
    const send = mock(async () => ({ kind: "accepted" as const, providerMessageId: "unexpected" }));
    expect(
      await sendVolunteerRegistrationEmail(client, input, {
        getEmailConfig: config,
        createMailProvider: async () => ({ send }),
      }),
    ).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  test("does not send while another fresh queued claim owns the lease", async () => {
    const { client } = fakeClient({ conflictStatus: "queued" });
    const send = mock(async () => ({ kind: "accepted" as const, providerMessageId: "unexpected" }));
    expect(
      await sendVolunteerRegistrationEmail(client, input, {
        getEmailConfig: config,
        createMailProvider: async () => ({ send }),
      }),
    ).toBe("failed");
    expect(send).not.toHaveBeenCalled();
  });
});
