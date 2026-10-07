import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const ROUTES_DIR = dirname(fileURLToPath(import.meta.url));

/** Routes that never render a page of their own (a 301 redirect). */
const ALLOWLIST = ["about/cccp.tsx"];

/**
 * A route declares its title by calling pageHead(...) or by opening its head
 * `meta` array with a title entry. A bare `{ title }` pattern is not enough: it
 * also matches JSX such as `title={title}` and `{title}</h3>` and content data
 * such as `{ title: "救援", description: ... }`, none of which set the document
 * title.
 */
const DECLARES_TITLE = /pageHead\(|meta:\s*\[\s*\{\s*title\s*[:,}]/;

function routeFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("-")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "admin" || entry.name === "api") continue;
      files.push(...routeFiles(full));
    } else if (
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx") &&
      entry.name !== "__root.tsx"
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("public route <head>", () => {
  test("every public route declares its own title", () => {
    const offenders = routeFiles(ROUTES_DIR)
      .map((file) => relative(ROUTES_DIR, file).split(sep).join("/"))
      .filter((file) => !ALLOWLIST.includes(file))
      .filter((file) => !DECLARES_TITLE.test(readFileSync(join(ROUTES_DIR, file), "utf8")))
      .sort();

    expect(offenders).toEqual([]);
  });

  test("the matcher sees a title", () => {
    expect(DECLARES_TITLE.test('head: () => pageHead({ title: "x", private: true })')).toBe(true);
    expect(DECLARES_TITLE.test('head: () => ({ meta: [{ title: "x" }] })')).toBe(true);
    expect(DECLARES_TITLE.test("head: () => ({ meta: [\n { title },\n] })")).toBe(true);
    expect(DECLARES_TITLE.test("head: () => ({ links: [] })")).toBe(false);
    expect(DECLARES_TITLE.test("<Shell title={title} />")).toBe(false);
    expect(DECLARES_TITLE.test("<h3>{title}</h3>")).toBe(false);
    expect(DECLARES_TITLE.test('const step = { title: "救援", description: "d" };')).toBe(false);
  });
});
