import { isReceiptEligible } from "./domain";

type DonationForReconciliation = {
  id: string;
  amount_cents: number;
  receipt_requested: boolean;
  status: string;
};

type PaymentForReconciliation = {
  id: string;
  amount_cents: number;
  status: string;
};

type ReconciliationInput = {
  providerEventId: string;
  seenProviderEventIds: Set<string>;
  donation: DonationForReconciliation;
  payment: PaymentForReconciliation;
};

export type ReconciliationPlan =
  | { kind: "duplicate" }
  | {
      kind: "apply";
      donationStatus: "succeeded";
      paymentStatus: "succeeded";
      shouldIssueReceipt: boolean;
    };

export function buildReconciliationPlan(input: ReconciliationInput): ReconciliationPlan {
  if (input.seenProviderEventIds.has(input.providerEventId)) {
    return { kind: "duplicate" };
  }

  if (input.payment.status === "succeeded" || input.donation.status === "succeeded") {
    return { kind: "duplicate" };
  }

  if (input.payment.amount_cents !== input.donation.amount_cents) {
    throw new Error("Payment amount does not match donation amount");
  }

  return {
    kind: "apply",
    donationStatus: "succeeded",
    paymentStatus: "succeeded",
    shouldIssueReceipt: isReceiptEligible({
      amountCents: input.donation.amount_cents,
      receiptRequested: input.donation.receipt_requested,
    }),
  };
}
