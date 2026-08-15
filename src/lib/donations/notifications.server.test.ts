import { afterEach, describe, expect, test } from "bun:test";

import { sendDonationAcknowledgement } from "./notifications.server";

// Minimal message-table fake: the claim insert does .insert().select("id").single(),
// the send-status flip does .update().eq().
function createMessageFake({
  conflict = false,
  retryableFailure = false,
}: { conflict?: boolean; retryableFailure?: boolean } = {}) {
  const ops: Array<{ action: string; payload?: unknown; filters?: Array<[string, unknown]> }> = [];
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
        update(payload: unknown) {
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
            select() {
              return builder;
            },
            maybeSingle() {
              ops.push({ action: "update", payload, filters });
              return Promise.resolve({
                data: retryableFailure ? { id: "message-1" } : null,
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
    const { client, ops } = createMessageFake({ conflict: true });

    const result = await sendDonationAcknowledgement(client as never, input);

    expect(result).toBe("skipped");
    // The only follow-up is a guarded failed -> queued claim. With no failed
    // row affected, the existing queued/sent acknowledgement is not resent.
    const updates = ops.filter((operation) => operation.action === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toContainEqual(["status", "failed"]);
  });

  test("atomically reclaims a failed acknowledgement for retry", async () => {
    delete process.env.RESEND_API_KEY;
    const { client, ops } = createMessageFake({ conflict: true, retryableFailure: true });

    const result = await sendDonationAcknowledgement(client as never, input);

    expect(result).toBe("queued");
    const retry = ops.find((operation) => operation.action === "update");
    expect(retry?.payload).toEqual({ status: "queued" });
    expect(retry?.filters).toContainEqual(["status", "failed"]);
    expect(retry?.filters).toContainEqual([
      "payload",
      { kind: "donation_acknowledgement", donationId: "donation-1" },
    ]);
  });
});
