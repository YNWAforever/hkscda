import { expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseVolunteerRepository } from "./repository.server";
import { createVolunteerService } from "./service";
import { createVolunteerHandlers } from "./http.server";
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "local-fixture-token" } } }),
    },
  },
}));
const { fetchAdminJson, AdminApiError } = await import("../admin/session");
test.each(["conflict", "capacity_full"])(
  "%s survives handler and fetchAdminJson as a409 AdminApiError",
  async (kind) => {
    const client = {
      rpc: async () => ({ data: { kind }, error: null }),
    } as unknown as SupabaseClient;
    const handlers = createVolunteerHandlers({
      requireVolunteerAdmin: async () => ({
        id: "admin",
        authUserId: "11111111-2222-4333-8444-555555555555",
        email: "fixture@example.invalid",
        role: "staff",
        status: "active",
      }),
      service: createVolunteerService({ repo: createSupabaseVolunteerRepository(client) }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) =>
      handlers.updateRegistrationStatus({
        request: new Request("https://example.invalid/status", init),
        params: { id: "11111111-2222-4333-8444-555555555555" },
      })) as typeof fetch;
    try {
      await fetchAdminJson("/local-fixture", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved", expectedUpdatedAt: "2026-09-05T00:00:00Z" }),
      });
      throw new Error("Expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApiError);
      expect((error as InstanceType<typeof AdminApiError>).status).toBe(409);
      expect((error as InstanceType<typeof AdminApiError>).code).toBe(kind);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
