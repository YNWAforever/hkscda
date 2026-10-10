import { describe, expect, test } from "bun:test";

/**
 * The server code behind the adoption information, post-adoption guide, FAQ, documents, annual
 * reports, governance, knowledge base, about pages and payment method screens sends no zh-HK
 * message. Every error these routes send is English and is shown as it came, and the admin screens
 * write their own text for what they detect themselves. So none of these screens needs a table that
 * maps a server message to a code (compare `lib/content/serverMessages.ts`).
 *
 * This file keeps that true. If a route or a service starts to send Chinese text, this test fails
 * and the message needs a code on the client, a zh-HK text identical to the server's, an English
 * text that says what to do next, and a test that drives the real route through `fetchAdminJson`.
 *
 * The same goes for the database: no migration raises a Chinese message, apart from the two content
 * review ones listed below, which these screens cannot reach.
 *
 * Two files hold Chinese that is not a message, and are left out on purpose:
 * - `lib/adoptionInstructions/content.ts`: the page text the adoption page starts with, which staff
 *   then edit (data, shown as stored);
 * - `lib/faq/schemas.ts`: the Chinese and English text of the ten FAQ action buttons (data; the
 *   admin form reads the label of its language with `faqCtaOptionLabel`).
 */
const HAS_CHINESE = /[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u;

const NOT_MESSAGES = new Set(["src/lib/adoptionInstructions/content.ts", "src/lib/faq/schemas.ts"]);

const LIB_FOLDERS = [
  "aboutPages",
  "adoptionGuideReleases",
  "adoptionInformation",
  "adoptionInstructions",
  "documents",
  "faq",
  "governance",
  "knowledge",
  "paymentPublicConfig",
];

/** The files every one of those routes goes through to check the admin and reach the database. */
const SHARED_SERVER_FILES = [
  "src/lib/admin/session.server.ts",
  "src/lib/donations/supabase.server.ts",
  "src/lib/supabase.server.ts",
  "src/routes/api/admin/me.ts",
];

const ROUTE_NAMES = [
  "about-pages",
  "adoption-guide-releases",
  "adoption-information",
  "adoption-instructions",
  "annual-reports",
  "documents",
  "faq",
  "governance",
  "knowledge",
  "payment-methods",
];

/**
 * The only two `raise` statements in the migrations that carry Chinese. Both come from the trigger
 * that refuses to publish content or an animal version that has no approved source review (errcode
 * 22023), which these screens never show. They are keyed by file and by the line the `raise` starts
 * on.
 */
const KNOWN_CONTENT_REVIEW_RAISES = new Set([
  "supabase/migrations/20260914161341_admin_content_quality_review.sql:60",
  "supabase/migrations/20260914162305_animal_nonpublic_review_transition.sql:12",
]);

/**
 * Every `raise` statement in some SQL, from the word `raise` to its closing semicolon, so that a
 * message on a later line, or after `using message =`, is part of it. A semicolon inside a quoted
 * string does not end the statement. `line` is where the statement starts.
 */
export function raiseStatements(sql: string): Array<{ line: number; text: string }> {
  const found: Array<{ line: number; text: string }> = [];
  const word = /\braise\b/gi;
  for (let match = word.exec(sql); match; match = word.exec(sql)) {
    let end = match.index + match[0].length;
    let quoted = false;
    for (; end < sql.length; end += 1) {
      const char = sql[end];
      if (char === "'") quoted = !quoted;
      else if (char === ";" && !quoted) break;
    }
    found.push({
      line: sql.slice(0, match.index).split("\n").length,
      text: sql.slice(match.index, end + 1),
    });
    word.lastIndex = end;
  }
  return found;
}

async function scan(pattern: string): Promise<string[]> {
  const paths = await Array.fromAsync(new Bun.Glob(pattern).scan("."));
  return paths.map((path) => path.split("\\").join("/")).sort();
}

async function linesWithChinese(paths: string[]): Promise<string[]> {
  const hits: string[] = [];
  for (const path of paths) {
    const lines = (await Bun.file(path).text()).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (HAS_CHINESE.test(line)) hits.push(`${path}:${index + 1}`);
    });
  }
  return hits;
}

describe("the server code behind the content pages", () => {
  test("is found by the scan, so the checks below are not empty", async () => {
    const lib = (
      await Promise.all(LIB_FOLDERS.map((name) => scan(`src/lib/${name}/**/*.ts`)))
    ).flat();
    const routes = (
      await Promise.all(
        ROUTE_NAMES.flatMap((name) => [
          scan(`src/routes/api/admin/${name}.ts`),
          scan(`src/routes/api/admin/${name}/**/*.ts`),
        ]),
      )
    ).flat();
    expect(lib.length).toBeGreaterThan(30);
    expect(routes.length).toBeGreaterThan(15);
    expect(lib).toContain("src/lib/faq/service.ts");
    expect(routes).toContain("src/routes/api/admin/documents.ts");
    expect(routes).toContain("src/routes/api/admin/adoption-guide-releases/-handlers.ts");
  });

  test("sends no Chinese from the services, repositories and handlers", async () => {
    const paths = (await Promise.all(LIB_FOLDERS.map((name) => scan(`src/lib/${name}/**/*.ts`))))
      .flat()
      .filter((path) => !path.includes(".test.") && !NOT_MESSAGES.has(path));
    expect(await linesWithChinese(paths)).toEqual([]);
  });

  test("sends no Chinese from the files that check the admin", async () => {
    expect(await linesWithChinese(SHARED_SERVER_FILES)).toEqual([]);
  });

  test("sends no Chinese from the admin API routes", async () => {
    const paths = (
      await Promise.all(
        ROUTE_NAMES.flatMap((name) => [
          scan(`src/routes/api/admin/${name}.ts`),
          scan(`src/routes/api/admin/${name}/**/*.ts`),
        ]),
      )
    )
      .flat()
      .filter((path) => !path.includes(".test."));
    expect(await linesWithChinese(paths)).toEqual([]);
  });

  test("raises no Chinese in any migration, apart from the two content review ones", async () => {
    const paths = await scan("supabase/migrations/*.sql");
    expect(paths.length).toBeGreaterThan(150);
    let statements = 0;
    const withChinese: string[] = [];
    for (const path of paths) {
      for (const statement of raiseStatements(await Bun.file(path).text())) {
        statements += 1;
        if (HAS_CHINESE.test(statement.text)) withChinese.push(`${path}:${statement.line}`);
      }
    }
    // The scan reads the raise statements it is meant to: there are over a thousand, and the two
    // known ones are among those it flags.
    expect(statements).toBeGreaterThan(1000);
    expect(withChinese.filter((hit) => KNOWN_CONTENT_REVIEW_RAISES.has(hit))).toHaveLength(2);
    expect(withChinese.filter((hit) => !KNOWN_CONTENT_REVIEW_RAISES.has(hit))).toEqual([]);
  });
});

describe("raiseStatements", () => {
  test("reads a message on a later line and one after `using message`", () => {
    const sql = [
      "begin;",
      "  raise exception",
      "    '無法儲存'",
      "    using errcode = '22023';",
      "  raise using message = '無法發佈', errcode = 'P0001';",
      "end;",
    ].join("\n");
    const found = raiseStatements(sql);
    expect(found.map((statement) => statement.line)).toEqual([2, 5]);
    expect(found.every((statement) => HAS_CHINESE.test(statement.text))).toBe(true);
  });

  test("keeps a semicolon inside a quoted message in the statement", () => {
    const [statement] = raiseStatements("raise exception 'a; 無法儲存' using errcode = '22023';");
    expect(HAS_CHINESE.test(statement.text)).toBe(true);
  });

  test("does not flag an English raise, or Chinese outside a raise", () => {
    const sql = [
      "-- 備註：這是註解",
      "insert into t values ('中文');",
      "raise exception 'Could not save' using errcode = '22023';",
    ].join("\n");
    const found = raiseStatements(sql);
    expect(found).toHaveLength(1);
    expect(HAS_CHINESE.test(found[0].text)).toBe(false);
  });
});
