import { z } from "zod";

import {
  InvalidRequestJsonError,
  readPublicJson,
  RequestBodyTooLargeError,
} from "../http/publicJson.server";
import type { RateLimitResult } from "../security/rate-limit.server";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearSessionCookie,
  readCookie,
  serializeSessionCookie,
} from "./sessionCookies";

/** A Supabase session as the BFF needs it: tokens plus the account they belong to. */
export type AdminTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch milliseconds at which the access token expires. */
  expiresAt: number;
  /** The Supabase auth user id (`sub`), used only to fence the in-memory client store. */
  authUserId: string;
};

export type AdminAuthProviderErrorKind = "invalid_credentials" | "rate_limited" | "unavailable";

export class AdminAuthProviderError extends Error {
  constructor(
    readonly kind: AdminAuthProviderErrorKind,
    message = "Admin authentication failed",
  ) {
    super(message);
    this.name = "AdminAuthProviderError";
  }
}

/**
 * The three Supabase Auth operations the BFF performs. Dependency-injected so the endpoint
 * behaviour (cookies, CSRF, rotation, errors) is tested without a network or a project.
 */
export type AdminAuthProvider = {
  signIn(email: string, password: string): Promise<AdminTokenSet>;
  refresh(refreshToken: string): Promise<AdminTokenSet>;
  /** Best effort: revokes the refresh token for this browser session. */
  revoke(accessToken: string, refreshToken: string): Promise<void>;
};

export type AdminSessionBffDeps = {
  auth: AdminAuthProvider;
  /** Only login is rate limited with the existing limiter. */
  rateLimit?: (identifier: string) => Promise<RateLimitResult>;
  getClientIp: (request: Request) => string;
  now?: () => number;
};

const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(1024),
});

const NO_STORE = { "cache-control": "no-store" };

const LOGIN_RATE_LIMITED = "Too many sign-in attempts. Please try again shortly.";
const UNAVAILABLE = "Sign-in is temporarily unavailable. Please try again later.";

function json(body: unknown, init: ResponseInit & { cookies?: string[] } = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  for (const cookie of init.cookies ?? []) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status: init.status, headers });
}

/**
 * CSRF guard for the session endpoints. They are same-origin browser calls only, so a
 * missing or mismatched `Origin` is refused (browsers send it on every POST), and a
 * `Sec-Fetch-Site` that names another site is refused too. `none` is allowed because a
 * top-level navigation from a bookmarked page is still the same origin posting.
 */
export function isCrossSiteRequest(request: Request): boolean {
  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch {
    return true;
  }
  const requestedOrigin = request.headers.get("origin");
  if (!requestedOrigin || requestedOrigin !== origin) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return true;
  return false;
}

function setSessionCookies(tokens: AdminTokenSet, now: () => number) {
  const accessMaxAge = Math.max(1, Math.ceil((tokens.expiresAt - now()) / 1000));
  return [
    serializeSessionCookie(ADMIN_ACCESS_COOKIE, tokens.accessToken, accessMaxAge),
    serializeSessionCookie(ADMIN_REFRESH_COOKIE, tokens.refreshToken, 60 * 60 * 24 * 30),
  ];
}

function clearedCookies() {
  return [clearSessionCookie(ADMIN_ACCESS_COOKIE), clearSessionCookie(ADMIN_REFRESH_COOKIE)];
}

function methodNotAllowed(request: Request) {
  if (request.method === "POST") return null;
  return json({ error: "Method not allowed" }, { status: 405, headers: NO_STORE });
}

function providerFailure(error: unknown): Response {
  if (error instanceof AdminAuthProviderError) {
    if (error.kind === "invalid_credentials")
      return json({ error: "Email or password is incorrect" }, { status: 401 });
    if (error.kind === "rate_limited") return json({ error: LOGIN_RATE_LIMITED }, { status: 429 });
  }
  console.error("Admin session provider failure", error);
  return json({ error: UNAVAILABLE }, { status: 503 });
}

async function readLoginBody(request: Request): Promise<unknown> {
  try {
    return await readPublicJson(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw json({ error: "Request body too large" }, { status: 413 });
    if (error instanceof InvalidRequestJsonError)
      throw json({ error: "Invalid JSON body" }, { status: 400 });
    throw error;
  }
}

/**
 * The bounded session BFF: login/refresh/logout only. Data endpoints keep their Bearer-token
 * contract; only these three responses set cookies, and the cookies never leave the
 * `/api/admin/session` path.
 */
export function createAdminSessionBff(deps: AdminSessionBffDeps) {
  const now = deps.now ?? (() => Date.now());

  return {
    /** `POST /api/admin/session/login` — email+password, sets the session cookies. */
    async login({ request }: { request: Request }): Promise<Response> {
      const methodError = methodNotAllowed(request);
      if (methodError) return methodError;
      if (isCrossSiteRequest(request))
        return json({ error: "Cross-origin request rejected" }, { status: 403 });

      if (deps.rateLimit) {
        const limit = await deps.rateLimit(deps.getClientIp(request));
        if (limit.unavailable) return json({ error: UNAVAILABLE }, { status: 503 });
        if (!limit.ok) {
          return json(
            { error: LOGIN_RATE_LIMITED },
            { status: 429, headers: { "retry-after": "60" } },
          );
        }
      }

      let parsed: z.infer<typeof loginBodySchema>;
      try {
        const body = await readLoginBody(request);
        const result = loginBodySchema.safeParse(body);
        if (!result.success) return json({ error: "Invalid sign-in request" }, { status: 400 });
        parsed = result.data;
      } catch (error) {
        if (error instanceof Response) return error;
        throw error;
      }

      try {
        const tokens = await deps.auth.signIn(parsed.email, parsed.password);
        return json(
          {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            authUserId: tokens.authUserId,
          },
          { status: 200, cookies: setSessionCookies(tokens, now) },
        );
      } catch (error) {
        return providerFailure(error);
      }
    },

    /** `POST /api/admin/session/refresh` — rotates the refresh cookie and returns a new access token. */
    async refresh({ request }: { request: Request }): Promise<Response> {
      const methodError = methodNotAllowed(request);
      if (methodError) return methodError;
      if (isCrossSiteRequest(request))
        return json({ error: "Cross-origin request rejected" }, { status: 403 });

      const refreshToken = readCookie(request.headers.get("cookie"), ADMIN_REFRESH_COOKIE);
      if (!refreshToken) {
        return json({ error: "Session expired" }, { status: 401, cookies: clearedCookies() });
      }

      try {
        const tokens = await deps.auth.refresh(refreshToken);
        return json(
          {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            authUserId: tokens.authUserId,
          },
          { status: 200, cookies: setSessionCookies(tokens, now) },
        );
      } catch (error) {
        const response = providerFailure(error);
        if (response.status === 401 || response.status === 503) {
          response.headers.append("set-cookie", clearSessionCookie(ADMIN_ACCESS_COOKIE));
          response.headers.append("set-cookie", clearSessionCookie(ADMIN_REFRESH_COOKIE));
        }
        return response;
      }
    },

    /** `POST /api/admin/session/logout` — revokes the refresh token when possible, clears cookies. */
    async logout({ request }: { request: Request }): Promise<Response> {
      const methodError = methodNotAllowed(request);
      if (methodError) return methodError;
      if (isCrossSiteRequest(request))
        return json({ error: "Cross-origin request rejected" }, { status: 403 });

      const cookies = request.headers.get("cookie");
      const accessToken = readCookie(cookies, ADMIN_ACCESS_COOKIE);
      const refreshToken = readCookie(cookies, ADMIN_REFRESH_COOKIE);
      if (accessToken && refreshToken) {
        await deps.auth.revoke(accessToken, refreshToken).catch((error: unknown) => {
          // Clearing the browser's cookies is what makes sign-out local and reliable; the
          // server-side revocation is best effort (expired access token, provider outage).
          console.error("Admin session revoke failed", error);
        });
      }

      return json({ ok: true }, { status: 200, cookies: clearedCookies() });
    },
  };
}
