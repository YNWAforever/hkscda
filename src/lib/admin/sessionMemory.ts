/**
 * The admin access token lives only in this module's memory.
 *
 * The persistent half of the session is an HttpOnly, Secure, SameSite=Strict refresh cookie
 * scoped to `/api/admin/session` (set by the BFF endpoints), so no admin JWT is written to
 * `localStorage`/`sessionStorage` and an XSS cannot read a long-lived credential. A page load
 * bootstraps by calling `/refresh`; the returned access token is kept here for the tab's
 * lifetime (Bearer requests to the unchanged data APIs) and re-obtained on reload before it
 * expires.
 */
export type AdminSessionTokenSet = {
  accessToken: string;
  /** Unix epoch milliseconds. */
  expiresAt: number;
  /** The Supabase auth user id, used to fence requests against account switches. */
  authUserId: string;
};

export const ADMIN_SESSION_LOGIN_PATH = "/api/admin/session/login";
export const ADMIN_SESSION_REFRESH_PATH = "/api/admin/session/refresh";
export const ADMIN_SESSION_LOGOUT_PATH = "/api/admin/session/logout";

/** Treat a token this close to expiry as gone, so a request cannot race the clock. */
const EXPIRY_SKEW_MS = 5_000;

let current: AdminSessionTokenSet | null = null;
let refreshInFlight: Promise<AdminSessionTokenSet> | null = null;
const listeners = new Set<() => void>();

/** Why a session request did not produce a usable token. */
export type AdminSessionRequestFailure = "invalid_credentials" | "rate_limited" | "unavailable";

export class AdminSessionRequestError extends Error {
  constructor(readonly reason: AdminSessionRequestFailure) {
    super(`Admin session request failed: ${reason}`);
    this.name = "AdminSessionRequestError";
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function adminSessionSnapshot(): AdminSessionTokenSet | null {
  return current;
}

/** The token only while it can still be used; an expired one is treated as absent. */
export function adminSessionUsable(): AdminSessionTokenSet | null {
  if (!current || current.expiresAt - EXPIRY_SKEW_MS <= Date.now()) return null;
  return current;
}

export function setAdminSession(tokens: AdminSessionTokenSet) {
  current = tokens;
  notify();
}

export function clearAdminSession() {
  if (current === null) return;
  current = null;
  notify();
}

/** Notifies on every session change (token set, refreshed token, cleared session). */
export function subscribeAdminSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies `listener` only when a session that existed is gone — the admin shell uses this as
 * the sign-out/expiry signal that used to come from Supabase's `SIGNED_OUT` event.
 */
export function subscribeAdminSessionCleared(listener: () => void) {
  let hadSession = current !== null;
  return subscribeAdminSession(() => {
    const hasSession = current !== null;
    if (hadSession && !hasSession) listener();
    hadSession = hasSession;
  });
}

function parseTokenSet(value: unknown): AdminSessionTokenSet {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (
    !body ||
    typeof body.accessToken !== "string" ||
    !body.accessToken ||
    typeof body.expiresAt !== "number" ||
    !Number.isFinite(body.expiresAt) ||
    typeof body.authUserId !== "string" ||
    !body.authUserId
  ) {
    throw new AdminSessionRequestError("unavailable");
  }
  return {
    accessToken: body.accessToken,
    expiresAt: body.expiresAt,
    authUserId: body.authUserId,
  };
}

async function postSession(path: string, body?: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function failureFor(status: number): AdminSessionRequestError {
  if (status === 401) return new AdminSessionRequestError("invalid_credentials");
  if (status === 429) return new AdminSessionRequestError("rate_limited");
  return new AdminSessionRequestError("unavailable");
}

/** Single-flight: concurrent callers share one `/refresh` request. */
export async function refreshAdminSession(): Promise<AdminSessionTokenSet> {
  refreshInFlight ??= (async () => {
    try {
      const response = await postSession(ADMIN_SESSION_REFRESH_PATH);
      if (!response.ok) {
        clearAdminSession();
        throw failureFor(response.status);
      }
      const tokens = parseTokenSet(await response.json());
      setAdminSession(tokens);
      return tokens;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** A token for a request: the cached one while usable, otherwise a refresh. */
export async function ensureAdminSession(): Promise<AdminSessionTokenSet> {
  const usable = adminSessionUsable();
  if (usable) return usable;
  return refreshAdminSession();
}

/** Page-load bootstrap: refreshes only when this tab has no usable token. Never throws. */
export async function bootstrapAdminSession(): Promise<AdminSessionTokenSet | null> {
  // Any admin page load is a migration point away from the old persisted-browser-session
  // model; drop those legacy entries so an upgraded browser does not keep an old JWT.
  clearLegacyAdminTokenStorage();
  const usable = adminSessionUsable();
  if (usable) return usable;
  try {
    return await refreshAdminSession();
  } catch {
    return null;
  }
}

/** Sign-in: the BFF sets the cookies and this tab keeps the short-lived access token. */
export async function loginAdminSession(
  email: string,
  password: string,
): Promise<AdminSessionTokenSet> {
  const response = await postSession(ADMIN_SESSION_LOGIN_PATH, { email, password });
  if (!response.ok) throw failureFor(response.status);
  const tokens = parseTokenSet(await response.json());
  setAdminSession(tokens);
  return tokens;
}

/**
 * Sign-out: the BFF revokes the refresh token and clears the cookies even if that fails; the
 * in-memory token is dropped in every case. Legacy `sb-*-auth-token` web-storage entries from
 * the old browser-session model are removed too, so an upgrade cannot keep a stale JWT there.
 */
export async function logoutAdminSession(): Promise<void> {
  try {
    await postSession(ADMIN_SESSION_LOGOUT_PATH);
  } catch {
    /* Clearing local state below is what makes the sign-out reliable. */
  } finally {
    clearAdminSession();
    clearLegacyAdminTokenStorage();
  }
}

/**
 * Removes pre-BFF Supabase session entries from `localStorage`. Admin code no longer reads
 * them; this is the migration cleanup so no old admin JWT lingers in web storage.
 */
export function clearLegacyAdminTokenStorage() {
  if (typeof window === "undefined") return;
  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) storage.removeItem(key);
    }
  } catch {
    /* Optional storage. */
  }
}
