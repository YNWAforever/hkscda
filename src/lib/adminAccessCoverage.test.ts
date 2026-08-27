import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { ADMIN_NAV_ITEMS } from "../components/admin/adminNav";
import { canRoleAccessAdminNavItem, type AdminRole } from "./admin/access";

const ROLES: AdminRole[] = ["staff", "treasurer", "admin"];

/**
 * Routes that must stay reachable without an admin role — you cannot require a
 * role to reach the page that tells you your role is insufficient, or the page
 * you sign in on.
 */
const PUBLIC_ADMIN_ROUTES = new Set([
  "src/routes/admin/login.tsx",
  "src/routes/admin/reset-password.tsx",
  "src/routes/admin/access-denied.tsx",
]);

/** `src/routes/admin/content/documents.tsx` -> `src/routes/admin/content.tsx` */
function parentLayoutRoute(file: string) {
  const layout = file.replace(/\/[^/]+\.tsx$/, ".tsx");
  return layout === file ? null : layout;
}

async function adminRouteFiles() {
  const paths = await Array.fromAsync(new Bun.Glob("src/routes/admin/**/*.tsx").scan("."));

  // Bun.Glob yields platform separators, so on Windows these arrive as
  // src\routes\admin\login.tsx. Every comparison that follows is written in
  // POSIX form - the "/-" private-route filter here, PUBLIC_ADMIN_ROUTES, and
  // parentLayoutRoute - so normalise once at the source rather than at each of
  // them. Without this the suite passes on Linux CI and fails on a Windows clone.
  return paths
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test.") && !path.includes("/-"));
}

describe("admin access coverage", () => {
  test("every admin nav item is reachable by at least one role", () => {
    // canRoleAccessAdminNavItem returns false when an item id has no entry in
    // NAV_ITEM_AREAS, so a missing mapping hides the link from *everyone*,
    // admins included — the feature silently disappears from the sidebar rather
    // than failing loudly. `coordinator-inbox` shipped that way.
    for (const item of ADMIN_NAV_ITEMS) {
      expect(
        ROLES.some((role) => canRoleAccessAdminNavItem(item.id, role)),
        `Nav item "${item.id}" is not reachable by any role. Add it to ` +
          `NAV_ITEM_AREAS in lib/admin/access.ts — without an area it is hidden ` +
          `from every role, including admin.`,
      ).toBe(true);
    }
  });

  test("every admin page route gates on a role", async () => {
    // /admin/coordinator/inbox checked only `supabase.auth.getSession()`, so any
    // signed-in admin_user reached it whatever their role, while its six sibling
    // coordinator routes each gated on a specific area. The API was still safe,
    // but a treasurer landed on a page whose only request then 403'd instead of
    // being redirected to access-denied.
    for (const file of await adminRouteFiles()) {
      if (PUBLIC_ADMIN_ROUTES.has(file)) continue;
      if (readFileSync(file, "utf8").includes("requireAdminPageAccess")) continue;

      // A child route is covered when its parent layout route gates for it —
      // how content/* and applications/* are handled.
      const layout = parentLayoutRoute(file);
      const coveredByLayout =
        layout !== null &&
        existsSync(layout) &&
        readFileSync(layout, "utf8").includes("requireAdminPageAccess");

      expect(
        coveredByLayout,
        `${file} does not call requireAdminPageAccess and has no parent layout ` +
          `route that does. Gate it on an area from lib/admin/access.ts, or add ` +
          `it to PUBLIC_ADMIN_ROUTES here if it is meant to be reachable ` +
          `without a role.`,
      ).toBe(true);
    }
  });
});
