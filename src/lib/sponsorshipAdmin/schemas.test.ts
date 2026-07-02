import { describe, expect, test } from "bun:test";

import {
  cancelPledgeSchema,
  pledgeListSearchSchema,
  recordPledgePaymentSchema,
  reviewPledgeProofSchema,
} from "./schemas";

describe("pledgeListSearchSchema", () => {
  test("defaults page and pageSize", () => {
    const result = pledgeListSearchSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.status).toBeUndefined();
    expect(result.q).toBeUndefined();
  });

  test("coerces string page/pageSize from query params", () => {
    const result = pledgeListSearchSchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  test("accepts a valid status filter", () => {
    const result = pledgeListSearchSchema.parse({ status: "provisional" });
    expect(result.status).toBe("provisional");
  });

  test("rejects an invalid status filter", () => {
    expect(() => pledgeListSearchSchema.parse({ status: "bogus" })).toThrow();
  });
});

describe("recordPledgePaymentSchema", () => {
  function base(overrides: Record<string, unknown> = {}) {
    return {
      paymentMethod: "fps",
      reference: "REF1",
      amountCents: 30000,
      paymentDate: "2026-07-01",
      note: "Recorded from bank statement",
      ...overrides,
    };
  }

  test("accepts a valid payload without a file", () => {
    const result = recordPledgePaymentSchema.parse(base());
    expect(result.amountCents).toBe(30000);
    expect(result.file).toBeUndefined();
  });

  test("accepts a valid payload with file metadata", () => {
    const result = recordPledgePaymentSchema.parse(
      base({
        file: {
          storagePath: "pledge-1/proof.jpg",
          fileName: "proof.jpg",
          fileType: "image/jpeg",
          fileSize: 2048,
        },
      }),
    );
    expect(result.file?.fileName).toBe("proof.jpg");
  });

  test("rejects a non-positive amount", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ amountCents: 0 }))).toThrow();
  });

  test("rejects an invalid payment method", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ paymentMethod: "cash" }))).toThrow();
  });

  test("rejects a malformed payment date", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ paymentDate: "07/01/2026" }))).toThrow();
  });
});

describe("reviewPledgeProofSchema", () => {
  test("accepts approve with no note", () => {
    const result = reviewPledgeProofSchema.parse({ decision: "approve" });
    expect(result.decision).toBe("approve");
    expect(result.note).toBeNull();
  });

  test("accepts reject with a note", () => {
    const result = reviewPledgeProofSchema.parse({ decision: "reject", note: "Blurry receipt" });
    expect(result.note).toBe("Blurry receipt");
  });

  test("rejects an invalid decision", () => {
    expect(() => reviewPledgeProofSchema.parse({ decision: "maybe" })).toThrow();
  });
});

describe("cancelPledgeSchema", () => {
  test("accepts an empty payload", () => {
    const result = cancelPledgeSchema.parse({});
    expect(result.note).toBeNull();
  });

  test("accepts a note", () => {
    const result = cancelPledgeSchema.parse({ note: "Sponsor requested cancellation" });
    expect(result.note).toBe("Sponsor requested cancellation");
  });
});
