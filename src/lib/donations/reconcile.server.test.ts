import { describe, expect, test } from "bun:test";

import { reconcileProviderPayment } from "./reconcile.server";

const pendingPayment = {
  id: "payment-1",
  provider: "stripe",
  provider_ref: "cs_test_123",
  amount_cents: 15000,
  status: "pending",
  donation: {
    id: "donation-1",
    amount_cents: 15000,
    receipt_requested: false,
    status: "pending",
    supporter_id: "supporter-1",
    supporter: {
      id: "supporter-1",
      name: "Ada Donor",
      email: "ada@example.test",
      language: "en",
    },
  },
};

function createImmediateRetryClient() {
  const state = {
    reservation: null as null | {
      processed_at: string | null;
      processing_expires_at: string | null;
      processing_owner: string | null;
    },
    paymentLookups: 0,
    releases: 0,
  };

  function query(table: string, mode: "read" | "update", payload?: Record<string, unknown>) {
    const filters: Array<[string, string, unknown]> = [];
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return builder;
      },
      single() {
        if (table === "webhook_event") {
          return Promise.resolve({ data: state.reservation, error: null });
        }
        return builder.maybeSingle();
      },
      maybeSingle() {
        if (table === "payment" && mode === "read") {
          state.paymentLookups += 1;
          if (state.paymentLookups === 1) {
            return Promise.resolve({ data: null, error: new Error("transient payment lookup") });
          }
          return Promise.resolve({ data: pendingPayment, error: null });
        }
        if (table === "webhook_event" && mode === "update") {
          state.reservation = {
            processed_at: null,
            processing_expires_at: String(payload?.processing_expires_at ?? ""),
            processing_owner: String(payload?.processing_owner ?? ""),
          };
          return Promise.resolve({ data: { id: "webhook-event" }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: { error: null }) => void) {
        if (table === "webhook_event" && mode === "update" && state.reservation) {
          if (payload?.processed_at) {
            state.reservation.processed_at = String(payload.processed_at);
          }
          if (payload?.processing_owner === null) {
            state.reservation.processing_owner = null;
            state.reservation.processing_expires_at = null;
            if (!payload.processed_at) state.releases += 1;
          }
        }
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          if (table === "webhook_event") {
            const conflict = state.reservation !== null;
            if (!conflict) {
              state.reservation = {
                processed_at: null,
                processing_expires_at: String(payload.processing_expires_at),
                processing_owner: String(payload.processing_owner),
              };
            }
            return {
              then(resolve: (value: { error: null | { code: string } }) => void) {
                return Promise.resolve({ error: conflict ? { code: "23505" } : null }).then(
                  resolve,
                );
              },
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: "message" }, error: null });
                  },
                };
              },
            };
          }
          return {
            then(resolve: (value: { error: null }) => void) {
              return Promise.resolve({ error: null }).then(resolve);
            },
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: "message" }, error: null });
                },
              };
            },
          };
        },
        select() {
          return query(table, "read");
        },
        update(payload: Record<string, unknown>) {
          return query(table, "update", payload);
        },
      };
    },
  };

  return { client, state };
}

type Operation = {
  table: string;
  action: "insert" | "select" | "update";
  payload?: unknown;
  filters?: Array<[string, string, unknown]>;
};

function createReconcileClient({
  duplicateWebhookProcessedAt,
  duplicateWebhookProcessingExpiresAt,
  payment = pendingPayment,
  existingAcknowledgement = false,
}: {
  duplicateWebhookProcessedAt?: string | null;
  duplicateWebhookProcessingExpiresAt?: string | null;
  payment?: typeof pendingPayment;
  existingAcknowledgement?: boolean;
} = {}) {
  const operations: Operation[] = [];

  function query(table: string, action?: Operation["action"], payload?: unknown) {
    const filters: Array<[string, string, unknown]> = [];
    const builder = {
      select() {
        operations.push({ table, action: "select", filters });
        return builder;
      },
      update(nextPayload: unknown) {
        operations.push({ table, action: "update", payload: nextPayload, filters });
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return builder;
      },
      contains(column: string, value: unknown) {
        filters.push(["contains", column, value]);
        return builder;
      },
      single() {
        if (table === "payment") return Promise.resolve({ data: payment, error: null });
        if (table === "webhook_event") {
          return Promise.resolve({
            data:
              duplicateWebhookProcessedAt === undefined
                ? null
                : {
                    processed_at: duplicateWebhookProcessedAt,
                    processing_expires_at: duplicateWebhookProcessingExpiresAt ?? null,
                  },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        if (table === "message") {
          return Promise.resolve({
            data: existingAcknowledgement ? { id: "message-1" } : null,
            error: null,
          });
        }
        return builder.single();
      },
      then(resolve: (value: { error: null }) => void) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };

    if (action) {
      operations.push({ table, action, payload, filters });
    }

    return builder;
  }

  return {
    operations,
    client: {
      from(table: string) {
        return {
          insert(payload: unknown) {
            operations.push({ table, action: "insert", payload });
            const webhookConflict =
              table === "webhook_event" && duplicateWebhookProcessedAt !== undefined;
            // The acknowledgement claim does .insert().select("id").single().
            const insertBuilder = {
              select() {
                return {
                  single() {
                    if (webhookConflict) {
                      return Promise.resolve({ data: null, error: { code: "23505" } });
                    }
                    return Promise.resolve({ data: { id: "message-1" }, error: null });
                  },
                };
              },
              // webhook_event / audit_log inserts are awaited directly.
              then(resolve: (value: { error: unknown }) => void) {
                return Promise.resolve({
                  error: webhookConflict ? { code: "23505" } : null,
                }).then(resolve);
              },
            };
            return insertBuilder;
          },
          select(columns: string) {
            return query(table, "select", columns);
          },
          update(payload: unknown) {
            return query(table, "update", payload);
          },
        };
      },
    },
  };
}

describe("reconcileProviderPayment webhook event processing", () => {
  test("releases its reservation after a transient failure so immediate redelivery reprocesses", async () => {
    const { client, state } = createImmediateRetryClient();
    const args = {
      client: client as never,
      provider: "cod" as const,
      providerRef: "cod-order-test",
      providerEventId: "transaction-test:payment:paid:150",
      eventType: "payment.paid",
      payload: { type: "payment", status: "paid" },
    };

    await expect(reconcileProviderPayment(args)).rejects.toThrow("transient payment lookup");
    const retry = await reconcileProviderPayment(args);

    expect(retry).toMatchObject({ kind: "applied" });
    expect(state.paymentLookups).toBe(2);
    expect(state.releases).toBe(1);
  });

  test("marks provider events processed only after payment and donation updates succeed", async () => {
    const { client, operations } = createReconcileClient();

    await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_123",
      eventType: "checkout.session.completed",
      payload: { id: "evt_123" },
    });

    const eventInsert = operations.find(
      (operation) => operation.table === "webhook_event" && operation.action === "insert",
    );
    expect(eventInsert?.payload).not.toHaveProperty("processed_at");

    const donationUpdateIndex = operations.findIndex(
      (operation) => operation.table === "donation" && operation.action === "update",
    );
    const eventProcessedIndex = operations.findIndex(
      (operation) =>
        operation.table === "webhook_event" &&
        operation.action === "update" &&
        Boolean((operation.payload as { processed_at?: string }).processed_at),
    );

    expect(donationUpdateIndex).toBeGreaterThan(-1);
    expect(eventProcessedIndex).toBeGreaterThan(donationUpdateIndex);
  });

  test("retries duplicate webhook events that were reserved but not processed", async () => {
    const { client, operations } = createReconcileClient({
      duplicateWebhookProcessedAt: null,
      duplicateWebhookProcessingExpiresAt: "2026-06-26T00:00:00.000Z",
    });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_retry",
      eventType: "checkout.session.completed",
      payload: { id: "evt_retry" },
    });

    expect(result).toEqual({ kind: "applied", donationId: "donation-1", receiptNo: undefined });
    expect(
      operations.some(
        (operation) => operation.table === "payment" && operation.action === "update",
      ),
    ).toBe(true);
  });

  test("reclaims expired webhook leases with a compare-and-claim predicate", async () => {
    const expiredLease = "2026-06-26T00:00:00.000Z";
    const { client, operations } = createReconcileClient({
      duplicateWebhookProcessedAt: null,
      duplicateWebhookProcessingExpiresAt: expiredLease,
    });

    await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_reclaim",
      eventType: "checkout.session.completed",
      payload: { id: "evt_reclaim" },
    });

    const leaseReclaim = operations.find(
      (operation) =>
        operation.table === "webhook_event" &&
        operation.action === "update" &&
        Boolean((operation.payload as { processing_owner?: string }).processing_owner),
    );

    expect(leaseReclaim?.filters).toContainEqual(["eq", "processing_expires_at", expiredLease]);
  });

  test("does not process duplicate webhook events while the first attempt is still leased", async () => {
    const { client, operations } = createReconcileClient({
      duplicateWebhookProcessedAt: null,
      duplicateWebhookProcessingExpiresAt: "2999-01-01T00:00:00.000Z",
    });

    const result = await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_in_flight",
      eventType: "checkout.session.completed",
      payload: { id: "evt_in_flight" },
    });

    expect(result).toEqual({ kind: "duplicate" });
    expect(
      operations.some(
        (operation) => operation.table === "payment" && operation.action === "update",
      ),
    ).toBe(false);
  });

  test("continues acknowledgement completion for already-succeeded payment retries", async () => {
    const succeededPayment = {
      ...pendingPayment,
      status: "succeeded",
      donation: {
        ...pendingPayment.donation,
        status: "succeeded",
      },
    };
    const { client, operations } = createReconcileClient({
      duplicateWebhookProcessedAt: null,
      duplicateWebhookProcessingExpiresAt: "2026-06-26T00:00:00.000Z",
      payment: succeededPayment,
    });

    await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_partial_retry",
      eventType: "checkout.session.completed",
      payload: { id: "evt_partial_retry" },
    });

    const messageInsertIndex = operations.findIndex(
      (operation) => operation.table === "message" && operation.action === "insert",
    );
    const eventProcessedIndex = operations.findIndex(
      (operation) =>
        operation.table === "webhook_event" &&
        operation.action === "update" &&
        Boolean((operation.payload as { processed_at?: string }).processed_at),
    );

    expect(messageInsertIndex).toBeGreaterThan(-1);
    expect(eventProcessedIndex).toBeGreaterThan(messageInsertIndex);
  });

  test("finishes pending donation status before processing a retry after payment update succeeded", async () => {
    const partiallyAppliedPayment = {
      ...pendingPayment,
      status: "succeeded",
      donation: {
        ...pendingPayment.donation,
        status: "pending",
      },
    };
    const { client, operations } = createReconcileClient({
      duplicateWebhookProcessedAt: null,
      duplicateWebhookProcessingExpiresAt: "2026-06-26T00:00:00.000Z",
      payment: partiallyAppliedPayment,
    });

    await reconcileProviderPayment({
      client: client as never,
      provider: "stripe",
      providerRef: "cs_test_123",
      providerEventId: "evt_payment_done_donation_pending",
      eventType: "checkout.session.completed",
      payload: { id: "evt_payment_done_donation_pending" },
    });

    const donationUpdateIndex = operations.findIndex(
      (operation) =>
        operation.table === "donation" &&
        operation.action === "update" &&
        (operation.payload as { status?: string }).status === "succeeded",
    );
    const eventProcessedIndex = operations.findIndex(
      (operation) =>
        operation.table === "webhook_event" &&
        operation.action === "update" &&
        Boolean((operation.payload as { processed_at?: string }).processed_at),
    );

    expect(donationUpdateIndex).toBeGreaterThan(-1);
    expect(eventProcessedIndex).toBeGreaterThan(donationUpdateIndex);
  });
});
