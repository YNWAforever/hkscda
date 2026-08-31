import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_PROOF_BUCKET,
  SubmissionValidationError,
  parseSponsorshipSubmission,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  type ParsedSponsorshipMultipart,
  type PublicSponsorshipSupabaseClient,
} from "./submission.server";

const animalId = "11111111-2222-4333-8444-555555555555";
const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [{ rank: 1, animalId, animalName: "白雪", animalType: "sponsor" }],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    turnstileToken: "test-token",
    ...overrides,
  };
}

function proofMetadata(overrides: Record<string, unknown> = {}) {
  return {
    paymentMethod: "fps" as const,
    reference: "REF1",
    amountCents: 30000,
    paymentDate: "2026-07-01",
    ...overrides,
  };
}

function proofRef(
  fileName: string,
  overrides: Partial<{
    mimeType: string;
    sizeBytes: number;
    storagePath: string | undefined;
  }> = {},
) {
  const descriptor: Record<string, unknown> = {
    fileName,
    mimeType: overrides.mimeType ?? "image/jpeg",
    sizeBytes: overrides.sizeBytes ?? 2048,
  };
  if (!("storagePath" in overrides) || overrides.storagePath !== undefined) {
    descriptor.storagePath = overrides.storagePath ?? `${pledgeId}/proof/${fileName}`;
  }
  return descriptor;
}

function submissionBody(
  payload: Record<string, unknown> = basePayload(),
  proof?: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    payload,
    pledgeId,
    proof,
    turnstileToken: typeof payload.turnstileToken === "string" ? payload.turnstileToken : undefined,
    ...overrides,
  };
}

function parsedSubmission(
  payloadOverrides: Record<string, unknown> = {},
  proof?: Record<string, unknown>,
): ParsedSponsorshipMultipart & { pledgeId: string } {
  return parseSponsorshipSubmission(submissionBody(basePayload(payloadOverrides), proof));
}

describe("parseSponsorshipSubmission", () => {
  test("parses payload, turnstile token, and pledgeId when no proof is attached", () => {
    const parsed = parseSponsorshipSubmission(submissionBody());
    expect(parsed.pledgeId).toBe(pledgeId);
    expect(parsed.payload.contact.supporterName).toBe("陳小姐");
    expect(parsed.payload.turnstileToken).toBe("test-token");
    expect(parsed.proof).toBeUndefined();
  });

  test("parses a payload with proof metadata and a proof reference", () => {
    const body = submissionBody(
      basePayload({ proofMetadata: proofMetadata() }),
      proofRef("proof.jpg"),
    );
    const parsed = parseSponsorshipSubmission(body);
    expect(parsed.proof?.fileName).toBe("proof.jpg");
    expect(parsed.proof?.storagePath).toBe(`${pledgeId}/proof/proof.jpg`);
    expect(parsed.proof?.metadata.paymentMethod).toBe("fps");
  });

  test("rejects a missing pledgeId", () => {
    const body = submissionBody();
    delete (body as { pledgeId?: unknown }).pledgeId;
    expect(() => parseSponsorshipSubmission(body)).toThrow("Missing sponsorship pledge id");
  });

  test("rejects proof metadata without a proof reference", () => {
    const body = submissionBody(basePayload({ proofMetadata: proofMetadata() }));
    expect(() => parseSponsorshipSubmission(body)).toThrow(
      "Payment proof metadata was provided without a file reference",
    );
  });

  test("rejects a proof reference without metadata", () => {
    const body = submissionBody(basePayload(), proofRef("proof.jpg"));
    expect(() => parseSponsorshipSubmission(body)).toThrow(
      "Payment proof file reference was provided without metadata",
    );
  });

  test("rejects a proof reference missing storagePath", () => {
    const body = submissionBody(
      basePayload({ proofMetadata: proofMetadata() }),
      proofRef("proof.jpg", { storagePath: undefined }),
    );
    expect(() => parseSponsorshipSubmission(body)).toThrow(
      "Missing storage path for the payment proof",
    );
  });

  test("rejects a missing payload field", () => {
    const body = submissionBody();
    delete (body as { payload?: unknown }).payload;
    expect(() => parseSponsorshipSubmission(body)).toThrow();
  });

  test("accepts a valid body and returns the expected shape", () => {
    const body = submissionBody(
      basePayload({ proofMetadata: proofMetadata() }),
      proofRef("proof.jpg"),
    );
    const parsed = parseSponsorshipSubmission(body);

    expect(parsed).toEqual({
      pledgeId,
      payload: expect.objectContaining({ turnstileToken: "test-token" }),
      proof: {
        fileName: "proof.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        storagePath: `${pledgeId}/proof/proof.jpg`,
        metadata: proofMetadata(),
      },
    });
  });
});

type QueryCall = { table: string; method: string; payload?: unknown };
type StorageCall = {
  bucket: string;
  method: string;
  path?: string;
  paths?: string[];
  options?: unknown;
};
type FakeClientOptions = {
  failInsertTable?: string;
  supporterId?: string;
  storageObjects?: Array<{ fileName: string; sizeBytes: number; mimeType: string }>;
};

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

const DEFAULT_STORAGE_OBJECTS = [
  { fileName: "proof.jpg", sizeBytes: 2048, mimeType: "image/jpeg" },
];

function createFakeClient(options: FakeClientOptions = {}) {
  const state = {
    calls: [] as QueryCall[],
    storageCalls: [] as StorageCall[],
    failInsertTable: options.failInsertTable,
    supporterId: options.supporterId ?? "supporter-1",
    storageObjects: options.storageObjects ?? DEFAULT_STORAGE_OBJECTS,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket: string) {
        return {
          async list(folder: string, opts?: { search?: string }) {
            state.storageCalls.push({ bucket, method: "list", path: folder, options: opts });
            const match = state.storageObjects.find((object) => object.fileName === opts?.search);
            return {
              data: match
                ? [
                    {
                      name: match.fileName,
                      metadata: { size: match.sizeBytes, mimetype: match.mimeType },
                    },
                  ]
                : [],
              error: null,
            };
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

describe("persistSponsorshipPledge", () => {
  test("creates a pending_payment pledge using the pre-allocated pledgeId when no proof is attached", async () => {
    const { client, state } = createFakeClient();
    const result = await persistSponsorshipPledge({
      client,
      parsed: parsedSubmission(),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("pending_payment");
    expect(result.pledgeId).toBe(pledgeId);
    expect(result.reference).toMatch(/^SP-[A-Z0-9]{8}$/);
    expect(result.amountCents).toBe(30000);
    expect(state.calls).toContainEqual({
      table: "sponsorship_pledge",
      method: "insert",
      payload: expect.objectContaining({ id: pledgeId }),
    });
    expect(
      state.calls.some((c) => c.table === "sponsorship_preference" && c.method === "insert"),
    ).toBe(true);
    expect(state.calls.some((c) => c.table === "sponsorship_payment_proof")).toBe(false);
    expect(state.storageCalls.some((c) => c.method === "list")).toBe(false);
    expect(
      state.calls.some((c) => c.table === "public_status_token" && c.method === "insert"),
    ).toBe(true);
  });

  test("persists supporter consent choices", async () => {
    const { client, state } = createFakeClient();
    await persistSponsorshipPledge({
      client,
      parsed: parsedSubmission({ consents: { email: true, whatsapp: false } }),
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

  test("creates a provisional pledge and inserts the payment proof row after verifying the upload exists", async () => {
    const { client, state } = createFakeClient();
    const parsed = parsedSubmission({ proofMetadata: proofMetadata() }, proofRef("proof.jpg"));

    const result = await persistSponsorshipPledge({
      client,
      parsed,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.status).toBe("provisional");
    expect(state.storageCalls).toContainEqual(
      expect.objectContaining({
        bucket: SPONSORSHIP_PROOF_BUCKET,
        method: "list",
        path: `${pledgeId}/proof`,
        options: { search: "proof.jpg" },
      }),
    );
    expect(state.storageCalls.some((c) => c.method === "upload")).toBe(false);
    expect(state.calls).toContainEqual({
      table: "sponsorship_payment_proof",
      method: "insert",
      payload: expect.objectContaining({
        pledge_id: pledgeId,
        storage_path: `${pledgeId}/proof/proof.jpg`,
      }),
    });
  });

  test("throws SubmissionValidationError and never creates the supporter or pledge when the uploaded proof is missing from storage", async () => {
    const { client, state } = createFakeClient({ storageObjects: [] });
    const parsed = parsedSubmission({ proofMetadata: proofMetadata() }, proofRef("proof.jpg"));

    await expect(
      persistSponsorshipPledge({ client, parsed, logger: { error() {} } }),
    ).rejects.toThrow(SubmissionValidationError);

    expect(state.calls.some((c) => c.table === "supporter")).toBe(false);
    expect(state.calls.some((c) => c.table === "sponsorship_pledge" && c.method === "insert")).toBe(
      false,
    );
  });

  test("cleans up the pledge and status token when persistence fails mid-way", async () => {
    const { client, state } = createFakeClient({ failInsertTable: "public_status_token" });
    const parsed = parsedSubmission({ proofMetadata: proofMetadata() }, proofRef("proof.jpg"));

    await expect(
      persistSponsorshipPledge({ client, parsed, logger: { error() {} } }),
    ).rejects.toThrow("Failed to save sponsorship pledge");

    // The server never uploads storage objects itself anymore (the client
    // uploads directly via a signed URL before this call), so there is
    // nothing for cleanup to remove from Storage on a mid-way failure.
    expect(state.storageCalls.some((c) => c.method === "remove")).toBe(false);
    expect(state.calls.some((c) => c.table === "sponsorship_pledge" && c.method === "delete")).toBe(
      true,
    );
  });
});

describe("sendPledgeConfirmationEmail", () => {
  function fakeResult(overrides: Record<string, unknown> = {}) {
    return {
      pledgeId,
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
      parsedSubmission().payload,
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
      parsedSubmission().payload,
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
      parsedSubmission().payload,
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
