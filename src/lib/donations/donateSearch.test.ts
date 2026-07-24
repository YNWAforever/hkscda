import { describe, expect, test } from "bun:test";

import { donateSearchSchema, extractDonationAttribution } from "./donateSearch";
import type { DonationAttribution } from "./attribution";

describe("donate search attribution", () => {
  test("accepts a complete controlled attribution", () => {
    const attribution = {
      source: "contextual-cta",
      context: "animal",
      purpose: "medical",
      placement: "desktop-left",
      trigger: "timer",
    } satisfies DonationAttribution;
    const parsed = donateSearchSchema.parse(attribution);

    expect(extractDonationAttribution(parsed)).toEqual(attribution);
  });

  test("treats a partial attribution as a direct visit", () => {
    const parsed = donateSearchSchema.parse({ purpose: "medical" });

    expect(extractDonationAttribution(parsed)).toBeUndefined();
  });

  test("accepts only controlled donation purpose query values", () => {
    expect(donateSearchSchema.parse({ purpose: "medical" }).purpose).toBe("medical");
    expect(donateSearchSchema.parse({ purpose: "醫療" }).purpose).toBeUndefined();
    expect(donateSearchSchema.parse({ purpose: "campaign-free-text" }).purpose).toBeUndefined();
  });
});
