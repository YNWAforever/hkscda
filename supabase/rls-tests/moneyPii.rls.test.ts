import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local Supabase CLI stacks use fixed, publicly-documented demo JWT keys by
// default (not secrets -- they only work against a local, throwaway
// database). Confirm these match this worktree's actual running stack by
// running `bunx supabase status` after `bunx supabase start` and comparing
// the printed "anon key" / "service_role key" values -- if this repo's
// supabase/config.toml customizes [auth] jwt_secret, these will differ and
// must be updated to match. Do this check now, before writing further code.
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
      signal: AbortSignal.timeout(1500),
    });
    // PostgREST's root route responds even with no matching route configured;
    // any HTTP response (not a network error) means the stack is up.
    return res.status > 0;
  } catch {
    return false;
  }
}

let warnedSkip = false;
function warnSkipOnce() {
  if (warnedSkip) return;
  warnedSkip = true;
  console.log(
    "Skipping RLS behavioral tests: local Supabase stack not reachable at " +
      SUPABASE_URL +
      ". Run `bunx supabase start` first, then `bun run test:rls` (not plain `bun test`).",
  );
}

// Top-level await: Bun's test runner evaluates a test file's module body
// (including top-level awaits) before registering its describe/test blocks,
// so this blocks describe.skipIf's condition on a real, resolved check --
// not a synchronous guess.
const reachable = await isLocalStackReachable();
if (!reachable) warnSkipOnce();

type RoleClients = {
  anon: SupabaseClient;
  noRow: SupabaseClient;
  staff: SupabaseClient;
  treasurer: SupabaseClient;
  admin: SupabaseClient;
  service: SupabaseClient;
};

// Hoisted to describe scope (not assigned inside `clients` until beforeAll's
// final statement) so afterAll can find and clean up whatever was actually
// created even if beforeAll throws partway through -- e.g. a duplicate-email
// collision from a prior failed run, or a transient network error midway
// through seeding. Cleanup gates on `service` being set, not on the full
// `clients` object, since `service` is assigned first, before anything that
// can fail.
let service: SupabaseClient | undefined;
let clients: RoleClients;
const createdAuthUserIds: string[] = [];
const createdAdminUserIds: string[] = [];
let fixtureSupporterId: string | undefined;

async function createRoleUser(
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<{ userId: string; client: SupabaseClient }> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  createdAuthUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in test user ${email}: ${signInError.message}`);
  }

  return { userId: data.user.id, client };
}

describe.skipIf(!reachable)("RLS behavioral matrix: money/PII tables", () => {
  beforeAll(async () => {
    // Assigned to the describe-scoped `service` first, before anything that
    // can throw, so afterAll can always reach it to clean up -- even if a
    // later step in this function fails partway through (a bad insert, a
    // transient network error, a duplicate-email collision from a prior
    // failed run). `svc` is a local alias of the same client, used for the
    // rest of this function purely so TypeScript doesn't need to re-narrow
    // the outer `SupabaseClient | undefined` on every reference.
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    service = svc;

    const anon = createClient(SUPABASE_URL, ANON_KEY);

    const { client: noRowClient } = await createRoleUser(
      svc,
      "rls-test-no-row@example.test",
      "test-password-12345",
    );
    const { userId: staffAuthId, client: staffClient } = await createRoleUser(
      svc,
      "rls-test-staff@example.test",
      "test-password-12345",
    );
    const { userId: treasurerAuthId, client: treasurerClient } = await createRoleUser(
      svc,
      "rls-test-treasurer@example.test",
      "test-password-12345",
    );
    const { userId: adminAuthId, client: adminClient } = await createRoleUser(
      svc,
      "rls-test-admin@example.test",
      "test-password-12345",
    );

    for (const [authUserId, email, role] of [
      [staffAuthId, "rls-test-staff@example.test", "staff"],
      [treasurerAuthId, "rls-test-treasurer@example.test", "treasurer"],
      [adminAuthId, "rls-test-admin@example.test", "admin"],
    ] as const) {
      const { data, error } = await svc
        .from("admin_user")
        .insert({ auth_user_id: authUserId, email, role, status: "active" })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Failed to seed admin_user for ${email}: ${error?.message}`);
      }
      createdAdminUserIds.push(data.id as string);
    }

    const { data: supporterRow, error: supporterError } = await svc
      .from("supporter")
      .insert({ name: "RLS Test Supporter", email: "rls-test-supporter@example.test" })
      .select("id")
      .single();
    if (supporterError || !supporterRow) {
      throw new Error(`Failed to seed fixture supporter: ${supporterError?.message}`);
    }
    fixtureSupporterId = supporterRow.id as string;

    clients = {
      anon,
      noRow: noRowClient,
      staff: staffClient,
      treasurer: treasurerClient,
      admin: adminClient,
      service: svc,
    };
  });

  afterAll(async () => {
    // Gated on `service` (assigned as beforeAll's first statement), not on
    // the full `clients` object (assigned last) -- so a beforeAll failure
    // partway through still triggers cleanup of whatever was created before
    // the throw, instead of leaking every auth user / admin_user row created
    // so far (which would otherwise cause duplicate-email failures on the
    // next run).
    if (!service) return;
    const svc = service;

    // Each loop iteration is isolated in its own try/catch: one failed
    // delete/deleteUser call must not abort the loop and leak every
    // subsequent id in it -- cleanup is best-effort per resource, not
    // all-or-nothing.
    for (const id of createdAdminUserIds) {
      try {
        await svc.from("admin_user").delete().eq("id", id);
      } catch (err) {
        console.error(`Failed to clean up admin_user row ${id}:`, err);
      }
    }
    if (fixtureSupporterId) {
      try {
        await svc.from("supporter").delete().eq("id", fixtureSupporterId);
      } catch (err) {
        console.error(`Failed to clean up fixture supporter ${fixtureSupporterId}:`, err);
      }
    }
    for (const authUserId of createdAuthUserIds) {
      try {
        await svc.auth.admin.deleteUser(authUserId);
      } catch (err) {
        console.error(`Failed to clean up auth user ${authUserId}:`, err);
      }
    }
  });

  describe("admin_user", () => {
    test("anon cannot select any row", async () => {
      const { data, error } = await clients.anon.from("admin_user").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("authenticated with no admin_user row sees zero rows, including others'", async () => {
      const { data, error } = await clients.noRow.from("admin_user").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test("staff sees exactly their own row, not others'", async () => {
      const { data, error } = await clients.staff.from("admin_user").select("email");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.email).toBe("rls-test-staff@example.test");
    });

    test("staff cannot insert a new admin_user row", async () => {
      const { error } = await clients.staff
        .from("admin_user")
        .insert({ auth_user_id: crypto.randomUUID(), email: "sneaky@example.test", role: "staff" });
      expect(error).not.toBeNull();
    });

    test("admin sees all admin_user rows, including staff's and treasurer's", async () => {
      const { data, error } = await clients.admin.from("admin_user").select("email");
      expect(error).toBeNull();
      const emails = (data ?? []).map((row) => row.email);
      expect(emails).toContain("rls-test-staff@example.test");
      expect(emails).toContain("rls-test-treasurer@example.test");
      expect(emails).toContain("rls-test-admin@example.test");
    });
  });
});
