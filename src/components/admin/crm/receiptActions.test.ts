import { describe, expect, test } from "bun:test";

import type { DonationHistoryRow, SupporterDetail } from "../../../lib/crm/types";

import { canIssueReceipt } from "./receiptActions";

type ReceiptHistory = Pick<SupporterDetail, "receipts">;

const noReceipts: ReceiptHistory = { receipts: [] };

function donation(overrides: Partial<DonationHistoryRow> = {}): DonationHistoryRow {
  return {
    id: "donation-1",
    amountCents: 15000,
    currency: "HKD",
    purpose: "general",
    customPurpose: null,
    status: "succeeded",
    method: "fps",
    receiptRequested: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("canIssueReceipt (OPS-03)", () => {
  test("offers the action at HK$100 net and not at HK$99 net", () => {
    expect(canIssueReceipt(noReceipts, donation({ amountCents: 9999 }))).toBe(false);
    expect(canIssueReceipt(noReceipts, donation({ amountCents: 10000 }))).toBe(true);
  });

  test("applies the threshold to the net amount, after refunds", () => {
    // HK$150 gift refunded HK$51 leaves HK$99: the API refuses it (422).
    expect(canIssueReceipt(noReceipts, donation({ amountCents: 15000, refundedCents: 5100 }))).toBe(
      false,
    );
    // Exactly HK$100 net is eligible, as the API's rule is ">= HK$100 retained".
    expect(canIssueReceipt(noReceipts, donation({ amountCents: 15000, refundedCents: 5000 }))).toBe(
      true,
    );
    // A full refund is never eligible.
    expect(
      canIssueReceipt(noReceipts, donation({ amountCents: 10000, refundedCents: 10000 })),
    ).toBe(false);
  });

  test("requires a requested receipt on a succeeded donation", () => {
    expect(canIssueReceipt(noReceipts, donation({ receiptRequested: false }))).toBe(false);
    expect(canIssueReceipt(noReceipts, donation({ status: "pending" }))).toBe(false);
    expect(canIssueReceipt(noReceipts, donation({ status: "refunded" }))).toBe(false);
  });

  test("hides the action once an issued receipt covers the donation", () => {
    const withIssued: ReceiptHistory = {
      receipts: [
        {
          id: "receipt-1",
          receiptNo: "HKSCDA-2026-000001",
          donationIds: ["donation-1"],
          totalAmountCents: 10000,
          issuedAt: "2026-11-02T00:00:00.000Z",
          status: "issued",
          pdfUrl: null,
        },
      ],
    };
    expect(canIssueReceipt(withIssued, donation())).toBe(false);

    // A voided receipt no longer covers the donation, so the receipt can be reissued.
    const withVoid: ReceiptHistory = {
      receipts: [{ ...withIssued.receipts[0]!, status: "void" }],
    };
    expect(canIssueReceipt(withVoid, donation())).toBe(true);
  });
});
