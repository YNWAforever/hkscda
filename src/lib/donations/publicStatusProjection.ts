import type { PublicDonationStatus } from "./publicStatus";
import type { DonationEffectStatuses } from "./publicStatus.server";

type EffectInput = {
  paymentStatus: PublicDonationStatus;
  receiptRequested: boolean;
  netAmountCents: number;
  receipt: { status: "issued" | "void"; pdf_url: string | null } | null;
  notification: "queued" | "sent" | "delivered" | "failed" | null;
  deliveryJob: "pending" | "processing" | "retryable" | "attention_required" | "complete" | null;
};

export function projectDonationEffectStatuses(input: EffectInput): DonationEffectStatuses {
  const receiptStatus =
    input.receipt?.status === "void"
      ? "void"
      : input.receipt?.status === "issued" && input.receipt.pdf_url
        ? "issued"
        : !input.receiptRequested ||
            input.netAmountCents < 10000 ||
            input.paymentStatus === "failed"
          ? "not_requested"
          : input.deliveryJob === "retryable" || input.deliveryJob === "attention_required"
            ? "failed"
            : "pending";
  const notificationStatus =
    input.notification === "delivered"
      ? "delivered"
      : input.notification === "sent"
        ? "provider_accepted"
        : input.notification === "failed"
          ? "failed"
          : input.paymentStatus === "failed"
            ? "not_required"
            : "pending";
  return { receiptStatus, notificationStatus };
}

export function resolveCommittedPaymentStatus(
  donationStatus: PublicDonationStatus,
  paymentStatus: PublicDonationStatus | null,
): PublicDonationStatus {
  if (donationStatus === "refunded" || donationStatus === "failed") return donationStatus;
  if (paymentStatus === "refunded") return "refunded";
  if (paymentStatus === "succeeded" || donationStatus === "succeeded") return "succeeded";
  return paymentStatus ?? donationStatus;
}
