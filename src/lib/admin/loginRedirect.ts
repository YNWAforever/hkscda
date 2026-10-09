import {
  canRoleAccessAdminArea,
  getAdminAreaForLocation,
  getFirstAllowedAdminRoute,
  type AdminDashboardSection,
  type AdminIdentity,
} from "./access";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_SCOPE = /^\/admin(?:\/|$)/;

/** Pages that must never be a sign-in destination: sending staff back there would loop. */
const NON_DESTINATION_PATHS = new Set([ADMIN_LOGIN_PATH, "/admin/reset-password"]);

/** A `.` or `..` segment, in any `%2e` spelling: it would resolve out of `/admin/`. */
const DOT_SEGMENT = /(?:^|\/)(?:\.|%2e){1,2}(?:\/|[?#]|$)/i;

/**
 * The page to return to after sign-in, or `null` when `value` is not a safe in-app admin
 * path. `redirect` comes from the URL, so anything that could leave the origin (a second
 * slash, a backslash, a scheme, control characters), climb out of `/admin/` with dot
 * segments, or bounce between the auth pages is refused rather than repaired.
 */
export function safeAdminRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\/admin(?:[/?#]|$)/.test(value)) return null;
  if (value.includes("//") || value.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return null;
  if (DOT_SEGMENT.test(value)) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, "http://x");
  } catch {
    return null;
  }
  // Belt and braces: whatever the browser would resolve it to must still be inside /admin.
  if (resolved.origin !== "http://x" || !ADMIN_SCOPE.test(resolved.pathname)) return null;
  const path = resolved.pathname.replace(/\/+$/, "");
  if (NON_DESTINATION_PATHS.has(path)) return null;
  return value;
}

/** The sign-in URL that returns to `pathWithSearch` afterwards; plain sign-in if it is unsafe. */
export function loginUrlFor(pathWithSearch: string): string {
  const destination = safeAdminRedirect(pathWithSearch);
  return destination === null
    ? ADMIN_LOGIN_PATH
    : `${ADMIN_LOGIN_PATH}?redirect=${encodeURIComponent(destination)}`;
}

function roleCanOpen(admin: AdminIdentity, path: string): boolean {
  const url = new URL(path, "http://x");
  const section = url.searchParams.get("section") as AdminDashboardSection | null;
  const area = getAdminAreaForLocation({
    pathname: url.pathname.replace(/\/+$/, "") || "/admin",
    section: section ?? undefined,
  });
  return canRoleAccessAdminArea(admin.role, area);
}

/**
 * Where to go once signed in: the page asked for when it is safe and the role can open it,
 * else the role's first allowed page (so staff never land on access-denied).
 */
export function postSignInDestination(
  redirectParam: unknown,
  admin: AdminIdentity | null | undefined,
): string {
  const requested = safeAdminRedirect(redirectParam);
  if (!admin) {
    // Unlike firstAllowedAdminRouteForIdentity (which answers /admin/login for no identity, the
    // one place we must not send someone who just signed in), /admin picks the page by role.
    return requested ?? "/admin";
  }
  if (requested !== null && roleCanOpen(admin, requested)) return requested;
  return getFirstAllowedAdminRoute(admin.role);
}
