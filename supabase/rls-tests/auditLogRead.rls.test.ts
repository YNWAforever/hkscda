import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * AUTH-01 (audit 2026-11-09): the audit trail is API-only.
 *
 * Migration 20261109100000_revoke_audit_log_browser_read revokes the table select privilege from
 * `anon` and `authenticated` and drops the old three-role policy. This is the behavioural half:
 * a real staff/treasurer/admin JWT (each backed by an active `admin_user` row) must get
 * "permission denied" from PostgREST, while the service-role client the API handlers use still
 * reads the table.
 *
 * Runs only when a local Supabase CLI stack answers (same contract as moneyPii.rls.test.ts);
 * `SUPABASE_LOCAL_URL=http://127.0.0.1:1` skips it in unit-only runs. Never point it at a
 * hosted project: it creates throwaway auth users.
 */
const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:55321";
const ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function isLocalStackReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

const reachable = await isLocalStackReachable();
if (!reachable) {
  console.log(
    "Skipping AUTH-01 audit-log RLS test: local Supabase stack not reachable at " +
      SUPABASE_URL +
      ". Run `bunx supabase start` first, then `bun run test:rls` (not plain `bun test`).",
  );
}

type Role = "staff" | "treasurer" | "admin";
type RoleClients = Record<Role, SupabaseClient> & { anon: SupabaseClient };

let service: SupabaseClient | undefined;
let clients: RoleClients;
const createdAuthUserIds: string[] = [];
const createdAdminUserIds: string[] = [];

async function createRoleClient(
  svc: SupabaseClient,
  role: Role,
  email: string,
): Promise<SupabaseClient> {
  const password = `audit-log-rls-${randomUUID()}`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  createdAuthUserIds.push(data.user.id);

  // An active admin_user row makes this a fully authorised staff/treasurer/admin JWT, so the
  // denial below proves the privilege revoke, not an unrelated authorization gap.
  const { data: adminRow, error: adminError } = await svc
    .from("admin_user")
    .upsert({ auth_user_id: data.user.id, email, role, status: "active" }, { onConflict: "email" })
    .select("id")
    .single();
  if (adminError || !adminRow) {
    throw new Error(`Failed to seed admin_user for ${email}: ${adminError?.message}`);
  }
  createdAdminUserIds.push(adminRow.id as string);

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in test user ${email}: ${signInError.message}`);
  }
  return client;
}

describe.skipIf(!reachable)("AUTH-01: the audit trail is not readable by browser roles", () => {
  beforeAll(async () => {
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    service = svc;

    const suffix = randomUUID().slice(0, 8);
    clients = {
      anon: createClient(SUPABASE_URL, ANON_KEY),
      staff: await createRoleClient(svc, "staff", `rls-audit-staff-${suffix}@example.test`),
      treasurer: await createRoleClient(
        svc,
        "treasurer",
        `rls-audit-treasurer-${suffix}@example.test`,
      ),
      admin: await createRoleClient(svc, "admin", `rls-audit-admin-${suffix}@example.test`),
    };
    // Three auth users + sign-ins + admin_user upserts exceed bun:test's 5s hook default.
  }, 60_000);

  afterAll(async () => {
    if (!service) return;
    const svc = service;
    // Best-effort per resource: one failed delete must not leak every later id.
    for (const id of createdAdminUserIds) {
      try {
        await svc.from("admin_user").delete().eq("id", id);
      } catch (error) {
        console.error(`Failed to clean up admin_user row ${id}:`, error);
      }
    }
    for (const id of createdAuthUserIds) {
      try {
        await svc.auth.admin.deleteUser(id);
      } catch (error) {
        console.error(`Failed to clean up auth user ${id}:`, error);
      }
    }
  });

  for (const role of ["staff", "treasurer", "admin"] as const) {
    test(`${role} JWT cannot select audit_log rows`, async () => {
      const { data, error } = await clients[role].from("audit_log").select("id").limit(5);
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toMatch(/permission denied/i);
    });
  }

  test("anon cannot select audit_log rows", async () => {
    const { data, error } = await clients.anon.from("audit_log").select("id").limit(5);
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });

  test("service_role keeps reading the audit trail for the API handlers", async () => {
    const { data, error } = await service!.from("audit_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
