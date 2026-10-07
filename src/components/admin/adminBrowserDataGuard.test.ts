import { describe, expect, test } from "bun:test";

/**
 * Project rule (CLAUDE.md): admin browser code does not read or write tables
 * directly. Every admin surface goes through the API layer, where `requireAdmin`
 * checks the role and mutations write their own `audit_log` row. `MatchPanel` and
 * `AnimalPipeline` were the last two components still querying reference tables
 * with the anon client; this guard fails the build if a browser table or RPC call
 * reappears under the admin routes or components.
 *
 * The pattern is matched against the whole file, so a call split over lines
 * (`supabase\n  .from("animals")`) is caught. `supabase.auth.*` and
 * `supabase.storage.from(bucket)` are intentionally outside it: sign-in and signed
 * uploads are not table reads.
 */
const BROWSER_DATA_CALL = /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/;

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

describe("admin browser data access", () => {
  test("admin browser code does not query tables or RPCs", async () => {
    const paths = await adminSourcePaths();
    // If the glob ever returns nothing the assertion below passes vacuously.
    expect(paths.length).toBeGreaterThan(50);

    const hits: string[] = [];
    for (const path of paths) {
      if (BROWSER_DATA_CALL.test(await Bun.file(path).text())) hits.push(path);
    }

    expect(hits).toEqual([]);
  });

  test("the matcher ignores auth and storage", () => {
    expect(BROWSER_DATA_CALL.test('supabase\n  .from("animals")')).toBe(true);
    expect(BROWSER_DATA_CALL.test('supabase.rpc("some_function")')).toBe(true);

    expect(BROWSER_DATA_CALL.test("supabase.storage.from(bucket)")).toBe(false);
    expect(BROWSER_DATA_CALL.test("supabase.auth.getSession()")).toBe(false);
  });
});
