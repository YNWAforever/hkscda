import { afterEach, beforeEach, expect, test } from "bun:test";

import { Route } from "./list";

// Drives the real route with the real requireAdmin: only the network is faked.
const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const staffAuthUserId = "22222222-3333-4333-8444-555555555555";
let requestedPaths: string[] = [];

function requestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  requestedPaths = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const fakeFetch = async (input: string | URL | Request) => {
    const { pathname } = new URL(requestUrl(input));
    requestedPaths.push(pathname);
    if (pathname === "/auth/v1/user") {
      return Response.json({
        id: staffAuthUserId,
        aud: "authenticated",
        role: "authenticated",
        email: "staff@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (pathname === "/rest/v1/admin_user") {
      return Response.json([
        {
          id: "staff-row",
          auth_user_id: staffAuthUserId,
          email: "staff@example.test",
          role: "staff",
          status: "active",
        },
      ]);
    }
    if (pathname === "/rest/v1/animals") {
      return Response.json([], { headers: { "content-range": "*/0" } });
    }
    return Response.json({ message: "unexpected request" }, { status: 500 });
  };
  globalThis.fetch = Object.assign(fakeFetch, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function getList(search: string) {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.GET : undefined;
  if (!handler) throw new Error("Animal list GET handler missing");
  try {
    const response = await handler({
      request: new Request(`http://localhost/api/admin/animals/list?${search}`, {
        headers: { authorization: "Bearer staff-token" },
      }),
      params: {},
    } as never);
    if (!(response instanceof Response)) throw new Error("Expected HTTP response");
    return { status: response.status, thrown: null };
  } catch (error) {
    // An unwrapped throw becomes the framework's generic 500.
    return { status: 500, thrown: error instanceof Error ? error.message : String(error) };
  }
}

test("BUG-15: /api/admin/animals/list with section=applications answers 400, not a thrown 500", async () => {
  const result = await getList("section=applications");

  expect(requestedPaths).toContain("/auth/v1/user");
  expect(result).toEqual({ status: 400, thrown: null });
});
