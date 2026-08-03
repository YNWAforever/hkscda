import { describe, expect, test } from "bun:test";

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(left: string, right: string) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("public brand tokens", () => {
  test("keeps official colours readable with white text", () => {
    expect(contrast("#05648E", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A61C56", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  test("defines the site token scope and removes the Poofyco identity", async () => {
    const css = await Bun.file("src/styles.css").text();
    expect(css).toContain("--brand-blue-official: #05648e");
    expect(css).toContain("--brand-magenta-official: #a61c56");
    expect(css).toContain(".site-shell");
    expect(css).toContain(".admin-shell");
    expect(css).toContain("@utility btn-primary");
    expect(css).toContain("@utility btn-secondary");
    expect(css).toContain("@utility btn-outline");
    expect(css).not.toMatch(/poofyco/i);
    expect(css).not.toContain("Baloo 2");

    const root = await Bun.file("src/routes/__root.tsx").text();
    expect(root).toContain('className="admin-shell min-h-dvh"');
    expect(root).toContain("<PublicFixedActionsProvider>");
    expect(root).toContain("Noto+Sans+HK");
    expect(root).not.toContain("Baloo+2");
  });
});
