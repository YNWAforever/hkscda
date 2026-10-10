import { describe, expect, test } from "bun:test";

/**
 * Admin dates are written by `formatAdminDate` and `formatAdminDateTime` (and money by
 * `formatAdminMoney`) from `src/components/admin/i18n/format.ts`, in Hong Kong time, in both
 * languages. A screen that writes its own date drifts from that format, and usually from the
 * zone too: `.slice(0, 10)` on a timestamp is the UTC day, one day early between 00:00 and 08:00
 * in Hong Kong, and `toLocaleString(` without a `timeZone` is the viewer's own zone.
 *
 * So admin code outside `i18n/format.ts` may not use `.slice(0, 10)`, `toLocaleDateString(`,
 * `toLocaleTimeString(`, `toLocaleString(` or `Intl.DateTimeFormat(`. A legitimate use, such as
 * `.slice(0, 10)` that builds a form value or a query parameter rather than a display, or a time
 * of day the shared formatters do not offer, carries the marker `// admin-format-ok: <reason>` on
 * the same line or on the line just above it (where Prettier leaves a comment). The reason must
 * not be empty.
 */

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

/** The one module that is allowed to call `Intl` for admin dates and money. */
const SHARED_FORMATTER = "src/components/admin/i18n/format.ts";

const OWN_DATE_FORMAT =
  /\.slice\(\s*0\s*,\s*10\s*\)|\btoLocale(?:Date|Time)?String\s*\(|\bIntl\s*\.\s*DateTimeFormat\s*\(/;

const MARKER = /\/\/\s*admin-format-ok:\s*\S/;

/** Blank out block comments and `//` comments that are not the marker, keeping line numbers. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (MARKER.test(line) ? line : line.replace(/(^|[^:])\/\/.*$/, "$1")))
    .join("\n");
}

/** 1-based line numbers in `text` that format a date their own way without the marker. */
export function ownDateFormats(text: string): number[] {
  const lines = withoutComments(text).split("\n");
  return lines.flatMap((line, index) => {
    if (!OWN_DATE_FORMAT.test(line.replace(MARKER, ""))) return [];
    const marked = MARKER.test(line) || MARKER.test(lines[index - 1] ?? "");
    return marked ? [] : [index + 1];
  });
}

async function adminSourcePaths(): Promise<string[]> {
  return (
    await Promise.all(
      ADMIN_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test."))
    .sort();
}

describe("admin date format guard", () => {
  test("admin code formats dates only through i18n/format.ts", async () => {
    const hits: string[] = [];
    for (const path of await adminSourcePaths()) {
      if (path === SHARED_FORMATTER) continue;
      for (const line of ownDateFormats(await Bun.file(path).text())) hits.push(`${path}:${line}`);
    }
    expect(
      hits,
      "Use formatAdminDate, formatAdminDateTime or formatAdminMoney from src/components/admin/i18n/format.ts, or mark a use that is not a displayed date with // admin-format-ok: <reason>.",
    ).toEqual([]);
  });

  test("scans a real set of files, so the guard is not vacuous", async () => {
    const paths = await adminSourcePaths();
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain(SHARED_FORMATTER);
    // The shared formatter itself is what the guard exempts, and the pattern does find it there.
    expect(ownDateFormats(await Bun.file(SHARED_FORMATTER).text()).length).toBeGreaterThan(0);
  });

  test("flags each way of writing a date by hand", () => {
    expect(ownDateFormats("return value.slice(0, 10);")).toEqual([1]);
    expect(ownDateFormats("a\nconst day = row.createdAt?.slice(0,10);")).toEqual([2]);
    expect(ownDateFormats("new Date(v).toLocaleString('zh-HK')")).toEqual([1]);
    expect(ownDateFormats("new Date(v).toLocaleDateString('zh-HK')")).toEqual([1]);
    expect(ownDateFormats("new Date(v).toLocaleTimeString('zh-HK')")).toEqual([1]);
    expect(ownDateFormats("new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' })")).toEqual([
      1,
    ]);
    expect(ownDateFormats("const f = new Intl . DateTimeFormat(\n  'en-GB')")).toEqual([1]);
  });

  test("accepts a marked use on the same line or the line above", () => {
    expect(
      ownDateFormats("const d = now.toISOString().slice(0, 10); // admin-format-ok: form value"),
    ).toEqual([]);
    expect(
      ownDateFormats(
        "// admin-format-ok: a time of day\nconst f = new Intl.DateTimeFormat('en-GB');",
      ),
    ).toEqual([]);
  });

  test("rejects a marker without a reason, or one two lines away", () => {
    expect(ownDateFormats("value.slice(0, 10); // admin-format-ok:")).toEqual([1]);
    expect(ownDateFormats("// admin-format-ok: x\n\nvalue.slice(0, 10);")).toEqual([3]);
  });

  test("ignores comments, other slices and names that only contain the words", () => {
    expect(ownDateFormats("// value.slice(0, 10) used to be here")).toEqual([]);
    expect(ownDateFormats("/* toLocaleString(\n Intl.DateTimeFormat( */")).toEqual([]);
    expect(ownDateFormats("value.slice(0, 7); value.slice(0, 16); list.slice(0, 100)")).toEqual([]);
    expect(ownDateFormats("formatAdminDate(value, 'zh'); myToLocaleString(x)")).toEqual([]);
    expect(ownDateFormats("const url = 'https://example.org'; value.slice(0, 10)")).toEqual([1]);
  });
});
