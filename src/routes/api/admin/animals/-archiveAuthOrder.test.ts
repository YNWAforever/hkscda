import { afterEach, beforeEach, expect, test } from "bun:test";

import { Route } from "./$id/archive";

// Drives the real route with the real requireAdmin: only the network is faked.
// Supabase Auth answers 401 for every token, as it does for a forged one.
const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const animalId = "11111111-1111-4111-8111-111111111111";
let requestedUrls: string[] = [];

function requestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  requestedUrls = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const fakeFetch = async (input: string | URL | Request) => {
    const url = requestUrl(input);
    requestedUrls.push(url);
    if (new URL(url).pathname === "/auth/v1/user") {
      return Response.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
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

async function postArchive(init: RequestInit) {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal archive POST handler missing");
  const response = await handler({
    request: new Request(`http://localhost/api/admin/animals/${animalId}/archive`, {
      method: "POST",
      ...init,
    }),
    params: { id: animalId },
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  return response;
}

test("BUG-26: archive without Authorization and with an empty body returns 401 before body validation", async () => {
  const response = await postArchive({});
  expect(response.status).toBe(401);
});

test("BUG-26: archive without Authorization and with an invalid body returns 401 before body validation", async () => {
  const response = await postArchive({ body: JSON.stringify({ archived: "yes" }) });
  expect(response.status).toBe(401);
});

test("BUG-26: archive with a rejected bearer token and an invalid body returns 401", async () => {
  const response = await postArchive({
    headers: { authorization: "Bearer forged-token" },
    body: "{not json",
  });
  expect(response.status).toBe(401);
  expect(requestedUrls.some((url) => url.endsWith("/auth/v1/user"))).toBe(true);
});
