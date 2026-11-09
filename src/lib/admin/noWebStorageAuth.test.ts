import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The admin session BFF (2026-11-10): the persistent half of an admin session is now an
 * HttpOnly refresh cookie, and the access token lives only in `sessionMemory`. This guard
 * fails if a browser module reintroduces a Supabase-persisted admin session or writes the
 * access token to web storage.
 */
function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ADMIN_SESSION_SOURCES = [
  "src/lib/admin/session.ts",
  "src/lib/admin/sessionMemory.ts",
  "src/lib/admin/http.ts",
  "src/lib/admin/identity.ts",
  "src/lib/admin/useLiveAdminActor.ts",
  "src/lib/admin/signInFlow.ts",
  "src/routes/admin/login.tsx",
  "src/routes/admin/reset-password.tsx",
  "src/components/admin/AdminLayout.tsx",
  "src/components/admin/useSessionExpiryRedirect.ts",
  "src/components/admin/VolunteerAdminShell.tsx",
  "src/components/admin/adoptions/ExportButton.tsx",
  "src/components/admin/adoptions/CoordinatorReports.tsx",
];

describe("admin auth does not persist a token in web storage", () => {
  test("no admin session module drives Supabase auth or the legacy shared browser client", () => {
    for (const path of ADMIN_SESSION_SOURCES) {
      const text = source(path);
      expect(text, path).not.toContain("supabase.auth");
      expect(text, path).not.toMatch(/from "(?:\.\.\/)+lib\/supabase"/);
    }
  });

  test("the memory store never writes to localStorage or sessionStorage", () => {
    const text = source("src/lib/admin/sessionMemory.ts");
    expect(text).not.toMatch(/localStorage\s*\.\s*setItem/);
    expect(text).not.toMatch(/sessionStorage\s*\.\s*(?:setItem|removeItem)/);
    // The only storage mutation is the migration cleanup of the old sb-*-auth-token key.
    expect(text).toContain("removeItem");
  });

  test("the credential-only Supabase client is non-persistent", () => {
    const text = source("src/lib/admin/adminAuthClient.ts");
    expect(text).toContain("persistSession: false");
    expect(text).not.toContain("persistSession: true");
  });

  test("the login form calls the session BFF, not Supabase sign-in", () => {
    const text = source("src/routes/admin/login.tsx");
    expect(text).toContain("loginAdminSession");
    expect(text).toContain("logoutAdminSession");
    expect(text).not.toContain("signInWithPassword");
  });

  test("sign-out goes through the BFF endpoints", () => {
    const adminLayout = source("src/components/admin/AdminLayout.tsx");
    expect(adminLayout).toContain("logoutAdminSession");
    const sessionStore = source("src/lib/admin/sessionMemory.ts");
    expect(sessionStore).toContain('"/api/admin/session/logout"');
    expect(sessionStore).toContain('"/api/admin/session/refresh"');
    expect(sessionStore).toContain('"/api/admin/session/login"');
  });
});
