import { describe, expect, test } from "bun:test";

import { getFirstAllowedAdminRoute, type AdminIdentity } from "./access";
import { loginUrlFor, postSignInDestination, safeAdminRedirect } from "./loginRedirect";

const admin: AdminIdentity = {
  id: "a1",
  authUserId: "u1",
  email: "a@example.com",
  role: "treasurer",
  status: "active",
};

describe("safeAdminRedirect", () => {
  test.each(["/admin", "/admin/animals?page=2", "/admin/cases/abc?tab=notes#top", "/admin/"])(
    "accepts %s",
    (value) => {
      expect(safeAdminRedirect(value)).toBe(value);
    },
  );

  test.each([
    "//evil.example/admin",
    "/admin//evil",
    "/admin/\\evil",
    "\\admin",
    "/admin\\..\\evil",
    "https://evil.example/admin",
    "http://localhost/admin",
    "javascript:alert(1)",
    "/adminfoo",
    "/administrator",
    "/other",
    "admin/animals",
    "/admin/login",
    "/admin/login/",
    "/admin/login?x=1",
    "/admin/login#x",
    "/admin/reset-password",
    "/admin/reset-password?token=1",
    "/admin/../..",
    "/admin/../../evil",
    "/admin/%2e%2e/login",
    "/admin/%2E%2E/x",
    "/admin/./../x",
    "/admin/./x",
    "/admin/..",
    "/admin/.%2e/x",
    "/admin/x/..?y=1",
    "/admin/animals\n/admin",
    "/admin/an imals",
    "",
    "   ",
  ])("rejects %j", (value) => {
    expect(safeAdminRedirect(value)).toBeNull();
  });

  test("rejects non-strings", () => {
    for (const value of [null, undefined, 42, {}, ["/admin"], true]) {
      expect(safeAdminRedirect(value)).toBeNull();
    }
  });
});

describe("loginUrlFor", () => {
  test("encodes the page to return to", () => {
    expect(loginUrlFor("/admin/cases/abc?tab=notes")).toBe(
      "/admin/login?redirect=%2Fadmin%2Fcases%2Fabc%3Ftab%3Dnotes",
    );
  });

  test("falls back to plain sign-in when the page is not a safe destination", () => {
    expect(loginUrlFor("/admin/login")).toBe("/admin/login");
    expect(loginUrlFor("//evil.example")).toBe("/admin/login");
  });
});

const staff: AdminIdentity = { ...admin, id: "a2", authUserId: "u2", role: "staff" };

describe("postSignInDestination", () => {
  test("returns to the requested page when the role can open it", () => {
    expect(postSignInDestination("/admin/animals?page=2", staff)).toBe("/admin/animals?page=2");
    expect(postSignInDestination("/admin/supporters/s1", admin)).toBe("/admin/supporters/s1");
    expect(postSignInDestination("/admin?section=payments", admin)).toBe("/admin?section=payments");
  });

  test("uses the role's first allowed page when there is no safe redirect", () => {
    expect(postSignInDestination(undefined, admin)).toBe(getFirstAllowedAdminRoute("treasurer"));
    expect(postSignInDestination("//evil.example", admin)).toBe(
      getFirstAllowedAdminRoute("treasurer"),
    );
    expect(postSignInDestination("/admin/../../evil", staff)).toBe(
      getFirstAllowedAdminRoute("staff"),
    );
  });

  test("uses the first allowed page when the role cannot open the requested one", () => {
    // /admin/supporters is a treasurer page that staff cannot open; animals is the reverse.
    expect(postSignInDestination("/admin/supporters", staff)).toBe(
      getFirstAllowedAdminRoute("staff"),
    );
    expect(postSignInDestination("/admin/animals", admin)).toBe(
      getFirstAllowedAdminRoute("treasurer"),
    );
  });

  test("keeps a safe redirect when the identity could not be read, else /admin", () => {
    expect(postSignInDestination("/admin/animals", null)).toBe("/admin/animals");
    expect(postSignInDestination(undefined, null)).toBe("/admin");
  });
});
