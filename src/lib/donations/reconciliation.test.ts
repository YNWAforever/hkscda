import { describe, expect, test } from "bun:test";

import { buildReconciliationPlan } from "./reconciliation";

describe("payment reconciliation planning", () => {
  test("marks a pending payment and donation succeeded once", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "evt_1",
      seenProviderEventIds: new Set(),
      donation: {
        id: "donation-1",
        amount_cents: 15000,
        receipt_requested: true,
        status: "pending",
      },
      payment: {
        id: "payment-1",
        amount_cents: 15000,
        status: "pending",
      },
    });

    expect(plan.kind).toBe("apply");
    if (plan.kind !== "apply") {
      throw new Error("expected apply reconciliation plan");
    }
    expect(plan.donationStatus).toBe("succeeded");
    expect(plan.paymentStatus).toBe("succeeded");
    expect(plan.shouldIssueReceipt).toBe(true);
  });

  test("ignores duplicate provider events", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "evt_seen",
      seenProviderEventIds: new Set(["evt_seen"]),
      donation: {
        id: "donation-1",
        amount_cents: 15000,
        receipt_requested: true,
        status: "pending",
      },
      payment: {
        id: "payment-1",
        amount_cents: 15000,
        status: "pending",
      },
    });

    expect(plan).toEqual({ kind: "duplicate" });
  });

  test("does not issue a receipt for ineligible gifts", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "evt_2",
      seenProviderEventIds: new Set(),
      donation: {
        id: "donation-1",
        amount_cents: 5000,
        receipt_requested: true,
        status: "pending",
      },
      payment: {
        id: "payment-1",
        amount_cents: 5000,
        status: "pending",
      },
    });

    expect(plan.kind).toBe("apply");
    if (plan.kind === "apply") {
      expect(plan.shouldIssueReceipt).toBe(false);
    }
  });

  test("treats already-succeeded payments as duplicates", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "manual-payment-1",
      seenProviderEventIds: new Set(),
      donation: {
        id: "donation-1",
        amount_cents: 15000,
        receipt_requested: true,
        status: "succeeded",
      },
      payment: {
        id: "payment-1",
        amount_cents: 15000,
        status: "succeeded",
      },
    });

    expect(plan).toEqual({ kind: "duplicate" });
  });

  test("skips applying when the donation has already been refunded", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "evt_refunded",
      seenProviderEventIds: new Set(),
      donation: {
        id: "donation-1",
        amount_cents: 15000,
        receipt_requested: true,
        status: "refunded",
      },
      payment: {
        id: "payment-1",
        amount_cents: 15000,
        status: "succeeded",
      },
    });

    expect(plan).toEqual({ kind: "skip", reason: "terminal_status" });
  });

  test("skips applying when the payment has already failed", () => {
    const plan = buildReconciliationPlan({
      providerEventId: "evt_failed",
      seenProviderEventIds: new Set(),
      donation: {
        id: "donation-1",
        amount_cents: 15000,
        receipt_requested: true,
        status: "pending",
      },
      payment: {
        id: "payment-1",
        amount_cents: 15000,
        status: "failed",
      },
    });

    expect(plan).toEqual({ kind: "skip", reason: "terminal_status" });
  });

  test("rejects amount mismatches before mutating records", () => {
    expect(() =>
      buildReconciliationPlan({
        providerEventId: "evt_3",
        seenProviderEventIds: new Set(),
        donation: {
          id: "donation-1",
          amount_cents: 15000,
          receipt_requested: true,
          status: "pending",
        },
        payment: {
          id: "payment-1",
          amount_cents: 10000,
          status: "pending",
        },
      }),
    ).toThrow("Payment amount does not match donation amount");
  });
});
