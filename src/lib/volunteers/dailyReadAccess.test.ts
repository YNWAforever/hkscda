import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../admin/session.server";

// Real server authorization with offline Auth/admin_user responses, not real Auth or RLS.
function clientFor(role: string | null, status = "active", expired = false) {
  let writes = 0;
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: expired
            ? null
            : { id: "90000000-0000-4000-8000-000000000001", email: "actor@example.invalid" },
        },
        error: expired ? new Error("Expired offline session") : null,
      }),
    },
    from(table: string) {
      expect(table).toBe("admin_user");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: role
                ? {
                    id: "90000000-0000-4000-8000-000000000002",
                    auth_user_id: "90000000-0000-4000-8000-000000000001",
                    email: "actor@example.invalid",
                    role,
                    status,
                  }
                : null,
              error: null,
            }),
          }),
        }),
      };
    },
    rpc() {
      writes++;
      throw new Error("A read journey must not activate an invite or call a write RPC");
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    writes: () => writes,
  };
}

describe("daily read: existing admin/staff server boundary (mock Auth transport)", () => {
  for (const role of ["admin", "staff"] as const) {
    test(`${role} remains allowed without a business or invite write`, async () => {
      const fixture = clientFor(role);
      const actor = await requireAdmin(
        new Request("http://fixture.invalid/api/admin/volunteers/registrations/id", {
          headers: { authorization: "Bearer offline-test-session" },
        }),
        ["staff", "admin"],
        fixture.client,
      );
      expect(actor.role).toBe(role);
      expect(actor.status).toBe("active");
      expect(fixture.writes()).toBe(0);
    });
  }

  for (const [name, role, status, expired, signedIn, expected] of [
    ["treasurer", "treasurer", "active", false, true, 403],
    ["volunteer without admin membership", null, "active", false, true, 403],
    ["disabled staff", "staff", "disabled", false, true, 403],
    ["pending invite", "staff", "pending", false, true, 403],
    ["expired session", "staff", "active", true, true, 401],
    ["not signed in", "staff", "active", false, false, 401],
  ] as const) {
    test(`${name} remains denied before any business write`, async () => {
      const fixture = clientFor(role, status, expired);
      let denied: unknown;
      try {
        await requireAdmin(
          new Request("http://fixture.invalid/api/admin/volunteers/registrations/id", {
            headers: signedIn ? { authorization: "Bearer offline-test-session" } : {},
          }),
          ["staff", "admin"],
          fixture.client,
        );
      } catch (error) {
        denied = error;
      }
      expect(denied).toBeInstanceOf(Response);
      expect((denied as Response).status).toBe(expected);
      expect(fixture.writes()).toBe(0);
    });
  }
});
