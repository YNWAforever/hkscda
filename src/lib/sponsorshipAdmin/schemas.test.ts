import { describe, expect, test } from "bun:test";

import { MAX_PROOF_BYTES } from "../sponsorship/schemas";
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

  test("rejects page=0", () => {
    expect(() => pledgeListSearchSchema.parse({ page: 0 })).toThrow();
  });

  test("rejects page=-1", () => {
    expect(() => pledgeListSearchSchema.parse({ page: -1 })).toThrow();
  });

  test("accepts pageSize=100 at the upper bound", () => {
    const result = pledgeListSearchSchema.parse({ pageSize: 100 });
    expect(result.pageSize).toBe(100);
  });

  test("rejects pageSize=101 over the upper bound", () => {
    expect(() => pledgeListSearchSchema.parse({ pageSize: 101 })).toThrow();
  });

  test("rejects pageSize=0", () => {
    expect(() => pledgeListSearchSchema.parse({ pageSize: 0 })).toThrow();
  });

  test("rejects a non-numeric page string", () => {
    expect(() => pledgeListSearchSchema.parse({ page: "abc" })).toThrow();
  });

  test("rejects a non-numeric pageSize string", () => {
    expect(() => pledgeListSearchSchema.parse({ pageSize: "abc" })).toThrow();
  });

  test("rejects a non-integer page", () => {
    expect(() => pledgeListSearchSchema.parse({ page: 1.5 })).toThrow();
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

  test("accepts an explicit null file", () => {
    const result = recordPledgePaymentSchema.parse(base({ file: null }));
    expect(result.file).toBeNull();
  });

  test("accepts a file at the max byte size boundary", () => {
    const result = recordPledgePaymentSchema.parse(
      base({
        file: {
          storagePath: "pledge-1/proof.jpg",
          fileName: "proof.jpg",
          fileType: "image/jpeg",
          fileSize: MAX_PROOF_BYTES,
        },
      }),
    );
    expect(result.file?.fileSize).toBe(MAX_PROOF_BYTES);
  });

  test("rejects a file exceeding the max byte size", () => {
    expect(() =>
      recordPledgePaymentSchema.parse(
        base({
          file: {
            storagePath: "pledge-1/proof.jpg",
            fileName: "proof.jpg",
            fileType: "image/jpeg",
            fileSize: MAX_PROOF_BYTES + 1,
          },
        }),
      ),
    ).toThrow();
  });

  test("rejects a zero-byte file", () => {
    expect(() =>
      recordPledgePaymentSchema.parse(
        base({
          file: {
            storagePath: "pledge-1/proof.jpg",
            fileName: "proof.jpg",
            fileType: "image/jpeg",
            fileSize: 0,
          },
        }),
      ),
    ).toThrow();
  });

  test("accepts a file name at the max length boundary", () => {
    const fileName = `${"a".repeat(176)}.jpg`;
    expect(fileName).toHaveLength(180);
    const result = recordPledgePaymentSchema.parse(
      base({
        file: {
          storagePath: "pledge-1/proof.jpg",
          fileName,
          fileType: "image/jpeg",
          fileSize: 2048,
        },
      }),
    );
    expect(result.file?.fileName).toBe(fileName);
  });

  test("rejects a file name exceeding the max length", () => {
    const fileName = `${"a".repeat(177)}.jpg`;
    expect(fileName).toHaveLength(181);
    expect(() =>
      recordPledgePaymentSchema.parse(
        base({
          file: {
            storagePath: "pledge-1/proof.jpg",
            fileName,
            fileType: "image/jpeg",
            fileSize: 2048,
          },
        }),
      ),
    ).toThrow();
  });

  test("rejects an unsupported file type", () => {
    expect(() =>
      recordPledgePaymentSchema.parse(
        base({
          file: {
            storagePath: "pledge-1/proof.txt",
            fileName: "proof.txt",
            fileType: "text/plain",
            fileSize: 2048,
          },
        }),
      ),
    ).toThrow();
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
