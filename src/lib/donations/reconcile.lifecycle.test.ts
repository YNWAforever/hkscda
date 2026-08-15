import { describe, expect, test } from "bun:test";

import {
  failProviderPayment,
  flagProviderWebhookForReview,
  issueReceiptIfNeeded,
  issueReceiptForDonation,
  reconcileManualPayment,
  reconcileProviderPayment,
  refundProviderPayment,
  voidReceipt,
} from "./reconcile.server";

type FakePayment = {
  id: string;
  provider: string;
  provider_ref: string | null;
  amount_cents: number;
  status: string;
  donation: {
    id: string;
    amount_cents: number;
    receipt_requested: boolean;
    status: string;
    supporter_id: string;
    supporter: { id: string; name: string; email: string; language: "zh-HK" | "en" };
  };
};

const basePayment: FakePayment = {
  id: "payment-1",
  provider: "stripe",
  provider_ref: "cs_test_123",
  amount_cents: 20000,
  status: "succeeded",
  donation: {
    id: "donation-1",
    amount_cents: 20000,
    receipt_requested: true,
    status: "succeeded",
    supporter_id: "supporter-1",
    supporter: {
      id: "supporter-1",
      name: "Ada Donor",
      email: "ada@example.test",
      language: "en",
    },
  },
};

// Pending gift that does not request a receipt — exercises the success-path
// transition without touching the issue_receipt RPC.
const pendingPaymentNoReceipt: FakePayment = {
  ...basePayment,
  status: "pending",
  donation: { ...basePayment.donation, status: "pending", receipt_requested: false },
};

// --- Receipt issuance fake (no webhook plumbing) -------------------------------

function createReceiptFake(rpcRow: Record<string, unknown>) {
  const state = {
    rpc: null as null | { fn: string; params: Record<string, unknown> },
    uploads: [] as Array<{ path: string; options: unknown }>,
    patches: [] as Array<{ table: string; payload: unknown; filters: Array<[string, unknown]> }>,
  };
  const client = {
    // issue_receipt lives in the public schema, so it is called via the plain
    // client.rpc() entry point (not client.schema("private").rpc()).
    rpc(fn: string, params: Record<string, unknown>) {
      state.rpc = { fn, params };
      return Promise.resolve({ data: [rpcRow], error: null });
    },
    storage: {
      from() {
        return {
          upload(path: string, _body: unknown, options: unknown) {
            state.uploads.push({ path, options });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    from(table: string) {
      return {
        update(payload: unknown) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            then(resolve: (value: { error: null }) => void) {
              state.patches.push({ table, payload, filters });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, state };
}

describe("issueReceiptIfNeeded", () => {
  test("allocates + stores a new receipt atomically and uploads the PDF once", async () => {
    const { client, state } = createReceiptFake({
      receipt_no: "HKSCDA-2026-000001",
      receipt_id: "receipt-1",
      pdf_url: null,
      tax_year: 2026,
      issued_at: "2026-06-24T10:00:00.000Z",
    });

    const generated: Array<{ receiptNo: string }> = [];
    const receiptNo = await issueReceiptIfNeeded(client as never, basePayment, {
      now: () => new Date("2026-06-24T10:00:00.000Z"),
      async generatePdf(input) {
        generated.push({ receiptNo: input.receiptNo });
        return new Uint8Array([1, 2, 3]);
      },
    });

    expect(receiptNo).toBe("HKSCDA-2026-000001");
    expect(state.rpc?.fn).toBe("issue_receipt");
    expect(state.rpc?.params.p_donation_id).toBe("donation-1");
    expect(state.rpc?.params.p_amount_cents).toBe(20000);
    expect(generated).toHaveLength(1);
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].path).toBe("2026/HKSCDA-2026-000001.pdf");
    expect(state.uploads[0].options).toMatchObject({
      contentType: "application/pdf",
      upsert: true,
    });
    expect(state.patches).toEqual([
      {
        table: "receipt",
        payload: { pdf_url: "2026/HKSCDA-2026-000001.pdf" },
        filters: [["id", "receipt-1"]],
      },
    ]);
  });

  test("is idempotent: an already-issued receipt with a PDF is returned without re-allocating or re-uploading", async () => {
    const { client, state } = createReceiptFake({
      receipt_no: "HKSCDA-2026-000007",
      receipt_id: "receipt-7",
      pdf_url: "2026/HKSCDA-2026-000007.pdf",
      tax_year: 2026,
      issued_at: "2026-06-24T10:00:00.000Z",
    });

    let generatorCalls = 0;
    const receiptNo = await issueReceiptIfNeeded(client as never, basePayment, {
      now: () => new Date("2026-06-24T10:00:00.000Z"),
      async generatePdf() {
        generatorCalls += 1;
        return new Uint8Array([1]);
      },
    });

    expect(receiptNo).toBe("HKSCDA-2026-000007");
    expect(generatorCalls).toBe(0);
    expect(state.uploads).toHaveLength(0);
    expect(state.patches).toHaveLength(0);
  });

  test("regenerates the PDF when a prior attempt committed the row but left no PDF", async () => {
    const { client, state } = createReceiptFake({
      receipt_no: "HKSCDA-2026-000009",
      receipt_id: "receipt-9",
      pdf_url: null,
      tax_year: 2026,
      issued_at: "2026-06-24T10:00:00.000Z",
    });

    let generatorCalls = 0;
    await issueReceiptIfNeeded(client as never, basePayment, {
      now: () => new Date("2026-06-24T10:00:00.000Z"),
      async generatePdf() {
        generatorCalls += 1;
        return new Uint8Array([9]);
      },
    });

    expect(generatorCalls).toBe(1);
    expect(state.uploads).toHaveLength(1);
  });
});

describe("issueReceiptForDonation", () => {
  test("rejects ineligible donations before calling the receipt RPC", async () => {
    const rpcCalls: string[] = [];
    const ineligiblePayment = {
      ...basePayment,
      donation: {
        ...basePayment.donation,
        amount_cents: 20000,
        receipt_requested: false,
      },
    };
    const client = {
      rpc(fn: string) {
        rpcCalls.push(fn);
        return Promise.resolve({
          data: [
            {
              receipt_no: "HKSCDA-2026-000001",
              receipt_id: "receipt-1",
              pdf_url: "2026/HKSCDA-2026-000001.pdf",
              tax_year: 2026,
              issued_at: "2026-06-24T10:00:00.000Z",
            },
          ],
          error: null,
        });
      },
      from(table: string) {
        return {
          select() {
            const builder = {
              eq() {
                return builder;
              },
              order() {
                return builder;
              },
              limit() {
                return builder;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: table === "payment" ? ineligiblePayment : null,
                  error: null,
                });
              },
            };
            return builder;
          },
          insert() {
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    let response: Response | null = null;
    try {
      await issueReceiptForDonation(client as never, "donation-1", "admin-1");
    } catch (error) {
      response = error as Response;
    }

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(422);
    expect(rpcCalls).toEqual([]);
  });
});

// --- Webhook lifecycle fake ---------------------------------------------------

function createWebhookFake({
  payment,
  paymentByProvider = payment,
  issuedReceipts = [],
  transitionMiss = false,
  succeededTransitionMiss = false,
  paymentAfterTransitionMiss,
}: {
  payment: typeof basePayment | null;
  // What the provider_ref lookup returns (defaults to `payment`). Set null to
  // simulate a provider_ref miss that must fall back to the payment-id lookup.
  paymentByProvider?: typeof basePayment | null;
  issuedReceipts?: Array<{ id: string; pdf_url: string | null }>;
  transitionMiss?: boolean;
  succeededTransitionMiss?: boolean;
  paymentAfterTransitionMiss?: typeof basePayment;
}) {
  const operations: Array<{
    table: string;
    action: string;
    payload?: unknown;
    filters: Array<[string, string, unknown]>;
  }> = [];
  const removals: string[] = [];

  function chain(table: string, mode: "read" | "update" | "delete", payload?: unknown) {
    const filters: Array<[string, string, unknown]> = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return builder;
      },
      in(column: string, value: unknown) {
        filters.push(["in", column, value]);
        return builder;
      },
      contains(column: string, value: unknown) {
        filters.push(["contains", column, value]);
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        return Promise.resolve(readSingle(table, filters));
      },
      maybeSingle() {
        if (mode === "update" && (payload as { status?: string })?.status === "refunded") {
          operations.push({ table, action: mode, payload, filters });
          return Promise.resolve({
            data: transitionMiss ? null : { id: `${table}-1` },
            error: null,
          });
        }
        if (mode === "update" && (payload as { status?: string })?.status === "succeeded") {
          operations.push({ table, action: mode, payload, filters });
          return Promise.resolve({
            data: succeededTransitionMiss ? null : { id: `${table}-1` },
            error: null,
          });
        }
        return Promise.resolve(readSingle(table, filters));
      },
      then(resolve: (value: { data?: unknown; error: null }) => void) {
        if (mode === "read") {
          return Promise.resolve({ data: readList(table), error: null }).then(resolve);
        }
        operations.push({ table, action: mode, payload, filters });
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return builder;
  }

  function readSingle(table: string, filters: Array<[string, string, unknown]>) {
    if (table === "payment") {
      const byId = filters.some((f) => f[1] === "id");
      return {
        data: byId ? (paymentAfterTransitionMiss ?? payment) : paymentByProvider,
        error: null,
      };
    }
    return { data: null, error: null };
  }

  function readList(table: string) {
    if (table === "receipt") return issuedReceipts;
    return [];
  }

  const client = {
    storage: {
      from() {
        return {
          remove(paths: string[]) {
            removals.push(...paths);
            return Promise.resolve({ error: null });
          },
          upload() {
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    from(table: string) {
      return {
        insert(payload: unknown) {
          operations.push({ table, action: "insert", payload, filters: [] });
          // The acknowledgement claim does .insert().select("id").single();
          // other inserts (webhook_event, audit_log) are awaited directly.
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: "message-1" }, error: null });
                },
              };
            },
            then(resolve: (value: { error: null }) => void) {
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
        },
        select() {
          return chain(table, "read");
        },
        update(payload: unknown) {
          return chain(table, "update", payload);
        },
        delete() {
          return chain(table, "delete");
        },
      };
    },
  };

  return { client, operations, removals };
}

function statusUpdate(
  operations: Array<{ table: string; action: string; payload?: unknown }>,
  table: string,
) {
  return operations.find((operation) => operation.table === table && operation.action === "update")
    ?.payload as { status?: string } | undefined;
}

describe("failProviderPayment", () => {
  test("marks the payment and donation failed, guarded on the pending status", async () => {
    const { client, operations } = createWebhookFake({
      payment: {
        ...basePayment,
        status: "pending",
        donation: { ...basePayment.donation, status: "pending" },
      },
    });

    const result = await failProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_failed",
      eventType: "checkout.session.async_payment_failed",
      payload: {},
    });

    expect(result).toEqual({ kind: "failed", donationId: "donation-1" });
    expect(statusUpdate(operations, "payment")?.status).toBe("failed");
    expect(statusUpdate(operations, "donation")?.status).toBe("failed");

    const paymentUpdate = operations.find((o) => o.table === "payment" && o.action === "update");
    expect(paymentUpdate?.filters).toContainEqual(["eq", "status", "pending"]);
  });
});

describe("refundProviderPayment", () => {
  test("makes a verified refund terminal even when it arrives before the paid notification", async () => {
    const pendingCodPayment = {
      ...pendingPaymentNoReceipt,
      provider: "cod",
      provider_ref: "cod-order-test",
    };
    const { client, operations } = createWebhookFake({ payment: pendingCodPayment });

    const refund = await refundProviderPayment({
      client: client as never,
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "transaction-refund:refund:paid:-150",
      eventType: "refund.paid",
      payload: { type: "refund", status: "paid" },
    });

    expect(refund).toMatchObject({ kind: "refunded" });
    const paymentUpdate = operations.find(
      (operation) => operation.table === "payment" && operation.action === "update",
    );
    const donationUpdate = operations.find(
      (operation) => operation.table === "donation" && operation.action === "update",
    );
    expect(paymentUpdate?.filters).toContainEqual(["in", "status", ["pending", "succeeded"]]);
    expect(donationUpdate?.filters).toContainEqual(["in", "status", ["pending", "succeeded"]]);

    const terminal = {
      ...pendingCodPayment,
      status: "refunded",
      donation: { ...pendingCodPayment.donation, status: "refunded" },
    };
    const latePaid = createWebhookFake({ payment: terminal });
    const reconcile = await reconcileProviderPayment({
      client: latePaid.client as never,
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "transaction-payment:payment:paid:150",
      eventType: "payment.paid",
      payload: { type: "payment", status: "paid" },
    });

    expect(reconcile).toMatchObject({ kind: "skipped", reason: "terminal_status" });
    expect(
      latePaid.operations.some(
        (operation) =>
          operation.table === "payment" &&
          operation.action === "update" &&
          (operation.payload as { status?: string }).status === "succeeded",
      ),
    ).toBe(false);
  });

  test("marks refunded (guarded on succeeded), voids the receipt, and removes its PDF", async () => {
    const { client, operations, removals } = createWebhookFake({
      payment: basePayment,
      issuedReceipts: [{ id: "receipt-1", pdf_url: "2026/HKSCDA-2026-000001.pdf" }],
    });

    const result = await refundProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_refund",
      eventType: "charge.refunded",
      payload: {},
    });

    expect(result).toEqual({ kind: "refunded", donationId: "donation-1" });
    expect(statusUpdate(operations, "payment")?.status).toBe("refunded");
    expect(statusUpdate(operations, "donation")?.status).toBe("refunded");

    const paymentUpdate = operations.find((o) => o.table === "payment" && o.action === "update");
    expect(paymentUpdate?.filters).toContainEqual(["in", "status", ["pending", "succeeded"]]);

    const receiptUpdate = operations.find((o) => o.table === "receipt" && o.action === "update");
    expect((receiptUpdate?.payload as { status?: string }).status).toBe("void");
    expect(removals).toEqual(["2026/HKSCDA-2026-000001.pdf"]);
  });
});

describe("flagProviderWebhookForReview", () => {
  test("audits and acknowledges a mapped payment without changing payment state", async () => {
    const codPayment = {
      ...pendingPaymentNoReceipt,
      provider: "cod",
      provider_ref: "cod-order-test",
    };
    const { client, operations } = createWebhookFake({ payment: codPayment });

    const result = await flagProviderWebhookForReview(
      {
        client: client as never,
        provider: "cod",
        providerRef: "cod-order-test",
        providerEventId: "transaction-test:payment:paid:150",
        eventType: "payment.paid",
        payload: { type: "payment", status: "paid" },
      },
      { reason: "amount_mismatch", detail: { expectedCents: 20000, actualCents: 15000 } },
    );

    expect(result).toMatchObject({ kind: "manual_review", paymentId: "payment-1" });
    expect(
      operations.some(
        (operation) =>
          operation.table === "audit_log" &&
          operation.action === "insert" &&
          (operation.payload as { action?: string }).action === "payment.cod_manual_review",
      ),
    ).toBe(true);
    expect(operations.some((o) => o.table === "payment" && o.action === "update")).toBe(false);
    expect(operations.some((o) => o.table === "donation" && o.action === "update")).toBe(false);
  });
});

describe("refundProviderPayment guard outcomes", () => {
  test("does not report refunded when guarded state transitions affect no rows", async () => {
    const pendingCodPayment = {
      ...pendingPaymentNoReceipt,
      provider: "cod",
      provider_ref: "cod-order-test",
    };
    const { client, operations } = createWebhookFake({
      payment: pendingCodPayment,
      transitionMiss: true,
    });

    const result = await refundProviderPayment({
      client: client as never,
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "transaction-refund:refund:paid:-150",
      eventType: "refund.paid",
      payload: { type: "refund", status: "paid" },
    });

    expect(result).toMatchObject({ kind: "manual_review", reason: "state_transition_conflict" });
    expect(
      operations.some(
        (operation) =>
          operation.table === "audit_log" &&
          operation.action === "insert" &&
          (operation.payload as { action?: string }).action === "payment.refund_state_conflict",
      ),
    ).toBe(true);
  });
});

describe("reconcileProviderPayment unknown payments", () => {
  test("acknowledges (not_found) without resurrecting state when no payment matches", async () => {
    const { client, operations } = createWebhookFake({ payment: null });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "paypal",
      providerRef: "missing-order",
      providerEventId: "evt_missing",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      payload: {},
    });

    expect(result).toEqual({ kind: "not_found" });
    expect(operations.some((o) => o.table === "payment" && o.action === "update")).toBe(false);
    expect(operations.some((o) => o.table === "donation" && o.action === "update")).toBe(false);
    // The event is still marked processed so the provider stops retrying.
    expect(
      operations.some(
        (o) =>
          o.table === "webhook_event" &&
          o.action === "update" &&
          Boolean((o.payload as { processed_at?: string }).processed_at),
      ),
    ).toBe(true);
  });
});

describe("reconcileProviderPayment terminal-state guard", () => {
  test("skips a refunded donation instead of flipping it back to succeeded", async () => {
    const { client, operations } = createWebhookFake({
      payment: {
        ...basePayment,
        status: "succeeded",
        donation: { ...basePayment.donation, status: "refunded" },
      },
    });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_late_success",
      eventType: "checkout.session.completed",
      payload: {},
    });

    expect(result).toEqual({
      kind: "skipped",
      donationId: "donation-1",
      reason: "terminal_status",
    });
    expect(operations.some((o) => o.table === "donation" && o.action === "update")).toBe(false);
  });
});

describe("reconcileProviderPayment success path", () => {
  test("keeps a mixed succeeded payment and pending donation retryable after a guard miss", async () => {
    const mixedPayment = {
      ...pendingPaymentNoReceipt,
      provider: "cod",
      provider_ref: "cod-order-test",
      status: "succeeded",
      donation: { ...pendingPaymentNoReceipt.donation, status: "pending" },
    };
    const { client, operations } = createWebhookFake({
      payment: mixedPayment,
      succeededTransitionMiss: true,
      paymentAfterTransitionMiss: mixedPayment,
    });

    await expect(
      reconcileProviderPayment({
        client: client as never,
        provider: "cod",
        providerRef: "cod-order-test",
        providerEventId: "transaction-payment:mixed-state:paid:150",
        eventType: "payment.paid",
        payload: { type: "payment", status: "paid" },
      }),
    ).rejects.toThrow("Payment reconciliation state conflict");

    expect(
      operations.some(
        (operation) =>
          operation.table === "audit_log" &&
          (operation.payload as { action?: string }).action === "payment.reconcile_state_conflict",
      ),
    ).toBe(true);
    expect(
      operations.some(
        (operation) => operation.table === "message" && operation.action === "insert",
      ),
    ).toBe(false);
    expect(
      operations.some(
        (operation) =>
          operation.table === "webhook_event" &&
          operation.action === "update" &&
          Boolean((operation.payload as { processed_at?: string }).processed_at),
      ),
    ).toBe(false);
  });

  test("does not run receipt or acknowledgement side effects when a concurrent refund wins", async () => {
    const stalePending = {
      ...pendingPaymentNoReceipt,
      provider: "cod",
      provider_ref: "cod-order-test",
    };
    const refunded = {
      ...stalePending,
      status: "refunded",
      donation: { ...stalePending.donation, status: "refunded" },
    };
    const { client, operations } = createWebhookFake({
      payment: stalePending,
      succeededTransitionMiss: true,
      paymentAfterTransitionMiss: refunded,
    });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "cod",
      providerRef: "cod-order-test",
      providerEventId: "transaction-payment:payment:paid:150",
      eventType: "payment.paid",
      payload: { type: "payment", status: "paid" },
    });

    expect(result).toMatchObject({ kind: "skipped", reason: "terminal_status" });
    expect(
      operations.some(
        (operation) => operation.table === "message" && operation.action === "insert",
      ),
    ).toBe(false);
    expect(
      operations.some(
        (operation) => operation.table === "receipt" && operation.action === "insert",
      ),
    ).toBe(false);
  });

  test("applies pending->succeeded guarded on the pending status", async () => {
    const { client, operations } = createWebhookFake({ payment: pendingPaymentNoReceipt });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_ok",
      eventType: "checkout.session.completed",
      payload: {},
    });

    expect(result).toEqual({ kind: "applied", donationId: "donation-1", receiptNo: undefined });
    const paymentUpdate = operations.find((o) => o.table === "payment" && o.action === "update");
    const donationUpdate = operations.find((o) => o.table === "donation" && o.action === "update");
    expect((paymentUpdate?.payload as { status?: string }).status).toBe("succeeded");
    // Optimistic-concurrency guard: reverting either .eq("status","pending")
    // would fail these assertions.
    expect(paymentUpdate?.filters).toContainEqual(["eq", "status", "pending"]);
    expect(donationUpdate?.filters).toContainEqual(["eq", "status", "pending"]);
  });

  test("quarantines an amount mismatch terminally: audits, acknowledges, does not credit", async () => {
    const mismatched: FakePayment = { ...pendingPaymentNoReceipt, amount_cents: 19999 };
    const { client, operations } = createWebhookFake({ payment: mismatched });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_mismatch",
      eventType: "checkout.session.completed",
      payload: {},
    });

    // Terminal result (not a throw) so the event is marked processed and the
    // provider stops retrying; the donation/payment are NOT credited.
    expect(result).toEqual({
      kind: "amount_mismatch",
      donationId: "donation-1",
      paymentId: "payment-1",
      expectedCents: 20000,
      actualCents: 19999,
    });
    expect(operations.some((o) => o.table === "donation" && o.action === "update")).toBe(false);
    expect(operations.some((o) => o.table === "payment" && o.action === "update")).toBe(false);

    // The mismatch is flagged for manual review.
    const mismatchAudit = operations.find(
      (o) =>
        o.table === "audit_log" &&
        o.action === "insert" &&
        (o.payload as { action?: string }).action === "payment.amount_mismatch",
    );
    expect(mismatchAudit).toBeTruthy();

    // The event is still acknowledged (marked processed).
    expect(
      operations.some(
        (o) =>
          o.table === "webhook_event" &&
          o.action === "update" &&
          Boolean((o.payload as { processed_at?: string }).processed_at),
      ),
    ).toBe(true);
  });
});

describe("reconcileProviderPayment metadata fallback", () => {
  test("reconciles via fallbackPaymentId and backfills provider_ref when the provider_ref lookup misses", async () => {
    const orphan: FakePayment = {
      ...pendingPaymentNoReceipt,
      provider: "paypal",
      provider_ref: null,
    };
    const { client, operations } = createWebhookFake({ payment: orphan, paymentByProvider: null });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "paypal",
      providerRef: "order-xyz",
      fallbackPaymentId: "payment-1",
      providerEventId: "evt_fallback",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      payload: {},
    });

    expect(result).toEqual({ kind: "applied", donationId: "donation-1", receiptNo: undefined });
    const backfill = operations.find(
      (o) =>
        o.table === "payment" &&
        o.action === "update" &&
        (o.payload as { provider_ref?: string }).provider_ref === "order-xyz",
    );
    expect(backfill).toBeTruthy();
    expect(backfill?.filters).toContainEqual(["is", "provider_ref", null]);
  });
});

describe("reconcileManualPayment", () => {
  test("marks a manual payment received, records actor + bank reference, and audits", async () => {
    const { client, operations } = createWebhookFake({ payment: pendingPaymentNoReceipt });

    const result = await reconcileManualPayment({
      client: client as never,
      paymentId: "payment-1",
      actorUserId: "admin-1",
      bankReference: "FPS-123",
    });

    expect(result).toEqual({ kind: "applied", donationId: "donation-1", receiptNo: undefined });
    const paymentUpdate = operations.find((o) => o.table === "payment" && o.action === "update");
    expect(paymentUpdate?.payload).toMatchObject({
      status: "succeeded",
      reconciled_by: "admin-1",
      bank_reference: "FPS-123",
    });
    expect(operations.some((o) => o.table === "audit_log" && o.action === "insert")).toBe(true);
  });

  test("rejects (409) reconciling a payment that is not pending, without auditing", async () => {
    // basePayment is already 'succeeded' — a replay/double-click.
    const { client, operations } = createWebhookFake({ payment: basePayment });

    const rejection = reconcileManualPayment({
      client: client as never,
      paymentId: "payment-1",
      actorUserId: "admin-1",
      bankReference: "FPS-DUP",
    });

    await expect(rejection).rejects.toBeInstanceOf(Response);
    // No duplicate mark_received audit row for a payment that changed nothing.
    expect(operations.some((o) => o.table === "audit_log" && o.action === "insert")).toBe(false);
  });
});

describe("voidReceipt", () => {
  test("removes the stored PDF when voiding so it is no longer downloadable", async () => {
    const operations: Array<{ table: string; action: string; payload?: unknown }> = [];
    const removals: string[] = [];
    const client = {
      storage: {
        from() {
          return {
            remove(paths: string[]) {
              removals.push(...paths);
              return Promise.resolve({ error: null });
            },
          };
        },
      },
      from(table: string) {
        return {
          insert(payload: unknown) {
            operations.push({ table, action: "insert", payload });
            return Promise.resolve({ error: null });
          },
          update(payload: unknown) {
            const builder = {
              eq() {
                return builder;
              },
              select() {
                return builder;
              },
              single() {
                operations.push({ table, action: "update", payload });
                return Promise.resolve({
                  data: { id: "receipt-1", pdf_url: "2026/HKSCDA-2026-000001.pdf" },
                  error: null,
                });
              },
            };
            return builder;
          },
        };
      },
    };

    const result = await voidReceipt(client as never, "receipt-1", "admin-1", {
      supporterId: "supporter-1",
    });

    expect(result).toEqual({ receiptId: "receipt-1", status: "void" });
    expect(removals).toEqual(["2026/HKSCDA-2026-000001.pdf"]);
    expect(operations.some((o) => o.table === "audit_log" && o.action === "insert")).toBe(true);
  });
});
