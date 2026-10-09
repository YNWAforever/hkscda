import { describe, expect, test } from "bun:test";

import {
  actionFailure,
  buildPledgeListSearchParams,
  canCancelPledge,
  canRecordPayment,
  canReviewProof,
  formatFallback,
  formatDate,
  isImageFileType,
  pledgeStatusTone,
  proofHasNoFile,
  selectionFailure,
  validateManualProofFile,
} from "./pledgeReviewLogic";
import { MAX_PROOF_BYTES } from "../../../lib/sponsorship/schemas";
import { PledgeSelectionError } from "../../../lib/sponsorshipAdmin/followupBulkSelection";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

describe("actionFailure", () => {
  test("keeps only the code of the zh-HK message the sponsorship API sends", () => {
    const cause = new Error("付款證明或審批資料已更新，請重新載入。");
    expect(actionFailure(cause, "review")).toEqual({ code: "proofReviewChanged" });
  });

  test("keeps any other caught error under the action's own code, to show as it came", () => {
    const cause = new Error("Sponsorship pledge is already cancelled");
    expect(actionFailure(cause, "cancel")).toEqual({ code: "cancel", cause });
    // Adding an animal and ending a sponsorship have their own codes, not the review one.
    expect(actionFailure(cause, "assignAnimal")).toEqual({ code: "assignAnimal", cause });
    expect(actionFailure(cause, "endAssignment")).toEqual({ code: "endAssignment", cause });
    expect(actionFailure("not an error", "recordPayment")).toEqual({
      code: "recordPayment",
      cause: "not an error",
    });
  });
});

describe("selectionFailure", () => {
  test("keeps only the code of a selection the helpers refused", () => {
    expect(selectionFailure(new PledgeSelectionError("too_many"), "select_failed")).toEqual({
      code: "too_many",
    });
    expect(selectionFailure(new PledgeSelectionError("list_changed"), "pin_failed")).toEqual({
      code: "list_changed",
    });
  });

  test("keeps any other caught error under the fallback code, to show as it came", () => {
    const cause = new Error("Request failed");
    expect(selectionFailure(cause, "pin_failed")).toEqual({ code: "pin_failed", cause });
    expect(selectionFailure("not an error", "select_failed")).toEqual({
      code: "select_failed",
      cause: "not an error",
    });
  });
});

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

  test("serializes the pending-proof queue for direct task-card navigation", () => {
    const params = buildPledgeListSearchParams({ proof: "pending", page: 2, pageSize: 25 });
    expect(params.get("proof")).toBe("pending");
    expect(params.get("page")).toBe("2");
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
  test("is true for pending_payment, provisional-free running pledges, and needs_followup", () => {
    // `active` is included because a sponsorship is monthly: month two is
    // recorded against a pledge that is already running. `provisional` is
    // excluded so the queued proof gets decided first, and `cancelled` because
    // an ended sponsorship takes no further payments.
    const allowed = ALL_STATUSES.filter(canRecordPayment);
    expect(allowed).toEqual(["pending_payment", "active", "needs_followup"]);
  });
});

describe("canReviewProof", () => {
  test("is false when no proof is awaiting review", () => {
    // Between months every proof is decided, so there is nothing to approve or
    // reject and the form must stay hidden.
    expect(canReviewProof([])).toBe(false);
    expect(
      canReviewProof([
        { id: "p1", createdAt: "2026-07-01T00:00:00.000Z", reviewStatus: "approved" },
        { id: "p2", createdAt: "2026-08-01T00:00:00.000Z", reviewStatus: "rejected" },
      ]),
    ).toBe(false);
  });

  test("is true when a proof is queued, whatever the pledge's status", () => {
    // The rule it replaces asked the pledge's status and required
    // 'provisional'. Approving month one leaves the pledge 'active' for good,
    // so that test hid the review form for every later month — the control
    // that clears the queue was unreachable exactly when it was needed.
    expect(
      canReviewProof([
        { id: "p1", createdAt: "2026-07-01T00:00:00.000Z", reviewStatus: "approved" },
        { id: "p2", createdAt: "2026-08-01T00:00:00.000Z", reviewStatus: "pending" },
      ]),
    ).toBe(true);
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

  // The form writes the message for the admin's language from the code, so the code is what is
  // pinned here; the wording of each code is in the drawer copy.
  test("rejects an unsupported MIME type", () => {
    expect(validateManualProofFile(fakeFile({ type: "text/plain" }))).toBe("unsupported_type");
  });

  test("rejects a file over MAX_PROOF_BYTES", () => {
    expect(validateManualProofFile(fakeFile({ size: MAX_PROOF_BYTES + 1 }))).toBe("too_large");
  });

  test("accepts a file exactly at MAX_PROOF_BYTES", () => {
    expect(validateManualProofFile(fakeFile({ size: MAX_PROOF_BYTES }))).toBeNull();
  });

  test("rejects an empty (zero-byte) file", () => {
    expect(validateManualProofFile(fakeFile({ size: 0 }))).toBe("too_large");
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
