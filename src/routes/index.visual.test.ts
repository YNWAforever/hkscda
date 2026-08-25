import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = () => readFileSync(join(process.cwd(), "src/routes/index.tsx"), "utf8");

describe("homepage review-safe presentation", () => {
  test("uses the approved production canonical", () => {
    expect(source()).toContain('href: "https://hkscda.vercel.app/"');
  });

  test("does not render unverified testimonials, social metrics, or payment accounts", () => {
    const homepage = source();

    expect(homepage).not.toContain("SocialProof");
    expect(homepage).not.toContain("VolunteerCarousel");
    expect(homepage).not.toContain("SocialWall");
    expect(homepage).not.toContain("BestRescue");
    expect(homepage).not.toContain("8727588");
    expect(homepage).not.toContain("124-511320-838");
    expect(homepage).not.toContain("012-351-1-025023-2");
    expect(homepage).not.toContain("PayMe Business");
    expect(homepage).not.toContain("PayPal / GIVE.asia");
    expect(homepage).not.toContain("HK$100");
  });

  test("replaces promotional claims with current-route handoffs", () => {
    const homepage = source();

    for (const route of ["/stories", "/report/adoption", "/report/audit", "/volunteer"]) {
      expect(homepage).toContain(`href: "${route}"`);
    }
    expect(homepage).toContain('href="/donate"');
    expect(homepage).toContain('href="/report/audit"');
  });
});
