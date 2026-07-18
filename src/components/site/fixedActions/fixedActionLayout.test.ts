import { describe, expect, test } from "bun:test";

import { calculateFixedActionLayout } from "./fixedActionLayout";

describe("fixed public action layout", () => {
  test("stacks shortlist, prompt, and help with 12px gaps", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 96, donationHeight: 64 })).toEqual({
      donationBottom: 120,
      helpBottom: 196,
      contentBottom: 188,
    });
  });

  test("keeps a 12px gap above a standalone shortlist", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 96, donationHeight: 0 })).toEqual({
      donationBottom: 120,
      helpBottom: 120,
      contentBottom: 112,
    });
  });

  test("keeps a 12px gap above a standalone donation prompt", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 0, donationHeight: 64 })).toEqual({
      donationBottom: 16,
      helpBottom: 92,
      contentBottom: 80,
    });
  });
  test("uses a 16px baseline when no measured action is visible", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 0, donationHeight: 0 })).toEqual({
      donationBottom: 16,
      helpBottom: 16,
      contentBottom: 0,
    });
  });
});
