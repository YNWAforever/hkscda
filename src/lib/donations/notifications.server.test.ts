import { afterEach, describe, expect, test } from "bun:test";

import { sendDonationAcknowledgement } from "./notifications.server";

// Minimal message-table fake: the claim insert does .insert().select("id").single(),
// the send-status flip does .update().eq().
function createMessageFake({
  conflict = false,
  retryableFailure = false,
  acceptedAfterCompetingFailure = false,
  existingStatus = "queued",
  existingUpdatedAt = new Date().toISOString(),
}: {
  conflict?: boolean;
  retryableFailure?: boolean;
  acceptedAfterCompetingFailure?: boolean;
  existingStatus?: "queued" | "sent" | "delivered" | "failed";
  existingUpdatedAt?: string | null;
} = {}) {
  const ops: Array<{ action: string; payload?: unknown; filters?: Array<[string, unknown]> }> = [];
  let row = conflict
    ? { id: "message-1", status: existingStatus, updated_at: existingUpdatedAt }
    : null;
  const client = {
    from() {
      return {
        insert(payload: unknown) {
          ops.push({ action: "insert", payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(
                    conflict
                      ? { data: null, error: { code: "23505" } }
                      : { data: { id: "message-1" }, error: null },
                  );
                },
              };
            },
          };
        },
        select() {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            contains(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            maybeSingle() {
              ops.push({ action: "select", filters });
              return Promise.resolve({
                data: acceptedAfterCompetingFailure
                  ? { id: "message-1", status: "failed", updated_at: existingUpdatedAt }
                  : row,
                error: null,
              });
            },
          };
          return builder;
        },
        update(payload: unknown) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            lte(column: string, value: unknown) {
              filters.push([column + "_lte", value]);
              return builder;
            },
            in(column: string, values: unknown[]) {
              filters.push([column + "_in", values]);
              return builder;
            },
            contains(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            select() {
              return builder;
            },
            maybeSingle() {
              ops.push({ action: "update", payload, filters });
              if (
                acceptedAfterCompetingFailure &&
                (payload as { status?: string }).status === "sent"
              ) {
                const acceptsFailed = filters.some(
                  ([column, value]) =>
                    column === "status_in" && Array.isArray(value) && value.includes("failed"),
                );
                return Promise.resolve({
                  data: acceptsFailed ? { id: "message-1" } : null,
                  error: null,
                });
              }
              if (retryableFailure) {
                row = { id: "message-1", status: "queued", updated_at: new Date().toISOString() };
              } else if (
                row &&
                filters.some(([column, value]) => column === "status" && value === row?.status)
              ) {
                if (typeof payload === "object" && payload !== null) {
                  const update = payload as { status?: typeof row.status; updated_at?: string };
                  row = {
                    ...row,
                    status: update.status ?? row.status,
                    updated_at: update.updated_at ?? row.updated_at,
                  };
                }
              }
              return Promise.resolve({
                data: retryableFailure ? { id: "message-1" } : row,
                error: null,
              });
            },
            then(resolve: (value: { error: null }) => void) {
              ops.push({ action: "update", payload, filters });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, ops };
}

const input = {
  supporterId: "supporter-1",
  donationId: "donation-1",
  to: "ada@example.test",
  donorName: "Ada",
  amountCents: 20000,
  language: "en" as const,
};

describe("sendDonationAcknowledgement", () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  test("claims a queued message row up front when no email provider is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const { client, ops } = createMessageFake();

    const result = await sendDonationAcknowledgement(client as never, input);

    expect(result).toBe("queued");
    // The claim is the FIRST thing that happens (before any external send).
    expect(ops[0]).toMatchObject({ action: "insert" });
    expect((ops[0].payload as { status?: string; channel?: string }).status).toBe("queued");
    expect((ops[0].payload as { payload?: { kind?: string } }).payload?.kind).toBe(
      "donation_acknowledgement",
    );
  });

  test("skips without double-sending when the acknowledgement is already claimed (23505)", async () => {
    const { client, ops } = createMessageFake({ conflict: true, existingStatus: "sent" });

    const result = await sendDonationAcknowledgement(client as never, input);

    expect(result).toBe("skipped");
    expect(ops.some((operation) => operation.action === "update")).toBe(false);
  });

  test("keeps a fresh queued acknowledgement retryable while another sender owns it", async () => {
    const { client } = createMessageFake({ conflict: true, existingStatus: "queued" });

    await expect(sendDonationAcknowledgement(client as never, input)).resolves.toBe("failed");
  });

  test("atomically reclaims a failed acknowledgement for retry", async () => {
    delete process.env.RESEND_API_KEY;
    const { client, ops } = createMessageFake({
      conflict: true,
      existingStatus: "failed",
      retryableFailure: true,
    });

    const result = await sendDonationAcknowledgement(client as never, input, {
      now: () => new Date("2040-01-01T00:05:00.000Z"),
    });

    expect(result).toBe("queued");
    const retry = ops.find((operation) => operation.action === "update");
    expect(retry?.payload).toEqual({
      status: "queued",
      updated_at: "2040-01-01T00:05:00.000Z",
    });
    expect(retry?.filters).toContainEqual(["status", "failed"]);
    expect(retry?.filters).toContainEqual(["id", "message-1"]);
  });

  test("starts a fresh lease when retrying a failed acknowledgement", async () => {
    const fixedNow = new Date("2040-01-01T00:05:00.000Z");
    const { client, ops } = createMessageFake({
      conflict: true,
      existingStatus: "failed",
      existingUpdatedAt: "2040-01-01T00:00:00.000Z",
    });
    const dependencies = {
      now: () => fixedNow,
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "fixture@example.invalid",
        replyTo: "fixture@example.invalid",
        notificationEmail: "fixture@example.invalid",
      }),
    };

    expect(await sendDonationAcknowledgement(client as never, input, dependencies)).toBe("queued");
    expect(await sendDonationAcknowledgement(client as never, input, dependencies)).toBe("failed");
    expect(ops.filter((operation) => operation.action === "update")).toHaveLength(1);
  });

  test("refreshes a reclaimed queued lease so a second worker cannot claim it", async () => {
    const fixedNow = new Date("2040-01-01T00:05:00.000Z");
    const { client, ops } = createMessageFake({
      conflict: true,
      existingStatus: "queued",
      existingUpdatedAt: "2040-01-01T00:00:00.000Z",
    });
    const dependencies = {
      now: () => fixedNow,
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "fixture@example.invalid",
        replyTo: "fixture@example.invalid",
        notificationEmail: "fixture@example.invalid",
      }),
    };

    expect(await sendDonationAcknowledgement(client as never, input, dependencies)).toBe("queued");
    expect(await sendDonationAcknowledgement(client as never, input, dependencies)).toBe("failed");
    expect(ops.filter((operation) => operation.action === "update")).toHaveLength(1);
  });

  test("records acceptance after a competing sender marked the row failed", async () => {
    const { client } = createMessageFake({ acceptedAfterCompetingFailure: true });
    const result = await sendDonationAcknowledgement(client as never, input, {
      getEmailConfig: () => ({
        resendApiKey: "test-key",
        from: "HKSCDA <noreply@example.test>",
        replyTo: "hello@example.test",
        notificationEmail: "admin@example.invalid",
      }),
      createMailProvider: async () => ({
        send: async () => ({ kind: "accepted", providerMessageId: "accepted-1" }),
      }),
    });

    expect(result).toBe("sent");
  });

  test("records a resolved provider rejection as failed and never marks it sent", async () => {
    const { client, ops } = createMessageFake();
    const result = await sendDonationAcknowledgement(client as never, input, {
      getEmailConfig: () => ({
        resendApiKey: "test-key",
        from: "HKSCDA <noreply@example.test>",
        replyTo: "hello@example.test",
        notificationEmail: "admin@example.invalid",
      }),
      createMailProvider: async () => ({
        send: async () => ({ kind: "rejected", code: "rate_limit_exceeded", retryable: true }),
      }),
      logger: { error() {} },
    });

    expect(result).toBe("failed");
    const updates = ops.filter((operation) => operation.action === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      status: "failed",
      payload: { providerErrorCode: "rate_limit_exceeded", retryable: true },
    });
    expect(
      updates.some((operation) => (operation.payload as { status?: string }).status === "sent"),
    ).toBe(false);
  });
});

test.each([
  [299999, "failed"],
  [300000, "queued"],
  [300001, "queued"],
] as const)("uses injected clock for acknowledgement lease age %i", async (age, expected) => {
  const fixedNow = new Date("2040-01-01T00:05:00.000Z");
  const { client, ops } = createMessageFake({
    conflict: true,
    existingStatus: "queued",
    existingUpdatedAt: new Date(fixedNow.getTime() - age).toISOString(),
  });
  let clockReads = 0;
  const result = await sendDonationAcknowledgement(client as never, input, {
    now: () => {
      clockReads++;
      return fixedNow;
    },
    getEmailConfig: () => ({
      resendApiKey: undefined,
      from: "fixture@example.invalid",
      replyTo: "fixture@example.invalid",
      notificationEmail: "fixture@example.invalid",
    }),
  });
  expect(result).toBe(expected);
  expect(clockReads).toBe(1);
  const updates = ops.filter((operation) => operation.action === "update");
  expect(updates).toHaveLength(age < 300000 ? 0 : 1);
  if (age >= 300000)
    expect(updates[0].filters).toContainEqual(["updated_at_lte", "2040-01-01T00:00:00.000Z"]);
});
