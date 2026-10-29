import { afterEach, beforeEach, expect, test } from "bun:test";

import { Route } from "./$id/internal";

// Drives the real route with the real requireAdmin: only the network is faked.
const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const staffAuthUserId = "22222222-3333-4333-8444-555555555555";
const unknownAnimalId = "99999999-8888-4777-8666-555555555555";
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
    if (pathname === "/rest/v1/rpc/upsert_animal_internal_profile_with_audit") {
      // What PostgREST returns when the animal_id foreign key has no animal.
      return Response.json(
        {
          code: "23503",
          details: `Key (animal_id)=(${unknownAnimalId}) is not present in table "animals".`,
          hint: null,
          message:
            'insert or update on table "animal_profile_internal" violates foreign key constraint "animal_profile_internal_animal_id_fkey"',
        },
        { status: 409 },
      );
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

function fullProfile() {
  return {
    internal_code: "CAT-204",
    arrival_date: "2026-06-15",
    arrival_source_id: null,
    current_position_id: null,
    cage: "A-12",
    has_chip: false,
    chip_remarks: null,
    is_desexed: true,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: false,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
  };
}

test("BUG-15: internal-profile PUT for an unknown animal (23503) returns 404, not 500", async () => {
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.PUT : undefined;
  if (!handler) throw new Error("Internal profile PUT handler missing");

  const response = await handler({
    request: new Request(
      `http://localhost/api/admin/adoptions/animals/${unknownAnimalId}/internal`,
      {
        method: "PUT",
        headers: { authorization: "Bearer staff-token", "content-type": "application/json" },
        body: JSON.stringify(fullProfile()),
      },
    ),
    params: { id: unknownAnimalId },
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");

  expect(requestedPaths).toContain("/rest/v1/rpc/upsert_animal_internal_profile_with_audit");
  expect(response.status).toBe(404);
});
