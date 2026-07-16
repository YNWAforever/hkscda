import { describe, expect, test } from "bun:test";

import { donateSearchSchema, extractDonationAttribution } from "./donateSearch";

describe("donate search attribution", () => {
  test("accepts a complete controlled attribution", () => {
    const parsed = donateSearchSchema.parse({
      source: "contextual-cta",
      context: "animal",
      purpose: "medical",
      placement: "desktop-left",
      trigger: "timer",
    });

    expect(extractDonationAttribution(parsed)).toEqual(parsed);
  });

  test("treats a partial attribution as a direct visit", () => {
    const parsed = donateSearchSchema.parse({ purpose: "medical" });

    expect(extractDonationAttribution(parsed)).toBeUndefined();
  });

  test("rejects unsupported purposes", () => {
    expect(() => donateSearchSchema.parse({ purpose: "campaign-free-text" })).toThrow();
  });
});
