import { expect, mock, spyOn, test } from "bun:test";

import * as realSupabase from "../../donations/supabase.server";

// handleQualificationCommand builds its own client and admin check, so the
// supabase server module is replaced before the handler is imported.
let rpcError: { code: string; message: string; details: null; hint: null } | null = null;

mock.module("../../donations/supabase.server", () => ({
  ...realSupabase,
  createSupabaseServiceClient: () => ({
    rpc: async () => ({ data: null, error: rpcError }),
  }),
  requireAdmin: async () => ({
    id: "admin-row",
    authUserId: "11111111-1111-4111-8111-111111111111",
    email: "staff@example.com",
    role: "staff",
    status: "active",
  }),
}));

const { handleQualificationCommand } = await import("./qualifications.server");

const base = {
  profile_id: "22222222-2222-4222-8222-222222222222",
  expected_revision: 3,
  reason: "checked ID",
};

async function command(body: Record<string, unknown>) {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    return await handleQualificationCommand(
      new Request("https://example.test/api/admin/volunteers/qualifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    logged.mockRestore();
  }
}

test("BUG-17: a verify with a future joined_on (22023) returns 422, not 500", async () => {
  rpcError = {
    code: "22023",
    message: "verified_history_cannot_start_in_future",
    details: null,
    hint: null,
  };
  const response = await command({
    ...base,
    action: "verify",
    tier: "regular",
    joined_on: "2099-11-05",
  });
  expect(response.status).toBe(422);
});

test("BUG-17: a credential whose valid_until is not after valid_from is refused with 422 (or 400), not 500", async () => {
  rpcError = {
    code: "23514",
    message: 'new row for relation "volunteer_credential" violates check constraint',
    details: null,
    hint: null,
  };
  const response = await command({
    ...base,
    action: "credential",
    credential_key: "first_aid",
    valid_from: "2026-11-01T00:00:00+08:00",
    valid_until: "2026-11-01T00:00:00+08:00",
    evidence: "cert",
  });
  expect([400, 422]).toContain(response.status);
});
