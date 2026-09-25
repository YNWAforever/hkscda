import { describe, expect, test } from "bun:test";
import * as paypalModule from "./paypal";

import {
  getPayPalOrderId,
  getPayPalReconcileOrderId,
  shouldCapturePayPalEvent,
  shouldReconcilePayPalEvent,
} from "./paypal";

describe("PayPal webhook event routing", () => {
  test("captures approved checkout orders without reconciling them as succeeded", () => {
    expect(shouldCapturePayPalEvent("CHECKOUT.ORDER.APPROVED")).toBe(true);
    expect(shouldReconcilePayPalEvent("CHECKOUT.ORDER.APPROVED")).toBe(false);
  });

  test("reconciles only completed capture webhooks", () => {
    expect(shouldReconcilePayPalEvent("PAYMENT.CAPTURE.COMPLETED")).toBe(true);
    expect(shouldReconcilePayPalEvent("PAYMENT.CAPTURE.DENIED")).toBe(false);
  });
});

describe("PayPal order id extraction", () => {
  test("uses resource.id for an approved order event", () => {
    expect(
      getPayPalOrderId({
        id: "evt",
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: { id: "order-1" },
      }),
    ).toBe("order-1");
  });

  test("reconcile extraction only trusts related_ids.order_id, never the capture id", () => {
    // A capture event: resource.id is the CAPTURE id, the order id lives under
    // supplementary_data.related_ids.
    const capture = {
      id: "evt",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "capture-1",
        supplementary_data: { related_ids: { order_id: "order-1" } },
      },
    };
    expect(getPayPalReconcileOrderId(capture)).toBe("order-1");
  });

  test("reconcile extraction returns undefined (never the capture id) when related_ids is absent", () => {
    const capture = {
      id: "evt",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "capture-1" },
    };
    expect(getPayPalReconcileOrderId(capture)).toBeUndefined();
  });
});

describe("verified PayPal financial events", () => {
  test("an unmapped completed capture is recorded for manual review", async () => {
    const handler = (paypalModule as Record<string, unknown>).handleVerifiedPayPalWebhook;
    expect(handler).toBeFunction();
    if (typeof handler !== "function") return;
    let reviewed: Record<string, unknown> | undefined;
    const result = await handler(
      {
        id: "evt-unmapped-completed",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "capture-unmapped" },
      },
      {
        client: {} as never,
        flagProviderWebhookForReview: async (_args: unknown, review: Record<string, unknown>) => {
          reviewed = review;
          return { kind: "manual_review" };
        },
      },
    );
    expect(reviewed?.reason).toBe("missing_completed_order_id");
    expect(result.skipped).toBe("manual_review");
  });
  test("forwards the verified completed capture amount and currency", async () => {
    const handler = (paypalModule as Record<string, unknown>).handleVerifiedPayPalWebhook;
    expect(handler).toBeFunction();
    if (typeof handler !== "function") return;
    let received: Record<string, unknown> | undefined;
    await handler(
      {
        id: "evt-completed",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "capture-1",
          amount: { value: "200.00", currency_code: "HKD" },
          supplementary_data: { related_ids: { order_id: "order-1" } },
        },
      },
      {
        client: {} as never,
        reconcileProviderPayment: async (args: Record<string, unknown>) => {
          received = args;
          return { kind: "applied" };
        },
      },
    );
    expect(received?.providerSettlement).toEqual({ amountCents: 20000, currency: "HKD" });
  });

  test("a denied capture fails the matching pending donation", async () => {
    const handler = (paypalModule as Record<string, unknown>).handleVerifiedPayPalWebhook;
    expect(handler).toBeFunction();
    if (typeof handler !== "function") return;
    let received: Record<string, unknown> | undefined;
    await handler(
      {
        id: "evt-denied",
        event_type: "PAYMENT.CAPTURE.DENIED",
        resource: {
          id: "capture-1",
          supplementary_data: { related_ids: { order_id: "order-1" } },
        },
      },
      {
        client: {} as never,
        failProviderPayment: async (args: Record<string, unknown>) => {
          received = args;
          return { kind: "failed" };
        },
      },
    );
    expect(received?.providerRef).toBe("order-1");
    expect(received?.providerEventId).toBe("evt-denied");
  });

  test("a full refund resolves the capture and reverses the matching order", async () => {
    const handler = (paypalModule as Record<string, unknown>).handleVerifiedPayPalWebhook;
    expect(handler).toBeFunction();
    if (typeof handler !== "function") return;
    let refunded: Record<string, unknown> | undefined;
    await handler(
      {
        id: "evt-refund",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "refund-1",
          links: [{ rel: "up", href: "https://api-m.paypal.com/v2/payments/captures/capture-1" }],
        },
      },
      {
        client: {} as never,
        getPayPalCapture: async (id: string) => ({
          id,
          status: "REFUNDED",
          supplementary_data: { related_ids: { order_id: "order-1" } },
        }),
        refundProviderPayment: async (args: Record<string, unknown>) => {
          refunded = args;
          return { kind: "refunded" };
        },
      },
    );
    expect(refunded?.providerRef).toBe("order-1");
    expect(refunded?.providerEventId).toBe("evt-refund");
  });

  test("a partial refund is recorded for manual review without voiding the full receipt", async () => {
    const handler = (paypalModule as Record<string, unknown>).handleVerifiedPayPalWebhook;
    expect(handler).toBeFunction();
    if (typeof handler !== "function") return;
    let reviewed: Record<string, unknown> | undefined;
    let refunded = false;
    await handler(
      {
        id: "evt-partial",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "refund-2",
          supplementary_data: { related_ids: { capture_id: "capture-1" } },
        },
      },
      {
        client: {} as never,
        getPayPalCapture: async () => ({
          id: "capture-1",
          status: "PARTIALLY_REFUNDED",
          supplementary_data: { related_ids: { order_id: "order-1" } },
        }),
        flagProviderWebhookForReview: async (_args: unknown, review: Record<string, unknown>) => {
          reviewed = review;
          return { kind: "manual_review" };
        },
        refundProviderPayment: async () => {
          refunded = true;
          return { kind: "refunded" };
        },
      },
    );
    expect(reviewed?.reason).toBe("partial_refund");
    expect(refunded).toBe(false);
  });
});
