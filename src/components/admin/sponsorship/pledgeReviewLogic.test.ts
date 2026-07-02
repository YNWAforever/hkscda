import { describe, expect, test } from "bun:test";

import {
  buildPledgeListSearchParams,
  canCancelPledge,
  canRecordPayment,
  canReviewProof,
  formatFallback,
  formatDate,
  isImageFileType,
  pledgeStatusTone,
  proofHasNoFile,
  validateManualProofFile,
} from "./pledgeReviewLogic";
import { MAX_PROOF_BYTES } from "../../../lib/sponsorship/schemas";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

describe("buildPledgeListSearchParams", () => {
  test("omits empty filters and applies page/pageSize defaults", () => {
    const params = buildPledgeListSearchParams({
      q: "",
      status: "",
      page: undefined,
      pageSize: undefined,
    });
    expect(params.has("q")).toBe(false);
    expect(params.has("status")).toBe(false);
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });

  test("includes a trimmed search query and status filter", () => {
    const params = buildPledgeListSearchParams({
      q: "  陳小姐  ",
      status: "provisional",
      page: 2,
      pageSize: 10,
    });
    expect(params.get("q")).toBe("陳小姐");
    expect(params.get("status")).toBe("provisional");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
  });

  test("falls back to page 1 / pageSize 25 for invalid numbers", () => {
    const params = buildPledgeListSearchParams({ page: 0, pageSize: -5 });
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });
});

describe("formatFallback", () => {
  test("returns a dash for empty or nullish values", () => {
    expect(formatFallback(null)).toBe("-");
    expect(formatFallback(undefined)).toBe("-");
    expect(formatFallback("   ")).toBe("-");
  });

  test("returns the trimmed value otherwise", () => {
    expect(formatFallback("  陳小姐  ")).toBe("陳小姐");
  });
});

describe("formatDate", () => {
  test("returns a dash for empty values", () => {
    expect(formatDate(null)).toBe("-");
  });

  test("truncates an ISO timestamp to the date portion", () => {
    expect(formatDate("2026-07-01T00:00:00.000Z")).toBe("2026-07-01");
  });
});

describe("pledgeStatusTone", () => {
  test("maps each status to its expected StatusPill tone", () => {
    expect(pledgeStatusTone("pending_payment")).toBe("warning");
    expect(pledgeStatusTone("provisional")).toBe("info");
    expect(pledgeStatusTone("active")).toBe("success");
    expect(pledgeStatusTone("needs_followup")).toBe("danger");
    expect(pledgeStatusTone("cancelled")).toBe("neutral");
  });
});

const ALL_STATUSES: PledgeStatus[] = [
  "pending_payment",
  "provisional",
  "active",
  "needs_followup",
  "cancelled",
];

describe("canRecordPayment", () => {
  test("is true only for pending_payment and needs_followup", () => {
    const allowed = ALL_STATUSES.filter(canRecordPayment);
    expect(allowed).toEqual(["pending_payment", "needs_followup"]);
  });
});

describe("canReviewProof", () => {
  test("is true only for provisional", () => {
    const allowed = ALL_STATUSES.filter(canReviewProof);
    expect(allowed).toEqual(["provisional"]);
  });
});

describe("canCancelPledge", () => {
  test("is true for any status except cancelled", () => {
    const allowed = ALL_STATUSES.filter(canCancelPledge);
    expect(allowed).toEqual(["pending_payment", "provisional", "active", "needs_followup"]);
  });

  test("is false for cancelled", () => {
    expect(canCancelPledge("cancelled")).toBe(false);
  });
});

describe("isImageFileType", () => {
  test("is true for image MIME types", () => {
    expect(isImageFileType("image/png")).toBe(true);
    expect(isImageFileType("image/jpeg")).toBe(true);
    expect(isImageFileType("image/webp")).toBe(true);
  });

  test("is false for application/pdf", () => {
    expect(isImageFileType("application/pdf")).toBe(false);
  });

  test("is false for nullish or empty values", () => {
    expect(isImageFileType(null)).toBe(false);
    expect(isImageFileType(undefined)).toBe(false);
    expect(isImageFileType("")).toBe(false);
  });
});

function fakeFile(overrides: Partial<{ type: string; size: number }> = {}): File {
  const type = overrides.type ?? "image/png";
  const size = overrides.size ?? 1024;
  return new File([new Uint8Array(size)], "proof.png", { type });
}

describe("validateManualProofFile", () => {
  test("accepts each supported MIME type within the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(validateManualProofFile(fakeFile({ type }))).toBeNull();
    }
  });

  test("rejects an unsupported MIME type", () => {
    expect(validateManualProofFile(fakeFile({ type: "text/plain" }))).not.toBeNull();
  });

  test("rejects a file over MAX_PROOF_BYTES", () => {
    expect(validateManualProofFile(fakeFile({ size: MAX_PROOF_BYTES + 1 }))).not.toBeNull();
  });

  test("accepts a file exactly at MAX_PROOF_BYTES", () => {
    expect(validateManualProofFile(fakeFile({ size: MAX_PROOF_BYTES }))).toBeNull();
  });

  test("rejects an empty (zero-byte) file", () => {
    expect(validateManualProofFile(fakeFile({ size: 0 }))).not.toBeNull();
  });
});

describe("proofHasNoFile", () => {
  test("is true when storagePath is null or undefined", () => {
    expect(proofHasNoFile(null)).toBe(true);
    expect(proofHasNoFile(undefined)).toBe(true);
  });

  test("is false when storagePath is a non-empty string", () => {
    expect(proofHasNoFile("pledge-1/staff-123-proof.png")).toBe(false);
  });
});
