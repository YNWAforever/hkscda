import { describe, expect, test } from "bun:test";
import { hashStatusToken } from "../publicAdoption/statusToken.server";

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
const statusToken = "A".repeat(43);

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
    statusToken,
    proof,
    turnstileToken: typeof payload.turnstileToken === "string" ? payload.turnstileToken : undefined,
    ...overrides,
  };
}

function parsedSubmission(
  payloadOverrides: Record<string, unknown> = {},
  proof?: Record<string, unknown>,
): ParsedSponsorshipMultipart & { pledgeId: string; statusToken: string } {
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
    const proof = proofRef("proof.jpg");
    proof.proofIntent = "signed-intent";
    const body = submissionBody(basePayload({ proofMetadata: proofMetadata() }), proof);
    const parsed = parseSponsorshipSubmission(body);
    expect(parsed.proof?.fileName).toBe("proof.jpg");
    expect(parsed.proof?.proofIntent).toBe("signed-intent");
    expect(parsed.proof?.storagePath).toBe(`${pledgeId}/proof/proof.jpg`);
    expect(parsed.proof?.metadata.paymentMethod).toBe("fps");
  });

  test("rejects a missing pledgeId", () => {
    const body = submissionBody();
    delete (body as { pledgeId?: unknown }).pledgeId;
    expect(() => parseSponsorshipSubmission(body)).toThrow("Missing sponsorship pledge id");
  });

  test("rejects an invalid pledge id before database lookup", () => {
    expect(() =>
      parseSponsorshipSubmission(
        submissionBody(basePayload(), undefined, { pledgeId: "not-a-uuid" }),
      ),
    ).toThrow(SubmissionValidationError);
  });
  test("rejects missing or weak status tokens", () => {
    expect(() =>
      parseSponsorshipSubmission(
        submissionBody(basePayload(), undefined, { statusToken: undefined }),
      ),
    ).toThrow(SubmissionValidationError);
    expect(() =>
      parseSponsorshipSubmission(
        submissionBody(basePayload(), undefined, { statusToken: "guessable" }),
      ),
    ).toThrow(SubmissionValidationError);
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

  test("rejects proof objects outside the issued pledge and exact file path", () => {
    for (const storagePath of [
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/proof/proof.jpg",
      pledgeId + "/other/proof.jpg",
      pledgeId + "/proof/another.jpg",
    ]) {
      expect(() =>
        parseSponsorshipSubmission(
          submissionBody(
            basePayload({ proofMetadata: proofMetadata() }),
            proofRef("proof.jpg", { storagePath }),
          ),
        ),
      ).toThrow("Payment proof path does not match this pledge");
    }
  });

  test("accepts a proof path using the signed upload file-name sanitizer", () => {
    const parsed = parseSponsorshipSubmission(
      submissionBody(
        basePayload({ proofMetadata: proofMetadata() }),
        proofRef("receipt A.jpg", { storagePath: pledgeId + "/proof/receipt_A.jpg" }),
      ),
    );
    expect(parsed.proof?.storagePath).toBe(pledgeId + "/proof/receipt_A.jpg");
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
      statusToken,
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
  failPledgeTransaction?: boolean;
  failSentStatusUpdate?: boolean;
  supporterId?: string;
  storageObjects?: Array<{ fileName: string; sizeBytes: number; mimeType: string }>;
};

class FakeQuery {
  private action: "insert" | "select" | "delete" | null = null;
  private mutationPayload: unknown;

  constructor(
    private readonly state: {
      calls: QueryCall[];
      failPledgeTransaction?: boolean;
      failSentStatusUpdate?: boolean;
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
    if (
      this.action === "insert" &&
      this.state.failPledgeTransaction &&
      this.table === "sponsorship_pledge"
    ) {
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
      (this.table === "message" &&
        this.state.failSentStatusUpdate &&
        (this.mutationPayload as { status?: string } | undefined)?.status === "sent") ||
      (this.action === "insert" &&
        this.state.failPledgeTransaction &&
        this.table === "sponsorship_pledge")
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
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    failPledgeTransaction: options.failPledgeTransaction,
    failSentStatusUpdate: options.failSentStatusUpdate,
    supporterId: options.supporterId ?? "supporter-1",
    storageObjects: options.storageObjects ?? DEFAULT_STORAGE_OBJECTS,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    // The pledge path resolves the supporter through the protected
    // resolve_public_supporter_identity RPC rather than upserting the master
    // record. Implementing it here (instead of injecting a stub per test) keeps
    // the default wiring under test, so a regression back to a direct
    // `.from("supporter").upsert(...)` shows up as a missing RPC call.
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      if (name === "resolve_public_supporter_identity") {
        return { data: { supporterId: state.supporterId, kind: "existing" }, error: null };
      }
      if (name === "create_public_sponsorship_pledge") {
        return {
          data: null,
          error: state.failPledgeTransaction ? new Error("atomic pledge transaction failed") : null,
        };
      }
      return { data: null, error: new Error(`unexpected rpc: ${name}`) };
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
    const transaction = state.rpcCalls.find(
      (call) => call.name === "create_public_sponsorship_pledge",
    );
    expect(transaction?.args).toMatchObject({
      p_pledge_id: pledgeId,
      p_pledge: { supporter_id: "supporter-1", status: "pending_payment" },
      p_preferences: [expect.objectContaining({ pledge_id: pledgeId })],
      p_proof: null,
      p_token: { token_hash: hashStatusToken(statusToken) },
    });
    expect(state.calls.some((call) => call.table === "sponsorship_pledge")).toBe(false);
    expect(state.storageCalls.some((c) => c.method === "list")).toBe(false);
    expect(result.statusToken).toBe(statusToken);
  });

  test("records only opt_out consent, never opt_in, from an unverified pledge", async () => {
    const { client, state } = createFakeClient();
    await persistSponsorshipPledge({
      client,
      parsed: parsedSubmission({ consents: { email: true, whatsapp: false } }),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    // Nobody proved they own this email address. Writing the email opt_in here
    // would let an unverified submission reverse a supporter's existing opt_out,
    // so only the explicit opt_out is persisted as consent -- matching
    // donations/service.ts and volunteers/service.ts.
    const consentCall = state.calls.find((c) => c.table === "consent" && c.method === "insert");
    expect(consentCall).toBeDefined();
    expect(consentCall?.payload).toEqual([
      {
        supporter_id: "supporter-1",
        channel: "whatsapp",
        status: "opt_out",
        source: "sponsorship_pledge_form",
        timestamp: "2026-07-02T00:00:00.000Z",
      },
    ]);
  });

  test("carries the opt-in tick on the pledge as a request, not as consent", async () => {
    const { client, state } = createFakeClient();
    await persistSponsorshipPledge({
      client,
      parsed: parsedSubmission({ consents: { email: true, whatsapp: false } }),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    // A database trigger turns these flags into supporter_consent_intent rows so
    // staff can verify and promote them later.
    const pledgeCall = state.rpcCalls.find(
      (call) => call.name === "create_public_sponsorship_pledge",
    );
    expect(pledgeCall?.args.p_pledge).toMatchObject({
      consent_email_requested: true,
      consent_whatsapp_requested: false,
    });
  });

  test("resolves the supporter through the protected identity path, never upserting the master record", async () => {
    const { client, state } = createFakeClient();
    await persistSponsorshipPledge({
      client,
      parsed: parsedSubmission({ consents: { email: false, whatsapp: false } }),
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });

    // resolve_public_supporter_identity inserts with `on conflict (email) do
    // nothing`, so an existing supporter's name, phone, language and source are
    // preserved. A direct upsert on email would overwrite all four.
    const resolveCall = state.rpcCalls.find((c) => c.name === "resolve_public_supporter_identity");
    expect(resolveCall).toBeDefined();
    expect(resolveCall?.args).toEqual({
      p_contact: {
        name: "陳小姐",
        email: "chan@example.com",
        phone: "91234567",
        language: "zh-HK",
        source: "sponsorship_pledge_form",
      },
    });
    expect(state.calls.some((c) => c.table === "supporter")).toBe(false);
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
    const transaction = state.rpcCalls.find(
      (call) => call.name === "create_public_sponsorship_pledge",
    );
    expect(transaction?.args.p_proof).toMatchObject({
      pledge_id: pledgeId,
      storage_path: pledgeId + "/proof/proof.jpg",
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

  test("writes the pledge and bearer token in one transaction without deleting an uncertain commit", async () => {
    const { client, state } = createFakeClient({ failPledgeTransaction: true });
    const parsed = parsedSubmission({ proofMetadata: proofMetadata() }, proofRef("proof.jpg"));

    await expect(
      persistSponsorshipPledge({ client, parsed, logger: { error() {} } }),
    ).rejects.toThrow("Failed to save sponsorship pledge");

    expect(state.rpcCalls.some((call) => call.name === "create_public_sponsorship_pledge")).toBe(
      true,
    );
    expect(
      state.calls.some((call) => call.table === "sponsorship_pledge" && call.method === "delete"),
    ).toBe(false);
    expect(
      state.calls.some((call) => call.table === "public_status_token" && call.method === "delete"),
    ).toBe(false);
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
      statusUrl: "http://localhost:5173/sponsors/status/token",
      expiresAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  test("email test sink receives only the approved sponsorship snapshot", async () => {
    const { client } = createFakeClient();
    let deliveredHtml = "";
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        getEmailConfig: () => ({
          resendApiKey: "test-only",
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        loadPaymentInstructions: async () => [
          {
            instructionsActive: true,
            snapshot: {
              configId: "9a78c87c-1e3a-4c02-b551-71a9b69a5412",
              configVersion: 2,
              purpose: "sponsorship",
              method: "fps",
              displayLabelZh: "轉數快 FPS",
              displayLabelEn: "FPS",
              details: { payableTo: "Synthetic charity", identifier: "FPS SANDBOX-99" },
              capturedAt: "2026-09-27T00:00:00Z",
            },
          },
        ],
        createEmailSender: () => ({
          send: async ({ html }) => {
            deliveredHtml = html;
            return {};
          },
        }),
      },
    );
    expect(result).toBe("sent");
    expect(deliveredHtml).toContain("FPS SANDBOX-99");
    expect(deliveredHtml).not.toContain("8727588");
  });

  test("instruction lookup failure sends verification text to the test sink", async () => {
    const { client } = createFakeClient();
    let deliveredHtml = "";
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        getEmailConfig: () => ({
          resendApiKey: "test-only",
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        loadPaymentInstructions: async () => {
          throw new Error("synthetic database timeout");
        },
        createEmailSender: () => ({
          send: async ({ html }) => {
            deliveredHtml = html;
            return {};
          },
        }),
        logger: { error: () => {} },
      },
    );
    expect(result).toBe("sent");
    expect(deliveredHtml).toContain("聯絡");
    expect(deliveredHtml).not.toContain("8727588");
  });

  test("marks email failed when no Resend key is configured", async () => {
    const { client, state } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        loadPaymentInstructions: async () => [],
        getEmailConfig: () => ({
          resendApiKey: undefined,
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
      },
    );
    expect(result).toBe("failed");
    expect(
      state.calls.find((c) => c.table === "message" && c.method === "insert")?.payload,
    ).toMatchObject({ status: "failed" });
  });

  test("returns 'sent' when the email sender succeeds", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        loadPaymentInstructions: async () => [],
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

  test("does not report sent when persisting the sent status fails", async () => {
    const { client } = createFakeClient({ failSentStatusUpdate: true });
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        loadPaymentInstructions: async () => [],
        getEmailConfig: () => ({
          resendApiKey: "key",
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        createEmailSender: () => ({ send: async () => ({}) }),
        logger: { error: () => {} },
      },
    );
    expect(result).toBe("failed");
  });
  test("marks the message failed when Resend returns an error", async () => {
    const { client, state } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        loadPaymentInstructions: async () => [],
        getEmailConfig: () => ({
          resendApiKey: "key",
          from: "HKSCDA <noreply@hkscda.com>",
          replyTo: "info@hkscda.com",
          notificationEmail: "info@hkscda.com",
        }),
        createEmailSender: () => ({
          send: async () => ({ data: null, error: { name: "validation_error" } }),
        }),
        logger: { error: () => {} },
      },
    );

    expect(result).toBe("failed");
    expect(state.calls).toContainEqual({
      table: "message",
      method: "update",
      payload: { status: "failed" },
    });
    expect(state.calls).not.toContainEqual({
      table: "message",
      method: "update",
      payload: expect.objectContaining({ status: "sent" }),
    });
  });

  test("returns 'failed' when the email sender throws", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeConfirmationEmail(
      client,
      parsedSubmission().payload,
      fakeResult(),
      {
        loadPaymentInstructions: async () => [],
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
