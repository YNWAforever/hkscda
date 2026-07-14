import { describe, expect, test } from "bun:test";

describe("public brand migration", () => {
  test("removes deprecated visual-system utilities and unverified impact copy", async () => {
    const publicPaths = (
      await Promise.all(
        ["src/components/site/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"].map((pattern) =>
          Array.fromAsync(new Bun.Glob(pattern).scan(".")),
        ),
      )
    )
      .flat()
      .filter((path) => !path.includes(".test."));
    const source = (await Promise.all(publicPaths.map((path) => Bun.file(path).text()))).join("\n");

    for (const token of [
      "btn-cta",
      "btn-navy",
      "card-dashed",
      "arch-mask",
      "bg-topo",
      "--color-pink-strip",
    ]) {
      expect(source).not.toContain(token);
    }
    expect(source).not.toContain("Poofyco");
    expect(source).not.toContain("撟喳?瘥?14 撠?");
    expect(source).not.toContain("瘥僑?頞?600");
  });
});
