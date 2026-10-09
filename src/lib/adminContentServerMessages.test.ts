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

/** Migrations of these areas, by the words in their file names. */
const MIGRATION_WORDS =
  /faq|guide|payment_public|governance|knowledge|about_page|document|instruction|adoption_info|estate|adoption_rules|search_gap|adoption_fee/;

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

  test("raises no Chinese exception in the migrations of these areas", async () => {
    const paths = (await scan("supabase/migrations/*.sql")).filter((path) =>
      MIGRATION_WORDS.test(path.slice(path.lastIndexOf("/") + 1)),
    );
    expect(paths.length).toBeGreaterThan(10);
    const raises: string[] = [];
    for (const path of paths) {
      const lines = (await Bun.file(path).text()).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (
          /raise\s+(exception|warning|notice)|using\s+(message|hint|detail)/i.test(line) &&
          HAS_CHINESE.test(line)
        ) {
          raises.push(`${path}:${index + 1}`);
        }
      });
    }
    expect(raises).toEqual([]);
  });
});
