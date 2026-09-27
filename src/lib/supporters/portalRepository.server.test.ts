import { expect, test } from "bun:test";
import { projectPortalRows } from "./portalRepository.server";

test("portal projection excludes mismatched contact snapshots and mixed receipts", () => {
  const result = projectPortalRows("owner@example.invalid", {
    adoption: [
      {
        id: "a1",
        applicant_email: "owner@example.invalid",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: "a2",
        applicant_email: "other@example.invalid",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ],
    sponsorship: [
      {
        id: "p1",
        status: "active",
        created_at: "2026-01-01",
        amount_cents: 10000,
        contact_submission: { email: "owner@example.invalid" },
      },
      {
        id: "p2",
        status: "active",
        created_at: "2026-01-01",
        amount_cents: 10000,
        contact_submission: { email: "other@example.invalid" },
      },
      {
        id: "p3",
        status: "active",
        created_at: "2026-01-01",
        amount_cents: 10000,
        contact_submission: null,
      },
    ],
    donations: [
      {
        id: "d1",
        contact_email: "owner@example.invalid",
        status: "succeeded",
        created_at: "2026-01-01",
        amount_cents: 10000,
      },
      {
        id: "d2",
        contact_email: "other@example.invalid",
        status: "succeeded",
        created_at: "2026-01-01",
        amount_cents: 10000,
      },
    ],
    receipts: [
      {
        id: "r1",
        receipt_no: "R1",
        issued_at: "2026-01-02",
        total_amount_cents: 10000,
        status: "issued",
        pdf_url: "2026/r1.pdf",
        donation_ids: ["d1"],
      },
      {
        id: "r2",
        receipt_no: "R2",
        issued_at: "2026-01-02",
        total_amount_cents: 20000,
        status: "issued",
        pdf_url: "2026/r2.pdf",
        donation_ids: ["d1", "d2"],
      },
    ],
    marketingEmail: "opt_out",
  });
  expect(result.adoption.map((row) => row.id)).toEqual(["a1"]);
  expect(result.sponsorship.map((row) => row.id)).toEqual(["p1"]);
  expect(result.donations.map((row) => row.id)).toEqual(["d1"]);
  expect(result.receipts.map((row) => row.id)).toEqual(["r1"]);
  expect(result.marketingEmail).toBe("opt_out");
});
