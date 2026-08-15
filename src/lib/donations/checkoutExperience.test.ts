import { describe, expect, test } from "bun:test";

import { checkoutExperienceFromViewport } from "./checkoutExperience";

describe("checkoutExperienceFromViewport", () => {
  test("uses the mobile WAP checkout below the desktop breakpoint", () => {
    expect(checkoutExperienceFromViewport(767)).toBe("wap");
  });

  test("uses the hosted desktop QR checkout at and above the breakpoint", () => {
    expect(checkoutExperienceFromViewport(768)).toBe("desktop_qr");
  });
});
