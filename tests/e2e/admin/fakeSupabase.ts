/**
 * A fake Supabase for the admin E2E suite. It answers the requests the admin shell
 * needs to sign in and render: password and refresh-token grants, `auth/v1/user`,
 * logout, and the `admin_user` role lookup. Every other PostgREST read returns an
 * empty list and every RPC returns `[]`, unless a test overrides a path with
 * `respond()`. Nothing here talks to a real project.
 */

import type { AdminRole } from "../../../src/lib/admin/access";

export const E2E_PASSWORD = "Correct-Horse-Battery-1";

type Account = { id: string; email: string; role: AdminRole | null; status: string };

export const ACCOUNTS: Record<string, Account> = {
  admin: {
    id: "00000000-0000-4000-8000-0000000000a1",
    email: "admin@e2e.test",
    role: "admin",
    status: "active",
  },
  staff: {
    id: "00000000-0000-4000-8000-0000000000a2",
    email: "staff@e2e.test",
    role: "staff",
    status: "active",
  },
  treasurer: {
    id: "00000000-0000-4000-8000-0000000000a3",
    email: "treasurer@e2e.test",
    role: "treasurer",
    status: "active",
  },
  // Has a Supabase Auth account but no admin_user row: an ordinary signed-in user.
  member: {
    id: "00000000-0000-4000-8000-0000000000a4",
    email: "member@e2e.test",
    role: null,
    status: "",
  },
};

/** RPCs whose real return value is an object rather than a row list. */
const RPC_FIXTURES: Record<string, unknown> = {
  get_media_repair_backlog: { pending: 0, claimed: 0, failed: 0, oldestAgeSeconds: 0, items: [] },
};

type Override = (request: Request) => Response | Promise<Response>;

const base64url = (value: string) => Buffer.from(value).toString("base64url");

/** Unsigned JWT-shaped token; the fake decides validity by lookup, not signature. */
function tokenFor(account: Account, issued: number, expiresIn: number) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: account.id,
      email: account.email,
      role: "authenticated",
      aud: "authenticated",
      iat: Math.floor(issued / 1000),
      exp: Math.floor(issued / 1000) + expiresIn,
      session_id: crypto.randomUUID(),
    }),
  );
  return `${header}.${payload}.e2e-signature`;
}

export function startFakeSupabase(port: number) {
  const tokens = new Map<string, Account>();
  const refreshTokens = new Map<string, Account>();
  const overrides = new Map<string, Override>();
  const failedLogins = new Map<string, number>();
  const requests: string[] = [];

  function userJson(account: Account) {
    return {
      id: account.id,
      aud: "authenticated",
      role: "authenticated",
      email: account.email,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
  }

  function session(account: Account, expiresIn = 3600) {
    const now = Date.now();
    const accessToken = tokenFor(account, now, expiresIn);
    const refreshToken = crypto.randomUUID();
    tokens.set(accessToken, account);
    refreshTokens.set(refreshToken, account);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: Math.floor(now / 1000) + expiresIn,
      refresh_token: refreshToken,
      user: userJson(account),
    };
  }

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-expose-headers": "content-range,x-supabase-api-version",
  };
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { ...cors, ...headers } });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;
      requests.push(`${request.method} ${path}`);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      const override = overrides.get(`${request.method} ${path}`) ?? overrides.get(path);
      if (override) {
        const response = await override(request);
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        return response;
      }

      const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

      if (path === "/auth/v1/token") {
        const body = (await request.json()) as {
          email?: string;
          password?: string;
          refresh_token?: string;
        };
        if (url.searchParams.get("grant_type") === "refresh_token") {
          const account = refreshTokens.get(body.refresh_token ?? "");
          if (!account)
            return json(
              { error: "invalid_grant", error_description: "Invalid Refresh Token" },
              400,
            );
          return json(session(account));
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const account = Object.values(ACCOUNTS).find((candidate) => candidate.email === email);
        if (!account || body.password !== E2E_PASSWORD) {
          const failures = (failedLogins.get(email) ?? 0) + 1;
          failedLogins.set(email, failures);
          // Mirrors Supabase Auth's own rate limit, the only brute-force control on login.
          if (failures > 5)
            return json({ code: "over_request_rate_limit", msg: "rate limited" }, 429);
          return json(
            { error: "invalid_grant", error_description: "Invalid login credentials" },
            400,
          );
        }
        return json(session(account));
      }
      if (path === "/auth/v1/user") {
        const account = tokens.get(bearer);
        if (!account) return json({ code: 401, msg: "invalid JWT" }, 401);
        return json(userJson(account));
      }
      if (path === "/auth/v1/logout") {
        tokens.delete(bearer);
        return new Response(null, { status: 204, headers: cors });
      }
      if (path.startsWith("/auth/v1/")) return json({});

      if (path === "/rest/v1/admin_user") {
        const id = (url.searchParams.get("auth_user_id") ?? "").replace(/^eq\./, "");
        const account = Object.values(ACCOUNTS).find((candidate) => candidate.id === id);
        if (!account?.role) return json([]);
        return json([
          {
            id: account.id,
            auth_user_id: account.id,
            email: account.email,
            role: account.role,
            status: account.status,
          },
        ]);
      }
      const rpc = path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : null;
      if (rpc && rpc in RPC_FIXTURES) return json(RPC_FIXTURES[rpc]);
      if (rpc) return json([]);
      if (path.startsWith("/rest/v1/")) return json([], 200, { "content-range": "*/0" });
      if (path.startsWith("/storage/v1/")) return json({ message: "not found" }, 404);
      return json({ message: "unknown fake path" }, 404);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    /** Answer `path` (optionally `"METHOD path"`) with a custom response until `reset()`. */
    respond(key: string, override: Override) {
      overrides.set(key, override);
    },
    /** Revoke every access token, as an expired or revoked session would be. */
    revokeAllTokens() {
      tokens.clear();
      refreshTokens.clear();
    },
    reset() {
      overrides.clear();
      failedLogins.clear();
      requests.length = 0;
    },
    stop() {
      server.stop(true);
    },
  };
}

export type FakeSupabase = ReturnType<typeof startFakeSupabase>;
