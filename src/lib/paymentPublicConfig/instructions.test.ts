import { describe, expect, test } from "bun:test";
import { resolvePaymentInstructions } from "./instructions";
import type { CheckoutInstructionAdmission } from "./types";

const approved: CheckoutInstructionAdmission = {
  instructionsActive: true,
  snapshot: {
    configId: "config-1",
    configVersion: 2,
    purpose: "donation",
    method: "fps",
    displayLabelZh: "轉數快",
    displayLabelEn: "FPS",
    details: { payableTo: "Synthetic payee", identifier: "FPS TEST-1" },
    capturedAt: "2026-09-27T00:00:00Z",
  },
};

describe("resolvePaymentInstructions", () => {
  test("returns only the matching approved snapshot", () => {
    expect(resolvePaymentInstructions(approved, { method: "fps", purpose: "donation" })).toEqual({
      label: "轉數快",
      payableTo: "Synthetic payee",
      identifier: "FPS TEST-1",
    });
  });
  test("fails closed on revocation, purpose mismatch or missing details", () => {
    expect(
      resolvePaymentInstructions(
        { ...approved, instructionsActive: false },
        { method: "fps", purpose: "donation" },
      ),
    ).toBeNull();
    expect(
      resolvePaymentInstructions(approved, { method: "fps", purpose: "sponsorship" }),
    ).toBeNull();
    expect(
      resolvePaymentInstructions(
        { ...approved, snapshot: { ...approved.snapshot!, details: {} } },
        { method: "fps", purpose: "donation" },
      ),
    ).toBeNull();
  });
});
