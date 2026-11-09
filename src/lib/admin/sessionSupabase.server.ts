import { getClientIp, enforceRateLimit } from "../security/rate-limit.server";
import {
  AdminAuthProviderError,
  createAdminSessionBff,
  type AdminAuthProvider,
  type AdminTokenSet,
} from "./sessionBff.server";

type AdminAuthConfig = { url: string; anonKey: string };

function readConfig(): AdminAuthConfig {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing public Supabase configuration for the admin session BFF");
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

/** `sub` from the access token. The token arrived from Supabase over TLS; no local re-check. */
function authUserIdFromToken(accessToken: string): string {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) throw new Error("missing payload");
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(
      Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64").toString(
        "utf8",
      ),
    ) as { sub?: unknown };
    if (typeof decoded.sub !== "string" || !decoded.sub) throw new Error("missing sub");
    return decoded.sub;
  } catch {
    throw new AdminAuthProviderError("unavailable", "Admin access token had no subject");
  }
}

type GoTrueTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  expires_at?: unknown;
};

function providerError(status: number): AdminAuthProviderError {
  if (status === 429) return new AdminAuthProviderError("rate_limited");
  if (status === 400 || status === 401 || status === 403)
    return new AdminAuthProviderError("invalid_credentials");
  return new AdminAuthProviderError("unavailable");
}

function tokenSet(body: GoTrueTokenResponse, now: () => number): AdminTokenSet {
  if (
    typeof body.access_token !== "string" ||
    typeof body.refresh_token !== "string" ||
    (typeof body.expires_at !== "number" && typeof body.expires_in !== "number")
  ) {
    throw new AdminAuthProviderError("unavailable", "Supabase returned no usable session");
  }
  const expiresAt =
    typeof body.expires_at === "number"
      ? body.expires_at * 1000
      : now() + (body.expires_in as number) * 1000;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt,
    authUserId: authUserIdFromToken(body.access_token),
  };
}

/**
 * Production provider: Supabase Auth's GoTrue endpoints called with the project's anon key.
 * The session never touches the browser's storage — the BFF holds the tokens in HttpOnly
 * cookies and hands only the short-lived access token back for the in-memory store.
 */
export function createSupabaseAdminAuthProvider(
  config: AdminAuthConfig = readConfig(),
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Date.now(),
): AdminAuthProvider {
  async function post(path: string, headers: Record<string, string>, body: unknown) {
    try {
      return await fetchImpl(`${config.url}${path}`, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new AdminAuthProviderError(
        "unavailable",
        `Supabase Auth unreachable: ${String(error)}`,
      );
    }
  }

  return {
    async signIn(email, password) {
      const response = await post("/auth/v1/token?grant_type=password", {}, { email, password });
      if (!response.ok) throw providerError(response.status);
      return tokenSet((await response.json()) as GoTrueTokenResponse, now);
    },

    async refresh(refreshToken) {
      const response = await post(
        "/auth/v1/token?grant_type=refresh_token",
        {},
        { refresh_token: refreshToken },
      );
      if (!response.ok) throw providerError(response.status);
      return tokenSet((await response.json()) as GoTrueTokenResponse, now);
    },

    async revoke(accessToken, refreshToken) {
      const response = await post(
        "/auth/v1/logout?scope=local",
        { authorization: `Bearer ${accessToken}` },
        { refresh_token: refreshToken },
      );
      // An expired access token cannot authorise the revocation; the cookies are cleared
      // regardless, and the refresh token will expire on its own. Anything else is logged by
      // the caller, never surfaced to the browser.
      if (!response.ok && response.status >= 500) {
        throw new AdminAuthProviderError("unavailable", "Supabase logout failed");
      }
    },
  };
}

/** Live wiring for the three session routes. */
export function createLiveAdminSessionBff() {
  return createAdminSessionBff({
    auth: createSupabaseAdminAuthProvider(),
    getClientIp,
    // Same limiter as the public forms, fail-open when Upstash is not configured: an admin
    // must not be locked out of sign-in because the optional rate limiter is absent.
    rateLimit: (identifier) =>
      enforceRateLimit(identifier, {
        prefix: "admin-session-login",
        max: 10,
        window: "1 m",
      }),
  });
}
