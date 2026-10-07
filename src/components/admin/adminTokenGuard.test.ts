import { describe, expect, test } from "bun:test";

/**
 * Project rule (CLAUDE.md): colours come from the `var(--color-*)` tokens in
 * `src/styles.css`, never from Tailwind's palette scale. Admin code had drifted
 * to 44 palette classes on 32 lines, so a rebrand of the tokens left the login
 * page, error messages and form buttons on the old colours. This guard fails the
 * build when a palette class reappears under the admin routes or components.
 *
 * `bg-white` / `text-white` carry no scale number and are intentionally outside
 * the pattern, as are the palette names used without one (e.g. `text-red`).
 */
const PALETTE_CLASS =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|accent|shadow|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

async function adminSourcePaths() {
  const paths = (
    await Promise.all(
      ADMIN_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test."));
  return paths.sort();
}

describe("admin colour tokens", () => {
  test("admin code uses colour tokens, not palette classes", async () => {
    const paths = await adminSourcePaths();
    // If the glob ever returns nothing the assertion below passes vacuously.
    expect(paths.length).toBeGreaterThan(50);

    const hits: string[] = [];
    for (const path of paths) {
      const lines = (await Bun.file(path).text()).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (PALETTE_CLASS.test(line)) hits.push(`${path}:${index + 1}`);
      });
    }

    expect(hits).toEqual([]);
  });

  test("the matcher catches palette classes", () => {
    expect(PALETTE_CLASS.test("hover:bg-slate-700")).toBe(true);
    expect(PALETTE_CLASS.test("text-emerald-800")).toBe(true);
    expect(PALETTE_CLASS.test("bg-[var(--color-panel)]")).toBe(false);
  });
});
