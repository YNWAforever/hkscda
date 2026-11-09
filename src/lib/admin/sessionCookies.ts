/** Cookie names and flags for the admin session BFF. Server-only. */
export const ADMIN_ACCESS_COOKIE = "hkscda-admin-access";
export const ADMIN_REFRESH_COOKIE = "hkscda-admin-refresh";

/**
 * Both cookies are scoped to the session endpoints. Data endpoints keep using the Bearer
 * token from the browser's memory store, so the cookies are never attached to them.
 */
export const ADMIN_SESSION_COOKIE_PATH = "/api/admin/session";

export function serializeSessionCookie(name: string, value: string, maxAgeSeconds: number) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${ADMIN_SESSION_COOKIE_PATH}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearSessionCookie(name: string) {
  return serializeSessionCookie(name, "", 0);
}

/** Reads one cookie from a `Cookie` header without adding a dependency. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}
