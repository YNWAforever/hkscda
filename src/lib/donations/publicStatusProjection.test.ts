import { expect, test } from "bun:test";

import {
  projectDonationEffectStatuses,
  resolveCommittedPaymentStatus,
} from "./publicStatusProjection";

test("receipt failure cannot change a succeeded payment", () => {
  expect(
    projectDonationEffectStatuses({
      paymentStatus: "succeeded",
      receiptRequested: true,
      netAmountCents: 20000,
      receipt: null,
      notification: null,
      deliveryJob: "retryable",
    }),
  ).toEqual({ receiptStatus: "failed", notificationStatus: "pending" });
});

test("receipt and provider acceptance are distinct from delivery", () => {
  const base = {
    paymentStatus: "succeeded" as const,
    receiptRequested: true,
    netAmountCents: 20000,
    receipt: { status: "issued" as const, pdf_url: "2026/receipt.pdf" },
    deliveryJob: "complete" as const,
  };
  expect(projectDonationEffectStatuses({ ...base, notification: "sent" })).toEqual({
    receiptStatus: "issued",
    notificationStatus: "provider_accepted",
  });
  expect(projectDonationEffectStatuses({ ...base, notification: "delivered" })).toEqual({
    receiptStatus: "issued",
    notificationStatus: "delivered",
  });
});

test("refund and ineligible receipt project without inventing a new receipt", () => {
  expect(
    projectDonationEffectStatuses({
      paymentStatus: "refunded",
      receiptRequested: true,
      netAmountCents: 0,
      receipt: { status: "void", pdf_url: null },
      notification: "sent",
      deliveryJob: "complete",
    }),
  ).toEqual({ receiptStatus: "void", notificationStatus: "provider_accepted" });
  expect(
    projectDonationEffectStatuses({
      paymentStatus: "succeeded",
      receiptRequested: false,
      netAmountCents: 20000,
      receipt: null,
      notification: null,
      deliveryJob: null,
    }),
  ).toEqual({
    receiptStatus: "not_requested",
    notificationStatus: "pending",
  });
});

test("committed payment success wins over a lagging donation row but refund stays terminal", () => {
  expect(resolveCommittedPaymentStatus("pending", "succeeded")).toBe("succeeded");
  expect(resolveCommittedPaymentStatus("refunded", "succeeded")).toBe("refunded");
  expect(resolveCommittedPaymentStatus("pending", "pending")).toBe("pending");
});
