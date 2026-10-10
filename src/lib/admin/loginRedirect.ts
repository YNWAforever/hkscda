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

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * `pathname` as the router matches it: percent-decoded, lower-cased (routes match
 * case-insensitively) and without a trailing slash, so `/admin/%6Cogin/` and `/admin/Login`
 * both read as `/admin/login`. `null` when it is not valid percent-encoding.
 */
export function routeMatchPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return decoded.toLowerCase().replace(/\/+$/, "");
}

/** Whether `pathname` is, or is under, one of the sign-in pages, however it is spelled. */
export function isAdminAuthPath(pathname: string): boolean {
  const path = routeMatchPath(pathname);
  if (path === null) return false;
  for (const authPath of NON_DESTINATION_PATHS) {
    if (path === authPath || path.startsWith(`${authPath}/`)) return true;
  }
  return false;
}

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
  // An encoded slash or backslash could become a real separator in a server or proxy that
  // decodes before it normalises, so none is accepted.
  if (/%2f|%5c/i.test(value)) return null;
  if (DOT_SEGMENT.test(value)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (DOT_SEGMENT.test(decoded)) return null;
  // `%00` and its kind are refused as firmly as the raw characters above.
  if (CONTROL_CHARACTER.test(decoded)) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, "http://x");
  } catch {
    return null;
  }
  // Belt and braces: whatever the browser would resolve it to must still be inside /admin.
  if (resolved.origin !== "http://x" || !ADMIN_SCOPE.test(resolved.pathname)) return null;
  // Compared as the router matches it, so no spelling of a sign-in page gets through.
  const path = routeMatchPath(resolved.pathname);
  if (path === null || NON_DESTINATION_PATHS.has(path)) return null;
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
