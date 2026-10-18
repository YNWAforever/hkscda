import { describe, expect, test } from "bun:test";
import { resolveHeadPathname, shouldIncludePublicStyles } from "./publicHeadAssets";

describe("public head asset routing", () => {
  test("uses the leaf match pathname instead of the root route pathname", () => {
    const matches = [{ pathname: "/" }, { pathname: "/admin/volunteers" }];

    expect(resolveHeadPathname(matches, "/")).toBe("/admin/volunteers");
  });

  test("omits public styles from admin routes while including them on public routes", () => {
    expect(shouldIncludePublicStyles("/admin")).toBe(false);
    expect(shouldIncludePublicStyles("/admin/volunteers")).toBe(false);
    expect(shouldIncludePublicStyles("/")).toBe(true);
    expect(shouldIncludePublicStyles("/volunteer")).toBe(true);
    expect(shouldIncludePublicStyles("/administrator")).toBe(true);
  });
});
