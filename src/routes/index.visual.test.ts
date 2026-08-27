import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = () => readFileSync(join(process.cwd(), "src/routes/index.tsx"), "utf8");

/**
 * The home page is now composed from src/components/site/home/*, so the
 * destination assertions read those modules rather than the route file. The
 * canonical still lives in the route head, so that one stays here.
 */
const homeModules = () =>
  [
    "HomeHero",
    "FeaturedAnimals",
    "ImpactBand",
    "AdoptionStepsBand",
    "FeaturedStory",
    "HelpCards",
    "TransparencyBand",
  ]
    .map((name) =>
      readFileSync(join(process.cwd(), `src/components/site/home/${name}.tsx`), "utf8"),
    )
    .join("\n");

describe("homepage review-safe presentation", () => {
  test("uses the approved production canonical", () => {
    expect(source()).toContain('href: "https://hkscda.vercel.app/"');
  });

  test("does not render unverified testimonials, social metrics, or payment accounts", () => {
    const homepage = source() + homeModules();

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
    expect(homepage).not.toContain("每年救助超過");
  });

  test("replaces promotional claims with current-route handoffs", () => {
    const homepage = homeModules();

    for (const route of [
      "/stories",
      "/report/adoption",
      "/report/audit",
      "/volunteer",
      "/donate",
      "/animals/cat",
      "/animals/dog",
      "/sponsors",
      "/adoption/instructions",
    ]) {
      expect(homepage).toContain(`"${route}"`);
    }
  });

  test("states the registration identity from the brand constants, never inline", () => {
    // Two surfaces quote the charity file number; both must read the same source.
    const modules = homeModules();
    expect(modules).toContain("brand.org.charityFileNumber");
    expect(modules).toContain("brand.org.afcdLicenceNumber");
    expect(modules).not.toContain("91/14493");
    expect(modules).not.toContain("ORG-00041");
  });

  test("shows an explicit unpublished state instead of a zero figure", () => {
    // Plan section 10: blank data reads as 暫未發佈, never as 0.
    const impact = readFileSync(
      join(process.cwd(), "src/components/site/home/ImpactBand.tsx"),
      "utf8",
    );
    expect(impact).toContain("暫未發佈");
    expect(impact).toContain("不會以零值、舊數字或估算數字代替");
  });
});
