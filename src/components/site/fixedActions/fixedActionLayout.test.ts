import { describe, expect, test } from "bun:test";

import { calculateFixedActionLayout } from "./fixedActionLayout";

describe("fixed public action layout", () => {
  test("stacks shortlist, prompt, and help with 12px gaps", () => {
    expect(calculateFixedActionLayout({ shortlistHeight: 96, donationHeight: 64 })).toEqual({
      donationBottom: 124,
      helpBottom: 200,
      contentBottom: 188,
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
