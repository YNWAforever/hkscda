import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_MULTIPART_MAX_BYTES,
  parseSponsorshipMultipart,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  validateSponsorshipSubmissionRequestHeaders,
  type ParsedSponsorshipMultipart,
  type PublicSponsorshipSupabaseClient,
} from "./submission.server";

const animalId = "11111111-2222-4333-8444-555555555555";

function basePayloadJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [{ rank: 1, animalId, animalName: "白雪", animalType: "sponsor" }],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    turnstileToken: "test-token",
    ...overrides,
  });
}

function multipartRequest(
  fields: Record<string, string>,
  file?: { name: string; content: string },
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (file) formData.set("proof", new File([file.content], file.name, { type: "image/jpeg" }));
  return new Request("http://localhost/api/sponsorships/pledges", {
    method: "POST",
    body: formData,
  });
}

describe("validateSponsorshipSubmissionRequestHeaders", () => {
  test("rejects a missing content-type", () => {
    const request = new Request("http://localhost", { method: "POST" });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 400,
      error: "Missing content-type",
    });
  });

  test("rejects a non-multipart content-type", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request).ok).toBe(false);
  });

  test("rejects an oversized content-length", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(SPONSORSHIP_MULTIPART_MAX_BYTES + 1),
      },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({
      ok: false,
      status: 413,
      error: "Sponsorship pledge upload is too large",
    });
  });

  test("accepts a well-formed multipart request", () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(validateSponsorshipSubmissionRequestHeaders(request)).toEqual({ ok: true });
  });
});

describe("parseSponsorshipMultipart", () => {
  test("parses a payload without proof", async () => {
    const request = multipartRequest({ payload: basePayloadJson() });
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.payload.contact.supporterName).toBe("陳小姐");
    expect(parsed.payload.turnstileToken).toBe("test-token");
    expect(parsed.proof).toBeUndefined();
  });

  test("parses a payload with proof metadata and a proof file", async () => {
    const request = multipartRequest(
      {
        payload: basePayloadJson({
          proofMetadata: {
            paymentMethod: "fps",
            reference: "REF1",
            amountCents: 30000,
            paymentDate: "2026-07-01",
          },
        }),
      },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    const parsed = await parseSponsorshipMultipart(request);
    expect(parsed.proof?.fileName).toBe("proof.jpg");
    expect(parsed.proof?.metadata.paymentMethod).toBe("fps");
  });

  test("rejects proof metadata without a file", async () => {
    const request = multipartRequest({
      payload: basePayloadJson({
        proofMetadata: {
          paymentMethod: "fps",
          amountCents: 30000,
          paymentDate: "2026-07-01",
        },
      }),
    });
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a proof file without metadata", async () => {
    const request = multipartRequest(
      { payload: basePayloadJson() },
      { name: "proof.jpg", content: "fake-image-bytes" },
    );
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });

  test("rejects a missing payload field", async () => {
    const request = multipartRequest({});
    await expect(parseSponsorshipMultipart(request)).rejects.toThrow();
  });
});

type QueryCall = { table: string; method: string; payload?: unknown };
type StorageCall = { bucket: string; method: string; path?: string; paths?: string[] };
type FakeClientOptions = { failInsertTable?: string; supporterId?: string };

class FakeQuery {
  private action: "insert" | "select" | "delete" | null = null;
  private mutationPayload: unknown;

  constructor(
    private readonly state: {
      calls: QueryCall[];
      failInsertTable?: string;
      supporterId: string;
    },
    private readonly table: string,
  ) {}

  insert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }

  select(columns: string) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns });
    if (!this.action) this.action = "select";
    return this;
  }

  delete() {
    this.state.calls.push({ table: this.table, method: "delete" });
    this.action = "delete";
    return this;
  }

  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.action = "insert";
    this.mutationPayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  upsert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "upsert", payload });
    this.action = "insert";
    this.mutationPayload = { id: this.state.supporterId };
    return this;
  }

  async single() {
    if (this.action === "insert" && this.state.failInsertTable === this.table) {
      return { data: null, error: new Error(`insert failed: ${this.table}`) };
    }
    if (this.table === "supporter") return { data: { id: this.state.supporterId }, error: null };
    if (this.table === "sponsorship_pledge") return { data: { id: "pledge-1" }, error: null };
    if (this.table === "message") return { data: { id: "message-1" }, error: null };
    return { data: this.mutationPayload ?? { id: `${this.table}-id` }, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const result =
      this.action === "insert" && this.state.failInsertTable === this.table
        ? { data: null, error: new Error(`insert failed: ${this.table}`) }
        : { data: this.mutationPayload, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createFakeClient(options: FakeClientOptions = {}) {
  const state = {
    calls: [] as QueryCall[],
    storageCalls: [] as StorageCall[],
    failInsertTable: options.failInsertTable,
    supporterId: options.supporterId ?? "supporter-1",
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            state.storageCalls.push({ bucket, method: "upload", path });
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            state.storageCalls.push({ bucket, method: "remove", paths });
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return { client: client as unknown as PublicSponsorshipSupabaseClient, state };
}

function parsedPayload(overrides: Record<string, unknown> = {}): ParsedSponsorshipMultipart {
  return {
    payload: {
      language: "zh-HK",
      monthlyTier: "300",
      customAmountCents: undefined,
      animalPreferences: [
        {
          rank: 1,
          animalId: "11111111-2222-4333-8444-555555555555",
          animalName: "白雪",
          animalType: "sponsor",
        },
      ],
      contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
      consents: { email: true, whatsapp: false },
      notes: null,
      terms: { agreed: true, version: "sponsorship-terms-2026-07" },
      ...overrides,
    } as ParsedSponsorshipMultipart["payload"],
    proof: undefined,
  };
}

describe("persistSponsorshipPledge", () => {
  test("creates a pending_payment pledge when no proof is attached", async () => {
    const { client, state } = createFakeClient();
    const result = await persistSponsorshipPledge({
      client,
      parsed: parsedPayload(),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("pending_payment");
    expect(result.pledgeId).toBe("pledge-1");
    expect(result.reference).toMatch(/^SP-[A-Z0-9]{8}$/);
    expect(result.amountCents).toBe(30000);
    expect(
      state.calls.some((c) => c.table === "sponsorship_preference" && c.method === "insert"),
    ).toBe(true);
    expect(state.calls.some((c) => c.table === "sponsorship_payment_proof")).toBe(false);
    expect(
      state.calls.some((c) => c.table === "public_status_token" && c.method === "insert"),
    ).toBe(true);
  });

  test("persists supporter consent choices", async () => {
    const { client, state } = createFakeClient();
    await persistSponsorshipPledge({
      client,
      parsed: parsedPayload({ consents: { email: true, whatsapp: false } }),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    const consentCall = state.calls.find((c) => c.table === "consent" && c.method === "insert");
    expect(consentCall).toBeDefined();
    expect(consentCall?.payload).toEqual([
      {
        supporter_id: "supporter-1",
        channel: "email",
        status: "opt_in",
        source: "sponsorship_pledge_form",
        timestamp: "2026-07-02T00:00:00.000Z",
      },
      {
        supporter_id: "supporter-1",
        channel: "whatsapp",
        status: "opt_out",
        source: "sponsorship_pledge_form",
        timestamp: "2026-07-02T00:00:00.000Z",
      },
    ]);
  });

  test("creates a provisional pledge and uploads proof when proof is attached", async () => {
    const { client, state } = createFakeClient();
    const proof = {
      fileName: "proof.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: 2048,
      file: new File(["bytes"], "proof.jpg", { type: "image/jpeg" }),
      metadata: {
        paymentMethod: "fps" as const,
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
      },
    };

    const result = await persistSponsorshipPledge({
      client,
      parsed: { ...parsedPayload(), proof },
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("provisional");
    expect(state.storageCalls.some((c) => c.method === "upload")).toBe(true);
    expect(
      state.calls.some((c) => c.table === "sponsorship_payment_proof" && c.method === "insert"),
    ).toBe(true);
  });

  test("cleans up the pledge and uploaded proof when persistence fails mid-way", async () => {
    const { client, state } = createFakeClient({ failInsertTable: "public_status_token" });
    const proof = {
      fileName: "proof.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: 2048,
      file: new File(["bytes"], "proof.jpg", { type: "image/jpeg" }),
      metadata: {
        paymentMethod: "fps" as const,
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
      },
    };

    await expect(
      persistSponsorshipPledge({ client, parsed: { ...parsedPayload(), proof } }),
    ).rejects.toThrow("Failed to save sponsorship pledge");

    expect(state.storageCalls.some((c) => c.method === "remove")).toBe(true);
    expect(state.calls.some((c) => c.table === "sponsorship_pledge" && c.method === "delete")).toBe(
      true,
    );
  });
});

describe("sendPledgeConfirmationEmail", () => {
  function fakeResult(overrides: Record<string, unknown> = {}) {
    return {
      pledgeId: "pledge-1",
      supporterId: "supporter-1",
      reference: "SP-ABCDEF12",
      status: "pending_payment" as const,
      amountCents: 30000,
      statusToken: "token",
      statusUrl: "http://localhost:3000/sponsors/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  test("queues the email and returns 'queued' with no Resend key configured", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedPayload().payload,
      fakeResult(),
      {
        getEmailConfig: () => ({
          resendApiKey: undefined,
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
      },
    );
    expect(result).toBe("queued");
  });

  test("returns 'sent' when the email sender succeeds", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedPayload().payload,
      fakeResult(),
      {
        getEmailConfig: () => ({
          resendApiKey: "key",
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        createEmailSender: () => ({ send: async () => ({}) }),
      },
    );
    expect(result).toBe("sent");
  });

  test("returns 'failed' when the email sender throws", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedPayload().payload,
      fakeResult(),
      {
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
      },
    );
    expect(result).toBe("failed");
  });
});
