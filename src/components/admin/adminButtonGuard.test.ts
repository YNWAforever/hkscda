import { describe, expect, test } from "bun:test";

/**
 * A bare `<button>` with no `className` renders as plain text: no padding, so about 24 px
 * tall, and no ring of our own. Admin buttons use the shared `Button`
 * (`src/components/ui/button.tsx`, at least 44 px with a focus ring), or a native `<button>`
 * that carries a `className` (`min-h-11 min-w-11` plus `focus-visible:` ring classes).
 *
 * A native `<button>` that really must stay unstyled opts out with
 * `// admin-button-ok: <reason>` on the same line or the line above. Prettier moves
 * comments, so both places count, and `{/* ... *\/}` works too.
 */

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.tsx", "src/components/admin/**/*.tsx"];
const MARKER = /admin-button-ok:\s*\S/;

function blankComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_match, lead: string) => lead);
}

/** The text of the opening tag that starts at `start` (the `<` of `<button`). */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0 && text[i - 1] !== "=") return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** 1-based line numbers of `<button>` tags with no `className` and no opt-out marker. */
export function unstyledButtonLines(text: string): number[] {
  const code = blankComments(text);
  const originalLines = text.split("\n");
  const lines: number[] = [];
  for (const match of code.matchAll(/<button(?=[\s>/])/g)) {
    const start = match.index ?? 0;
    if (/\bclassName\s*=/.test(openingTag(code, start))) continue;
    const line = code.slice(0, start).split("\n").length;
    const marked = [line - 1, line - 2].some((index) => MARKER.test(originalLines[index] ?? ""));
    if (!marked) lines.push(line);
  }
  return lines;
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

describe("admin button guard", () => {
  test("every admin <button> has a className or an admin-button-ok marker", async () => {
    const hits: string[] = [];
    for (const path of await adminSourcePaths()) {
      for (const line of unstyledButtonLines(await Bun.file(path).text()))
        hits.push(`${path}:${line}`);
    }
    expect(
      hits,
      "Use <Button> from src/components/ui/button, or give the <button> a className with min-h-11 min-w-11 and focus-visible: ring classes. A button that must stay bare takes // admin-button-ok: <reason>.",
    ).toEqual([]);
  });

  test("scans a real set of files, so the guard is not vacuous", async () => {
    const paths = await adminSourcePaths();
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain("src/components/admin/AdminLayout.tsx");
    // At least some admin files still contain a native <button>, which the guard inspects.
    let natives = 0;
    for (const path of paths) natives += (await Bun.file(path).text()).split("<button").length - 1;
    expect(natives).toBeGreaterThan(20);
  });

  test("flags a button with no className, on one line or many", () => {
    expect(unstyledButtonLines("<button type='button' onClick={go}>Go</button>")).toEqual([1]);
    expect(unstyledButtonLines("a\n<button>Go</button>")).toEqual([2]);
    expect(
      unstyledButtonLines(
        [
          "<div>",
          "  <button",
          '    type="button"',
          "    onClick={() => go(1)}",
          "  >",
          "    Go",
          "  </button>",
          "</div>",
        ].join("\n"),
      ),
    ).toEqual([2]);
  });

  test("does not count a className that sits in another element or a longer tag name", () => {
    expect(unstyledButtonLines('<div className="x"><button>Go</button></div>')).toEqual([1]);
    expect(unstyledButtonLines("<buttonGroup>x</buttonGroup>")).toEqual([]);
    expect(unstyledButtonLines("<Button>Go</Button>")).toEqual([]);
  });

  test("accepts a className, however it is written", () => {
    expect(unstyledButtonLines('<button className="min-h-11" onClick={go}>Go</button>')).toEqual(
      [],
    );
    expect(unstyledButtonLines("<button className={cn('a', on && 'b')}>Go</button>")).toEqual([]);
    expect(
      unstyledButtonLines(
        ["<button", '  type="button"', "  className={styles}", ">", "  Go", "</button>"].join("\n"),
      ),
    ).toEqual([]);
  });

  test("accepts the opt-out marker on the same line or the line above, and nothing else", () => {
    expect(
      unstyledButtonLines("// admin-button-ok: wrapped by a link\n<button>Go</button>"),
    ).toEqual([]);
    expect(unstyledButtonLines("<button>Go</button> {/* admin-button-ok: reason */}")).toEqual([]);
    expect(unstyledButtonLines("{/* admin-button-ok: reason */}\n<button>Go</button>")).toEqual([]);
    expect(unstyledButtonLines("// admin-button-ok:\n<button>Go</button>")).toEqual([1 + 1]);
    expect(unstyledButtonLines("// admin-button-ok: far away\n\n<button>Go</button>")).toEqual([3]);
  });

  test("ignores buttons that only appear in comments or strings of arrow functions", () => {
    expect(unstyledButtonLines("// <button>Go</button>")).toEqual([]);
    expect(unstyledButtonLines("/* <button>Go</button> */")).toEqual([]);
    expect(unstyledButtonLines('<button onClick={() => a > b} className="x">Go</button>')).toEqual(
      [],
    );
  });
});
