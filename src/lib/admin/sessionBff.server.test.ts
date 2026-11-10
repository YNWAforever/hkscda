import { describe, expect, mock, test } from "bun:test";

import {
  AdminAuthProviderError,
  createAdminSessionBff,
  isCrossSiteRequest,
  type AdminAuthProvider,
  type AdminTokenSet,
} from "./sessionBff.server";

const ORIGIN = "https://admin.example";
const URL_BASE = `${ORIGIN}/api/admin/session`;

const tokens: AdminTokenSet = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: 2_000_000,
  authUserId: "auth-a",
};

function post(path: string, init: RequestInit = {}) {
  return new Request(`${URL_BASE}/${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: init.body,
  });
}

function createAuth(overrides: Partial<AdminAuthProvider> = {}) {
  return {
    signIn: mock(async () => tokens),
    refresh: mock(async () => ({ ...tokens, accessToken: "access-2", refreshToken: "refresh-2" })),
    revoke: mock(async () => {}),
    ...overrides,
  } satisfies AdminAuthProvider;
}

function createBff(overrides: Partial<Parameters<typeof createAdminSessionBff>[0]> = {}) {
  const auth = createAuth();
  const bff = createAdminSessionBff({
    auth,
    getClientIp: () => "203.0.113.7",
    now: () => 1_000_000,
    ...overrides,
  });
  return { bff, auth };
}

function cookiesOf(response: Response) {
  return response.headers.getSetCookie();
}

function cookieNamed(response: Response, name: string) {
  return cookiesOf(response).find((cookie) => cookie.startsWith(`${name}=`)) ?? "";
}

describe("admin session BFF", () => {
  test("login sets HttpOnly, Secure, SameSite=Strict session cookies on the session path", async () => {
    const { bff, auth } = createBff();

    const response = await bff.login({
      request: post("login", { body: JSON.stringify({ email: " A@B.CO ", password: "secret" }) }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: "access-1",
      expiresAt: 2_000_000,
      authUserId: "auth-a",
    });
    expect(auth.signIn).toHaveBeenCalledWith("a@b.co", "secret");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const access = cookieNamed(response, "hkscda-admin-access");
    const refresh = cookieNamed(response, "hkscda-admin-refresh");
    for (const cookie of [access, refresh]) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/api/admin/session");
    }
    expect(access).toContain("hkscda-admin-access=access-1");
    expect(refresh).toContain("hkscda-admin-refresh=refresh-1");
  });

  test("every session endpoint rejects a cross-origin or origin-less request", async () => {
    const { bff, auth } = createBff();

    const crossOrigin = await bff.login({
      request: post("login", { body: "{}", headers: { origin: "https://evil.example" } }),
    });
    const noOrigin = await bff.login({
      request: new Request(`${URL_BASE}/refresh`, { method: "POST" }),
    });
    const crossSiteFetch = await bff.login({
      request: post("login", { body: "{}", headers: { "sec-fetch-site": "cross-site" } }),
    });

    expect(crossOrigin.status).toBe(403);
    expect(noOrigin.status).toBe(403);
    expect(crossSiteFetch.status).toBe(403);
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(isCrossSiteRequest(post("login"))).toBe(false);
  });

  test("login is rate limited and reports a 429 without calling the provider", async () => {
    const { bff, auth } = createBff({
      rateLimit: async () => ({ ok: false, unavailable: false, reset: 0 }),
    });

    const response = await bff.login({
      request: post("login", { body: JSON.stringify({ email: "a@b.co", password: "secret" }) }),
    });

    expect(response.status).toBe(429);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  test("a rate limiter outage fails closed with 503", async () => {
    const { bff } = createBff({ rateLimit: async () => ({ ok: false, unavailable: true }) });
    const response = await bff.login({
      request: post("login", { body: JSON.stringify({ email: "a@b.co", password: "secret" }) }),
    });
    expect(response.status).toBe(503);
  });

  test("invalid credentials are a 401 without set-cookie", async () => {
    const { bff } = createBff({
      auth: createAuth({
        signIn: async () => {
          throw new AdminAuthProviderError("invalid_credentials");
        },
      }),
    });

    const response = await bff.login({
      request: post("login", { body: JSON.stringify({ email: "a@b.co", password: "nope" }) }),
    });

    expect(response.status).toBe(401);
    expect(cookiesOf(response)).toEqual([]);
  });

  test("malformed bodies are a 400 and an oversized one a 413", async () => {
    const { bff } = createBff();

    const invalid = await bff.login({
      request: post("login", { body: JSON.stringify({ email: "x" }) }),
    });
    expect(invalid.status).toBe(400);

    const broken = await bff.login({ request: post("login", { body: "{not json" }) });
    expect(broken.status).toBe(400);
  });

  test("refresh rotates the refresh cookie and returns a new access token", async () => {
    const { bff, auth } = createBff();

    const response = await bff.refresh({
      request: post("refresh", {
        headers: { cookie: "hkscda-admin-access=access-1; hkscda-admin-refresh=refresh-1" },
      }),
    });

    expect(response.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith("refresh-1");
    expect(await response.json()).toMatchObject({ accessToken: "access-2" });
    expect(cookieNamed(response, "hkscda-admin-refresh")).toContain(
      "hkscda-admin-refresh=refresh-2",
    );
  });

  test("refresh without a cookie is a 401 that clears both cookies", async () => {
    const { bff } = createBff();
    const response = await bff.refresh({ request: post("refresh") });
    expect(response.status).toBe(401);
    const cleared = cookiesOf(response).join(";");
    expect(cleared).toContain("hkscda-admin-access=;");
    expect(cleared).toContain("hkscda-admin-refresh=;");
    expect(cleared).toContain("Max-Age=0");
  });

  test("an invalid refresh token is a 401 that clears the cookies", async () => {
    const { bff } = createBff({
      auth: createAuth({
        refresh: async () => {
          throw new AdminAuthProviderError("invalid_credentials");
        },
      }),
    });
    const response = await bff.refresh({
      request: post("refresh", { headers: { cookie: "hkscda-admin-refresh=stale" } }),
    });
    expect(response.status).toBe(401);
    expect(cookiesOf(response).join(";")).toContain("hkscda-admin-refresh=;");
  });

  test("logout revokes the refresh token and clears the cookies even when revoke fails", async () => {
    const revoke = mock(async () => {
      throw new Error("provider down");
    });
    const { bff } = createBff({ auth: createAuth({ revoke }) });

    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await bff.logout({
        request: post("logout", {
          headers: { cookie: "hkscda-admin-access=access-1; hkscda-admin-refresh=refresh-1" },
        }),
      });

      expect(revoke).toHaveBeenCalledWith("access-1", "refresh-1");
      expect(response.status).toBe(200);
      expect(cookiesOf(response).join(";")).toContain("hkscda-admin-refresh=;");
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      console.error = originalError;
    }
  });

  test("logout without cookies still clears state and does not call the provider", async () => {
    const { bff, auth } = createBff();
    const response = await bff.logout({ request: post("logout") });
    expect(response.status).toBe(200);
    expect(auth.revoke).not.toHaveBeenCalled();
    expect(cookiesOf(response).join(";")).toContain("HttpOnly");
  });

  test("non-POST methods are refused", async () => {
    const { bff } = createBff();
    const response = await bff.login({
      request: new Request(`${URL_BASE}/login`, {
        method: "GET",
        headers: { origin: ORIGIN, "sec-fetch-site": "same-origin" },
      }),
    });
    expect(response.status).toBe(405);
  });
});
