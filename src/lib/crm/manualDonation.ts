import { createManualPaymentReference } from "../donations/domain";
import type { ManualDonationInput } from "./schemas";

export function buildManualDonationRecords(input: {
  supporterId: string;
  donationIdSeed: string;
  input: ManualDonationInput;
  actorUserId: string;
  now?: () => Date;
}) {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const providerRef = createManualPaymentReference(input.donationIdSeed);

  return {
    donationSeedId: input.donationIdSeed,
    donation: {
      id: input.donationIdSeed,
      supporter_id: input.supporterId,
      amount_cents: input.input.amountCents,
      currency: input.input.currency,
      purpose: input.input.purpose,
      type: "one_time" as const,
      status:
        input.input.paymentStatus === "succeeded" ? ("succeeded" as const) : ("pending" as const),
      method: input.input.method,
      receipt_requested: input.input.receiptRequested,
      created_at: now,
    },
    payment: {
      donation_id: input.donationIdSeed,
      provider: input.input.method,
      provider_ref: providerRef,
      amount_cents: input.input.amountCents,
      status: input.input.paymentStatus,
      received_at: input.input.paymentStatus === "succeeded" ? now : null,
      reconciled_by: input.input.paymentStatus === "succeeded" ? input.actorUserId : null,
      bank_reference: input.input.bankReference ?? null,
      created_at: now,
    },
    audit: {
      actor_user_id: input.actorUserId,
      action: "donation.manual_create",
      entity: "donation",
      entity_id: input.donationIdSeed,
      timestamp: now,
      detail: {
        method: input.input.method,
        paymentStatus: input.input.paymentStatus,
        bankReference: input.input.bankReference ?? null,
      },
    },
  };
}
