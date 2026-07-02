import { describe, expect, test } from "bun:test";

import {
  SPONSORSHIP_TIER_AMOUNTS_CENTS,
  resolveTierAmountCents,
  sponsorshipPledgeSubmissionSchema,
  toPaymentProofInsert,
  toPledgeInsert,
  toPreferenceInserts,
  validateProofDescriptor,
} from "./schemas";

const animalA = "11111111-2222-4333-8444-555555555555";
const animalB = "22222222-3333-4333-8444-555555555555";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "zh-HK",
    monthlyTier: "300",
    animalPreferences: [{ rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" }],
    contact: { supporterName: "陳小姐", email: "chan@example.com", phone: "91234567" },
    consents: { email: true, whatsapp: false },
    terms: { agreed: true },
    ...overrides,
  };
}

describe("sponsorshipPledgeSubmissionSchema", () => {
  test("parses a valid preset-tier payload without proof", () => {
    const result = sponsorshipPledgeSubmissionSchema.parse(basePayload());
    expect(result.monthlyTier).toBe("300");
    expect(result.animalPreferences).toHaveLength(1);
  });

  test("requires a positive customAmountCents when monthlyTier is custom", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(basePayload({ monthlyTier: "custom" })),
    ).toThrow();

    const result = sponsorshipPledgeSubmissionSchema.parse(
      basePayload({ monthlyTier: "custom", customAmountCents: 20000 }),
    );
    expect(result.customAmountCents).toBe(20000);
  });

  test("rejects customAmountCents on a preset tier", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({ monthlyTier: "300", customAmountCents: 20000 }),
      ),
    ).toThrow();
  });

  test("rejects duplicate ranks and duplicate animal ids", () => {
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({
          animalPreferences: [
            { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
            { rank: 1, animalId: animalB, animalName: "小黑", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(
        basePayload({
          animalPreferences: [
            { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
            { rank: 2, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();
  });

  test("rejects more than 10 animal preferences", () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => ({
      rank: index + 1,
      animalId: `33333333-0000-4000-8000-${String(index).padStart(12, "0")}`,
      animalName: `Sponsor ${index}`,
      animalType: "sponsor",
    }));
    expect(() =>
      sponsorshipPledgeSubmissionSchema.parse(basePayload({ animalPreferences: tooMany })),
    ).toThrow();
  });

  test("sorts animal preferences by rank", () => {
    const result = sponsorshipPledgeSubmissionSchema.parse(
      basePayload({
        animalPreferences: [
          { rank: 2, animalId: animalB, animalName: "小黑", animalType: "sponsor" },
          { rank: 1, animalId: animalA, animalName: "白雪", animalType: "sponsor" },
        ],
      }),
    );
    expect(result.animalPreferences.map((a) => a.animalId)).toEqual([animalA, animalB]);
  });
});

describe("resolveTierAmountCents", () => {
  test("resolves preset tier amounts", () => {
    expect(resolveTierAmountCents({ monthlyTier: "100", customAmountCents: undefined })).toBe(
      SPONSORSHIP_TIER_AMOUNTS_CENTS["100"],
    );
    expect(resolveTierAmountCents({ monthlyTier: "500", customAmountCents: undefined })).toBe(
      SPONSORSHIP_TIER_AMOUNTS_CENTS["500"],
    );
  });

  test("resolves the custom amount when tier is custom", () => {
    expect(resolveTierAmountCents({ monthlyTier: "custom", customAmountCents: 45000 })).toBe(45000);
  });
});

describe("validateProofDescriptor", () => {
  test("accepts a valid jpeg descriptor", () => {
    const descriptor = validateProofDescriptor({
      fileName: "proof.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(descriptor.mimeType).toBe("image/jpeg");
  });

  test("rejects an oversized file", () => {
    expect(() =>
      validateProofDescriptor({
        fileName: "proof.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 9 * 1024 * 1024,
      }),
    ).toThrow();
  });

  test("rejects a disallowed mime type", () => {
    expect(() =>
      validateProofDescriptor({
        fileName: "proof.gif",
        mimeType: "image/gif",
        sizeBytes: 1024,
      }),
    ).toThrow();
  });
});

describe("insert mappers", () => {
  const parsed = sponsorshipPledgeSubmissionSchema.parse(basePayload());

  test("toPledgeInsert maps camelCase to snake_case with the resolved amount", () => {
    expect(toPledgeInsert("supporter-1", "pending_payment", parsed)).toEqual({
      supporter_id: "supporter-1",
      monthly_tier: "300",
      amount_cents: 30000,
      currency: "HKD",
      language: "zh-HK",
      notes: null,
      status: "pending_payment",
    });
  });

  test("toPreferenceInserts maps ranked animals", () => {
    expect(toPreferenceInserts("pledge-1", parsed)).toEqual([
      {
        pledge_id: "pledge-1",
        sponsor_animal_id: animalA,
        rank: 1,
        animal_name_snapshot: "白雪",
        animal_type_snapshot: "sponsor",
      },
    ]);
  });

  test("toPaymentProofInsert maps descriptor and metadata", () => {
    const descriptor = validateProofDescriptor({
      fileName: "proof.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
    });
    const metadata = {
      paymentMethod: "fps" as const,
      reference: "REF123",
      amountCents: 30000,
      paymentDate: "2026-07-01",
    };
    expect(toPaymentProofInsert("pledge-1", "pledge-1/proof.jpg", descriptor, metadata)).toEqual({
      pledge_id: "pledge-1",
      storage_path: "pledge-1/proof.jpg",
      file_name: "proof.jpg",
      file_type: "image/jpeg",
      file_size: 2048,
      payment_method: "fps",
      reference: "REF123",
      amount_cents: 30000,
      payment_date: "2026-07-01",
      review_status: "pending",
    });
  });
});
