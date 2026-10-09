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

describe("postSignInDestination", () => {
  test("returns to the requested page", () => {
    expect(postSignInDestination("/admin/animals?page=2", admin)).toBe("/admin/animals?page=2");
  });

  test("uses the role's first allowed page when there is no safe redirect", () => {
    expect(postSignInDestination(undefined, admin)).toBe(getFirstAllowedAdminRoute("treasurer"));
    expect(postSignInDestination("//evil.example", admin)).toBe(
      getFirstAllowedAdminRoute("treasurer"),
    );
  });

  test("falls back to /admin when the identity could not be read", () => {
    expect(postSignInDestination(undefined, null)).toBe("/admin");
  });
});
