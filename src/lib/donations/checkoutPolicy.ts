import type { DonationMethod, DonationPurpose } from "./contracts";

export type CheckoutPurpose = "donation" | "sponsorship";
export type CheckoutAuthorization = {
  configId: string;
  configVersion: number;
  policyVersion: number;
};
export type CheckoutPolicy = {
  enabled: boolean;
  version: number;
  methods: readonly {
    method: DonationMethod;
    purpose: CheckoutPurpose;
    enabled: boolean;
    configId: string;
    configVersion: number;
  }[];
};
export type CheckoutPolicyErrorCode =
  | "disabled"
  | "method_unavailable"
  | "stale_config"
  | "unavailable";

export class CheckoutPolicyError extends Error {
  constructor(public readonly code: CheckoutPolicyErrorCode) {
    super(`Checkout ${code}`);
    this.name = "CheckoutPolicyError";
  }
}

export function checkoutPurpose(purpose: DonationPurpose): CheckoutPurpose {
  return purpose === "sponsor" ? "sponsorship" : "donation";
}

export function authorizeNewCheckout(
  input: { method: DonationMethod; purpose: CheckoutPurpose; expectedConfigVersion: number },
  policy: CheckoutPolicy,
): CheckoutAuthorization {
  if (!policy.enabled) throw new CheckoutPolicyError("disabled");
  const entry = policy.methods.find(
    (candidate) => candidate.method === input.method && candidate.purpose === input.purpose,
  );
  if (!entry?.enabled) throw new CheckoutPolicyError("method_unavailable");
  if (entry.configVersion !== input.expectedConfigVersion) {
    throw new CheckoutPolicyError("stale_config");
  }
  return {
    configId: entry.configId,
    configVersion: entry.configVersion,
    policyVersion: policy.version,
  };
}
