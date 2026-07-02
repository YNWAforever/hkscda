import { describe, expect, test } from "bun:test";

import { buildPublicPledgeStatusSummary, pledgeReference } from "./statusSummary";

describe("pledgeReference", () => {
  test("derives an 8-char uppercase reference from the pledge id", () => {
    expect(pledgeReference("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe("SP-AAAAAAAA");
  });

  test("pads short ids so the reference is always 8 characters", () => {
    expect(pledgeReference("pledge-1")).toMatch(/^SP-[A-Z0-9]{8}$/);
  });
});

describe("buildPublicPledgeStatusSummary", () => {
  const basePledge = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    created_at: "2026-07-01T00:00:00.000Z",
    monthly_tier: "300" as const,
    amount_cents: 30000,
    status: "pending_payment" as const,
  };

  test("maps a pledge with ranked animals sorted and no proof", () => {
    const summary = buildPublicPledgeStatusSummary({
      pledge: basePledge,
      preferences: [
        { rank: 2, animal_name_snapshot: "妹妹" },
        { rank: 1, animal_name_snapshot: "白雪" },
      ],
      hasPaymentProof: false,
      token: { expires_at: "2026-08-01T00:00:00.000Z" },
    });

    expect(summary).toEqual({
      reference: "SP-AAAAAAAA",
      submittedAt: "2026-07-01T00:00:00.000Z",
      monthlyTier: "300",
      amountCents: 30000,
      status: "pending_payment",
      rankedAnimals: [
        { rank: 1, name: "白雪" },
        { rank: 2, name: "妹妹" },
      ],
      hasPaymentProof: false,
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
  });

  test("reflects hasPaymentProof and every pledge status", () => {
    const statuses = [
      "pending_payment",
      "provisional",
      "active",
      "needs_followup",
      "cancelled",
    ] as const;
    for (const status of statuses) {
      const summary = buildPublicPledgeStatusSummary({
        pledge: { ...basePledge, status },
        preferences: [],
        hasPaymentProof: true,
        token: { expires_at: "2026-08-01T00:00:00.000Z" },
      });
      expect(summary.status).toBe(status);
      expect(summary.hasPaymentProof).toBe(true);
      expect(summary.rankedAnimals).toEqual([]);
    }
  });
});
