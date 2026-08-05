import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

async function adminSources() {
  const globs = ["src/components/admin/**/*.{ts,tsx}", "src/routes/admin/**/*.{ts,tsx}"];
  const groups = await Promise.all(
    globs.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
  );
  return groups.flat().filter((path) => !path.includes(".test."));
}

describe("admin identity caching", () => {
  // What this guard does NOT catch, so nobody assumes it is complete:
  //   - a consumer that spreads the shared options and overrides them, e.g.
  //     `useQuery({ ...adminIdentityQueryOptions(), staleTime: 0 })`, or pairs
  //     ADMIN_IDENTITY_QUERY_KEY with its own queryFn — no literal appears, so
  //     the scan stays green while the caching behaviour has forked
  //   - a new consumer outside src/components/admin and src/routes/admin
  //     (src/lib/**, src/routes/api/admin/**) — those paths are not scanned

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
            `ADMIN_IDENTITY_QUERY_KEY from lib/admin/pageAccess instead.`,
        ).toBe(false);
      }
    }
  });

  test("AdminLayout does not fetch the identity itself", () => {
    const source = readFileSync("src/components/admin/AdminLayout.tsx", "utf8");
    // \b rather than \( on purpose: a bare reference is just as much a bypass as
    // a call. `useQuery({ queryFn: fetchAdminIdentity })` here would rebuild the
    // duplicate request without ever writing `fetchAdminIdentity(`.
    expect(
      /\bfetchAdminIdentity\b/.test(source),
      "AdminLayout must read the identity through useQuery(adminIdentityQueryOptions()) — " +
        "referencing fetchAdminIdentity here rebuilds the duplicate GET /api/admin/me this removed.",
    ).toBe(false);
  });
});
