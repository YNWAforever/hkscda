import { describe, expect, test } from "bun:test";

import { buildManualDonationRecords } from "./manualDonation";

describe("manual donation records", () => {
  test("builds succeeded manual payment records from a seeded donation id", () => {
    const records = buildManualDonationRecords({
      supporterId: "s1",
      donationIdSeed: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      input: {
        supporterId: "s1",
        amountCents: 12000,
        currency: "HKD",
        purpose: "medical",
        method: "manual",
        paymentStatus: "succeeded",
        bankReference: "CASH-2026-001",
        receiptRequested: true,
      },
      actorUserId: "admin-1",
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    expect(records.donationSeedId).toBe("f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a");
    expect(records.donation).toMatchObject({
      id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      supporter_id: "s1",
      amount_cents: 12000,
      status: "succeeded",
      method: "manual",
    });
    expect(records.payment).toMatchObject({
      donation_id: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      provider_ref: "HKSCDA-F8DCE8FA",
      amount_cents: 12000,
      status: "succeeded",
      bank_reference: "CASH-2026-001",
      reconciled_by: "admin-1",
    });
  });

  test("builds pending manual payment records without reconciliation fields", () => {
    const records = buildManualDonationRecords({
      supporterId: "s1",
      donationIdSeed: "11111111-2222-4333-8444-555555555555",
      input: {
        supporterId: "s1",
        amountCents: 15000,
        currency: "HKD",
        purpose: "general",
        method: "fps",
        paymentStatus: "pending",
        receiptRequested: false,
      },
      actorUserId: "admin-1",
      now: () => new Date("2026-06-24T09:00:00.000Z"),
    });

    expect(records.donation.status).toBe("pending");
    expect(records.payment).toMatchObject({
      status: "pending",
      received_at: null,
      reconciled_by: null,
      bank_reference: null,
    });
  });
});
