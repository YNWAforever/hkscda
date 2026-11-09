import { isReceiptEligible } from "../../../lib/donations/domain";
import type { DonationHistoryRow, SupporterDetail } from "../../../lib/crm/types";

type ReceiptHistory = Pick<SupporterDetail, "receipts">;

/** The issued receipt that already covers this donation, if any. */
export function receiptForDonation(data: ReceiptHistory, donationId: string) {
  return data.receipts.find(
    (receipt) => receipt.status === "issued" && receipt.donationIds.includes(donationId),
  );
}

/**
 * Whether the supporter screen may offer "Issue receipt" for a donation (OPS-03).
 * The receipt API refuses a donation below HK$100 retained with a 422 (BUG-05), so the
 * button applies the same IRD rule — on the net amount, not the original gift — instead
 * of offering an action that always fails. The server check stays the guard.
 */
export function canIssueReceipt(data: ReceiptHistory, donation: DonationHistoryRow) {
  return (
    donation.status === "succeeded" &&
    !receiptForDonation(data, donation.id) &&
    isReceiptEligible({
      amountCents: donation.amountCents - (donation.refundedCents ?? 0),
      receiptRequested: donation.receiptRequested,
    })
  );
}
