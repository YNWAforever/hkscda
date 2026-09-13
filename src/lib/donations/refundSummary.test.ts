import { expect, test } from "bun:test";
import { summarizePayments } from "./adminPayments";
import { buildPaymentCsv } from "../crm/csv";
test("partial refund summary and export retain immutable gross and report net", () => {
  const payment = {
    amount_cents: 30000,
    refunded_cents: 10000,
    provider: "fps" as const,
    status: "succeeded" as const,
    donation: { id: "d", receipt_requested: false, status: "succeeded" as const },
  };
  expect(summarizePayments([payment], []).confirmedAmountCents).toBe(20000);
  const csv = buildPaymentCsv([
    {
      paymentId: "p",
      supporterName: "Synthetic",
      supporterEmail: "example@example.invalid",
      provider: "fps",
      amountCents: 30000,
      refundedCents: 10000,
      purpose: "sponsor",
      customPurpose: null,
      status: "succeeded",
      providerRef: null,
      bankReference: null,
      receivedAt: null,
      createdAt: "2026-09-13",
    },
  ]);
  expect(csv).toContain("300.00,100.00,200.00");
});
