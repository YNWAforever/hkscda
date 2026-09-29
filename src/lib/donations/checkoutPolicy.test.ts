import { describe, expect, test } from "bun:test";
import { authorizeNewCheckout, CheckoutPolicyError } from "./checkoutPolicy";
import type { CheckoutPolicy } from "./checkoutPolicy";

const policy: CheckoutPolicy = {
  enabled: true,
  version: 4,
  methods: [
    {
      method: "stripe",
      purpose: "donation",
      enabled: true,
      configId: "config-1",
      configVersion: 3,
    },
  ],
};

describe("authorizeNewCheckout", () => {
  test("returns the approved version", () => {
    expect(
      authorizeNewCheckout(
        { method: "stripe", purpose: "donation", expectedConfigVersion: 3 },
        policy,
      ),
    ).toEqual({ configId: "config-1", configVersion: 3, policyVersion: 4 });
  });
  test("global disable fails closed", () => {
    expect(() =>
      authorizeNewCheckout(
        { method: "stripe", purpose: "donation", expectedConfigVersion: 3 },
        { ...policy, enabled: false },
      ),
    ).toThrow(new CheckoutPolicyError("disabled"));
  });
  test("method and purpose approval are both required", () => {
    for (const purpose of ["sponsorship"] as const) {
      expect(() =>
        authorizeNewCheckout({ method: "stripe", purpose, expectedConfigVersion: 3 }, policy),
      ).toThrow(new CheckoutPolicyError("method_unavailable"));
    }
    expect(() =>
      authorizeNewCheckout(
        { method: "stripe", purpose: "donation", expectedConfigVersion: 3 },
        { ...policy, methods: [{ ...policy.methods[0], enabled: false }] },
      ),
    ).toThrow(new CheckoutPolicyError("method_unavailable"));
  });
  test("stale approval rejects a changed config", () => {
    expect(() =>
      authorizeNewCheckout(
        { method: "stripe", purpose: "donation", expectedConfigVersion: 2 },
        policy,
      ),
    ).toThrow(new CheckoutPolicyError("stale_config"));
  });
});
