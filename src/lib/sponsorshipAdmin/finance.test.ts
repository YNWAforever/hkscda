import { expect, test } from "bun:test";
import { financeCommandSchema } from "./finance.server";
const id = "33333333-3333-4333-8333-333333333333";
test("finance commands reject forged actor and missing factual refund reference", () => {
  expect(
    financeCommandSchema.safeParse({
      action: "refund",
      proofId: id,
      expectedRevision: 2,
      reference: "BANK-1",
      reason: "Supporter requested",
      actor: id,
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "refund",
      proofId: id,
      expectedRevision: 2,
      reference: "",
      reason: "Supporter requested",
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({ action: "receipt_requested", proofId: id, requested: false })
      .success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "allocate",
      proofId: id,
      periodMonth: "2026-07-02",
      amountCents: 100,
    }).success,
  ).toBe(false);
  expect(
    financeCommandSchema.safeParse({
      action: "reconcile",
      proofId: id,
      paymentId: id,
      reason: "Verified original bank payment",
    }).success,
  ).toBe(true);
});
