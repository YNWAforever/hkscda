import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const IDENTITY_MODULE = "src/lib/admin/identity.ts";

async function adminSources() {
  const globs = ["src/components/admin/**/*.{ts,tsx}", "src/routes/admin/**/*.{ts,tsx}"];
  const groups = await Promise.all(
    globs.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
  );
  return groups.flat().filter((path) => !path.includes(".test."));
}

describe("admin identity caching", () => {
  test("no admin surface hard-codes an identity query key", async () => {
    // Six sites resolved the identity under two different keys, so
    // invalidating ["admin-me"] after a role change left the ["admin-identity"]
    // consumer showing the old role. The key lives in one module now.
    for (const file of await adminSources()) {
      const source = readFileSync(file, "utf8");
      for (const literal of ['"admin-me"', '"admin-identity"']) {
        expect(
          source.includes(literal),
          `${file} hard-codes ${literal}. Use adminIdentityQueryOptions() / ` +
            `ADMIN_IDENTITY_QUERY_KEY from lib/admin/identity.ts instead.`,
        ).toBe(false);
      }
    }
  });

  test("AdminLayout does not fetch the identity itself", () => {
    const source = readFileSync("src/components/admin/AdminLayout.tsx", "utf8");
    expect(
      /fetchAdminIdentity\(/.test(source),
      "AdminLayout must read the identity through useQuery(adminIdentityQueryOptions()) — " +
        "calling fetchAdminIdentity() here is the duplicate GET /api/admin/me this removed.",
    ).toBe(false);
  });

  test("the shared options keep a non-zero staleTime", () => {
    const source = readFileSync(IDENTITY_MODULE, "utf8");
    // react-query defaults staleTime to 0; at 0 every mount refetches and the
    // navigation win disappears.
    expect(/staleTime:\s*ADMIN_IDENTITY_STALE_TIME_MS/.test(source)).toBe(true);
    expect(/ADMIN_IDENTITY_STALE_TIME_MS\s*=\s*60_000/.test(source)).toBe(true);
  });
});
