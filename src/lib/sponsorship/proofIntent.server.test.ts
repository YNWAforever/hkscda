import { describe, expect, test } from "bun:test";

import { createProofUploadIntent, verifyProofUploadIntent } from "./proofIntent.server";

const secret = "test-only-proof-intent-secret";
const pledgeId = "cccccccc-dddd-4eee-8fff-000000000000";
const path = pledgeId + "/proof/receipt.jpg";
const now = new Date("2026-09-26T00:00:00.000Z");

describe("sponsorship proof upload intent", () => {
  test("accepts only the issued pledge and path before expiry", () => {
    const token = createProofUploadIntent({ pledgeId, path }, { secret, now });
    expect(verifyProofUploadIntent(token, { pledgeId, path }, { secret, now })).toBe(true);
    expect(
      verifyProofUploadIntent(token, { pledgeId: crypto.randomUUID(), path }, { secret, now }),
    ).toBe(false);
    expect(
      verifyProofUploadIntent(
        token,
        { pledgeId, path: pledgeId + "/proof/other.jpg" },
        { secret, now },
      ),
    ).toBe(false);
    expect(
      verifyProofUploadIntent(
        token,
        { pledgeId, path },
        { secret, now: new Date(now.getTime() + 86_400_001) },
      ),
    ).toBe(false);
  });

  test("rejects altered and malformed tokens", () => {
    const token = createProofUploadIntent({ pledgeId, path }, { secret, now });
    expect(verifyProofUploadIntent(token + "x", { pledgeId, path }, { secret, now })).toBe(false);
    expect(verifyProofUploadIntent("invalid", { pledgeId, path }, { secret, now })).toBe(false);
  });
});
