import { describe, expect, test } from "bun:test";

/**
 * Project rule (CLAUDE.md): colours come from the `var(--color-*)` tokens in
 * `src/styles.css`, never from Tailwind's palette scale. Admin code had drifted
 * to 44 palette classes on 32 lines, so a rebrand of the tokens left the login
 * page, error messages and form buttons on the old colours. This guard fails the
 * build when a palette class reappears under the admin routes or components.
 *
 * The pattern matches any utility (`bg-`, `border-t-`, `ring-offset-`, `caret-`,
 * ...) followed by one of the 22 palette names and a scale number, with any
 * variant prefix (`hover:`, `focus-visible:`), `!` important marker or opacity
 * suffix (`/80`, `/[0.3]`) around it. `bg-white` / `text-white` carry no scale
 * number and are intentionally outside it, as are palette names used without
 * one (e.g. `text-red`).
 */
const PALETTE_CLASS =
  /\b(?:[a-z-]+:)*[a-z]+(?:-[a-z]+)*-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;

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
    const palette = [
      "hover:bg-slate-700",
      "text-emerald-800",
      "border-t-red-500",
      "border-x-gray-200",
      "ring-offset-red-500",
      "caret-red-500",
      "focus-visible:bg-red-500",
      "bg-red-50/80",
      "bg-red-500/[0.3]",
      "!bg-red-500",
    ];
    for (const cls of palette) {
      expect(PALETTE_CLASS.test(cls), cls).toBe(true);
    }

    const tokens = ["bg-white", "text-white", "bg-[var(--color-panel)]"];
    for (const cls of tokens) {
      expect(PALETTE_CLASS.test(cls), cls).toBe(false);
    }
  });
});
