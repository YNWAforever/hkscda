import { describe, expect, test } from "bun:test";

import { sendPledgeStatusUpdateEmail } from "./notifications.server";

type QueryCall = { table: string; method: string; payload?: unknown };

class FakeQuery {
  private mutationPayload: unknown;

  constructor(
    private readonly state: { calls: QueryCall[] },
    private readonly table: string,
    private readonly messageInsertError: { code?: string; message?: string } | null,
  ) {}

  insert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload });
    this.mutationPayload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.mutationPayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  select(columns: string) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns });
    return this;
  }

  async single() {
    if (this.table === "message") {
      if (this.messageInsertError) return { data: null, error: this.messageInsertError };
      return { data: { id: "message-1" }, error: null };
    }
    return { data: this.mutationPayload, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.mutationPayload, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function createFakeClient({
  messageInsertError = null,
}: { messageInsertError?: { code?: string; message?: string } | null } = {}) {
  const state = { calls: [] as QueryCall[] };
  const client = {
    from(table: string) {
      return new FakeQuery(state, table, messageInsertError);
    },
  };
  return { client: client as never, state };
}

describe("sendPledgeStatusUpdateEmail", () => {
  function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
      event: "active" as const,
      language: "zh-HK" as const,
      supporterId: "supporter-1",
      supporterEmail: "chan@example.com",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      ...overrides,
    };
  }

  test("queues the email and returns 'queued' with no Resend key configured", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
    });
    expect(result).toBe("queued");
  });

  test("returns 'sent' when the email sender succeeds", async () => {
    const { client, state } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({ send: async () => ({}) }),
    });
    expect(result).toBe("sent");
    expect(state.calls.some((c) => c.table === "message" && c.method === "insert")).toBe(true);
  });

  test("returns 'failed' when the email sender throws", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({
        send: async () => {
          throw new Error("network down");
        },
      }),
      logger: { error: () => {} },
    });
    expect(result).toBe("failed");
  });

  test("sets the message payload supporter_id so it surfaces in the CRM timeline", async () => {
    const { client, state } = createFakeClient();
    await sendPledgeStatusUpdateEmail(client, baseArgs({ supporterId: "supporter-42" }), {
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
    });
    const insertCall = state.calls.find((c) => c.table === "message" && c.method === "insert");
    expect((insertCall?.payload as { supporter_id: string }).supporter_id).toBe("supporter-42");
  });

  test("returns 'skipped' without sending when the claim insert hits the dedup unique index (23505)", async () => {
    const { client, state } = createFakeClient({ messageInsertError: { code: "23505" } });
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({ send: async () => ({}) }),
      logger: { error: () => {} },
    });
    expect(result).toBe("skipped");
    // The unique-index conflict short-circuits: no email send, no status flip.
    expect(state.calls.filter((c) => c.table === "message" && c.method === "update")).toHaveLength(
      0,
    );
  });

  test("re-throws when the claim insert fails for a reason other than a dedup conflict", async () => {
    const { client } = createFakeClient({
      messageInsertError: { code: "42501", message: "permission denied" },
    });
    await expect(
      sendPledgeStatusUpdateEmail(client, baseArgs(), {
        getEmailConfig: () => ({
          resendApiKey: undefined,
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        logger: { error: () => {} },
      }),
    ).rejects.toBeTruthy();
  });
});
