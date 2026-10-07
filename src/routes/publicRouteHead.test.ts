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

/**
 * A route whose address carries a secret token (`status.$token.tsx`) must use the
 * private form of pageHead: a title plus noindex and no-referrer, and no canonical,
 * Open Graph or Twitter tag that would put the token-bearing URL in front of a
 * crawler or a social preview.
 */
const TOKEN_ROUTE = /\$token/;
const DECLARES_PRIVATE_PAGE = /\bprivate:\s*true\b/;

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

  test("every token-bearing route is a private page", () => {
    const tokenRoutes = routeFiles(ROUTES_DIR)
      .map((file) => relative(ROUTES_DIR, file).split(sep).join("/"))
      .filter((file) => TOKEN_ROUTE.test(file))
      .sort();
    // A rename that dropped every `$token` route would make the check pass vacuously.
    expect(tokenRoutes.length).toBeGreaterThan(0);

    const offenders = tokenRoutes.filter(
      (file) => !DECLARES_PRIVATE_PAGE.test(readFileSync(join(ROUTES_DIR, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  test("the private matcher tells a private page from an indexable one", () => {
    expect(DECLARES_PRIVATE_PAGE.test('head: () => pageHead({ title: "x", private: true })')).toBe(
      true,
    );
    expect(DECLARES_PRIVATE_PAGE.test("pageHead({\n  title: x,\n  private: true,\n})")).toBe(true);
    expect(
      DECLARES_PRIVATE_PAGE.test('pageHead({ title: "x", description: "d", path: "/x" })'),
    ).toBe(false);
    expect(DECLARES_PRIVATE_PAGE.test("const isPrivate = true;")).toBe(false);
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
