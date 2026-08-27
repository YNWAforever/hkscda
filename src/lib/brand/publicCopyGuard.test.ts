import { describe, expect, test } from "bun:test";

/**
 * Defect G-19. This guard is meant to keep deprecated visual utilities and
 * unverified impact claims out of the public surface. Its two Chinese forbidden
 * strings had been mangled to mojibake, so the claim it existed to catch matched
 * nothing and the guard passed while the claim was still live on the site.
 *
 * The forbidden copy is written as \u escapes so no future re-encoding can
 * silently disarm it again, and `guard catches what it forbids` below proves the
 * matcher still works. A guard that cannot fail is worse than no guard: it reads
 * as evidence.
 */

/** "\u6bcf\u5e74\u6551\u52a9\u8d85\u904e" - rescue totals the association has not published. */
const UNVERIFIED_ANNUAL_RESCUE = "\u6bcf\u5e74\u6551\u52a9\u8d85\u904e";

/**
 * Rate claims of the "one every N minutes/hours/days" shape. The original second
 * entry was corrupted beyond recovery, so this covers that class rather than
 * guessing at the exact wording it once held.
 */
const RATE_CLAIM = /\u6bcf\s*\d+\s*(\u5206\u9418|\u5c0f\u6642|\u5929|\u65e5)/u;

const DEPRECATED_TOKENS = [
  "btn-cta",
  "btn-navy",
  "card-dashed",
  "arch-mask",
  "bg-topo",
  "--color-pink-strip",
  "Poofyco",
];

async function publicSource() {
  const paths = (
    await Promise.all(
      ["src/components/site/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"].map((pattern) =>
        Array.fromAsync(new Bun.Glob(pattern).scan(".")),
      ),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test."));

  return {
    paths,
    source: (await Promise.all(paths.map((path) => Bun.file(path).text()))).join("\n"),
  };
}

describe("public brand migration", () => {
  test("scans a non-trivial amount of public source", async () => {
    // If the glob ever returns nothing, every assertion below passes vacuously.
    const { paths } = await publicSource();
    expect(paths.length).toBeGreaterThan(50);
  });

  test("removes deprecated visual-system utilities", async () => {
    const { source } = await publicSource();
    for (const token of DEPRECATED_TOKENS) {
      expect(source).not.toContain(token);
    }
  });

  test("carries no unverified impact claim", async () => {
    const { source } = await publicSource();
    expect(source).not.toContain(UNVERIFIED_ANNUAL_RESCUE);
    expect(source).not.toMatch(RATE_CLAIM);
  });

  test("guard catches what it forbids", () => {
    // The mojibake failure was invisible because nothing checked the matcher.
    expect(`\u6211\u5011${UNVERIFIED_ANNUAL_RESCUE}600\u96bb`).toContain(UNVERIFIED_ANNUAL_RESCUE);
    expect("\u6bcf14\u5206\u9418\u6551\u4e00\u96bb").toMatch(RATE_CLAIM);
    expect("\u6bcf 14 \u5206\u9418").toMatch(RATE_CLAIM);
    expect("\u6bcf\u5e74\u5e73\u5747").not.toMatch(RATE_CLAIM);
  });
});
