import type { DonationMethod } from "../donations/contracts";
import type { CheckoutInstructionAdmission } from "./types";

export function hasPaymentInstructionDetails(details: Record<string, string>): boolean {
  return Boolean(details.payableTo?.trim() && details.identifier?.trim());
}

export function resolvePaymentInstructions(
  admission: CheckoutInstructionAdmission,
  expected: { method: DonationMethod; purpose: "donation" | "sponsorship" },
): { label: string; payableTo: string; identifier: string } | null {
  const snapshot = admission.snapshot;
  if (
    !admission.instructionsActive ||
    !snapshot ||
    snapshot.method !== expected.method ||
    snapshot.purpose !== expected.purpose
  )
    return null;
  if (!hasPaymentInstructionDetails(snapshot.details)) return null;
  const payableTo = snapshot.details.payableTo.trim();
  const identifier = snapshot.details.identifier.trim();
  return { label: snapshot.displayLabelZh, payableTo, identifier };
}
