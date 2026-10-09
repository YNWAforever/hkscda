import { getFirstAllowedAdminRoute, type AdminIdentity } from "./access";

const ADMIN_LOGIN_PATH = "/admin/login";

/** Pages that must never be a sign-in destination: sending staff back there would loop. */
const NON_DESTINATION_PATHS = new Set([ADMIN_LOGIN_PATH, "/admin/reset-password"]);

/**
 * The page to return to after sign-in, or `null` when `value` is not a safe in-app admin
 * path. `redirect` comes from the URL, so anything that could leave the origin (a second
 * slash, a backslash, a scheme, control characters) or bounce between the auth pages is
 * refused rather than repaired.
 */
export function safeAdminRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\/admin(?:[/?#]|$)/.test(value)) return null;
  if (value.includes("//") || value.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, "");
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

/** Where to go once signed in: the page asked for, else the role's first allowed page. */
export function postSignInDestination(
  redirectParam: unknown,
  admin: AdminIdentity | null | undefined,
): string {
  const requested = safeAdminRedirect(redirectParam);
  if (requested !== null) return requested;
  // Without an identity there is no role to ask; /admin picks the page for the role itself.
  return admin ? getFirstAllowedAdminRoute(admin.role) : "/admin";
}
