import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// See moneyPii.rls.test.ts for the rationale behind these fixed local demo
// keys and the env var overrides -- this file intentionally mirrors that
// setup rather than inventing a second convention.
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
      // See moneyPii.rls.test.ts for why this timeout is generous rather than
      // tight: a genuinely-down stack fails fast on connection-refused, so
      // this costs ~nothing in the common case while absorbing a slow-but-up
      // stack under load from the rest of a large `bun test` run.
      signal: AbortSignal.timeout(5000),
    });
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
  staff: SupabaseClient;
  treasurer: SupabaseClient;
  service: SupabaseClient;
};

// Hoisted to describe scope (not assigned inside `clients` until beforeAll's
// final statement) so afterAll can find and clean up whatever was actually
// created even if beforeAll throws partway through. Cleanup gates on
// `service` being set, not on the full `clients` object, since `service` is
// assigned first, before anything that can fail.
let service: SupabaseClient | undefined;
let clients: RoleClients;
const createdAuthUserIds: string[] = [];
const createdAdminUserIds: string[] = [];
let fixtureSupporterId: string | undefined;
let fixturePledgeId: string | undefined;
let fixtureAnimalId: string | undefined;
let fixtureAssignmentId: string | undefined;

// These role-user emails (below, in beforeAll) are hardcoded and reused on
// every run; afterAll is what makes that safe by deleting the auth users it
// created. See moneyPii.rls.test.ts's createRoleUser for the full rationale
// behind the self-heal below.
async function createRoleUser(
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<{ userId: string; client: SupabaseClient }> {
  let { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  // Self-heal a collision left by a previous interrupted run. Only ever
  // touches the suite's own `rls-test-*@example.test` addresses, and only on
  // the loopback stack this file refuses to run without.
  if (error && /already.*registered/i.test(error.message)) {
    const { data: existing } = await service.auth.admin.listUsers();
    const stale = existing?.users.find((user) => user.email === email);
    if (stale) await service.auth.admin.deleteUser(stale.id);
    ({ data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }));
  }

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

describe.skipIf(!reachable)("RLS behavioral matrix: sponsorship_assignment", () => {
  beforeAll(async () => {
    // Assigned to the describe-scoped `service` first, before anything that
    // can throw, so afterAll can always reach it to clean up -- even if a
    // later step in this function fails partway through.
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    service = svc;

    const anon = createClient(SUPABASE_URL, ANON_KEY);

    const { userId: staffAuthId, client: staffClient } = await createRoleUser(
      svc,
      "rls-test-sponsorship-staff@example.test",
      "test-password-12345",
    );
    const { userId: treasurerAuthId, client: treasurerClient } = await createRoleUser(
      svc,
      "rls-test-sponsorship-treasurer@example.test",
      "test-password-12345",
    );

    for (const [authUserId, email, role] of [
      [staffAuthId, "rls-test-sponsorship-staff@example.test", "staff"],
      [treasurerAuthId, "rls-test-sponsorship-treasurer@example.test", "treasurer"],
    ] as const) {
      // Upsert on the unique email, not insert -- see moneyPii.rls.test.ts for
      // why: an interrupted run leaves these fixed addresses behind in
      // admin_user too, and a plain insert then fails on admin_user_email_key
      // on every later run.
      const { data, error } = await svc
        .from("admin_user")
        .upsert(
          { auth_user_id: authUserId, email, role, status: "active" },
          { onConflict: "email" },
        )
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Failed to seed admin_user for ${email}: ${error?.message}`);
      }
      createdAdminUserIds.push(data.id as string);
    }

    // Seed via the service-role client, which bypasses RLS -- these rows must
    // exist for the anon-read and staff-read tests to be able to genuinely
    // fail if the policy were ever misconfigured.
    const { data: supporterRow, error: supporterError } = await svc
      .from("supporter")
      .upsert(
        { name: "RLS Test Sponsorship Supporter", email: "rls-test-sponsorship-supporter@example.test" },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (supporterError || !supporterRow) {
      throw new Error(`Failed to seed fixture supporter: ${supporterError?.message}`);
    }
    fixtureSupporterId = supporterRow.id as string;

    const { data: pledgeRow, error: pledgeError } = await svc
      .from("sponsorship_pledge")
      .insert({
        supporter_id: fixtureSupporterId,
        monthly_tier: "300",
        amount_cents: 30000,
        currency: "HKD",
        language: "en",
        status: "active",
      })
      .select("id")
      .single();
    if (pledgeError || !pledgeRow) {
      throw new Error(`Failed to seed fixture pledge: ${pledgeError?.message}`);
    }
    fixturePledgeId = pledgeRow.id as string;

    const { data: animalRow, error: animalError } = await svc
      .from("animals")
      .insert({
        type: "sponsor",
        name: "RLS Test Sponsorship Animal",
        gender: "female",
        age: "3",
        status: "available",
        adoption_eligible: false,
        sponsorship_eligible: true,
      })
      .select("id")
      .single();
    if (animalError || !animalRow) {
      throw new Error(`Failed to seed fixture animal: ${animalError?.message}`);
    }
    fixtureAnimalId = animalRow.id as string;

    const { data: assignmentRow, error: assignmentError } = await svc
      .from("sponsorship_assignment")
      .insert({
        pledge_id: fixturePledgeId,
        animal_id: fixtureAnimalId,
        animal_name_snapshot: "RLS Test Sponsorship Animal",
      })
      .select("id")
      .single();
    if (assignmentError || !assignmentRow) {
      throw new Error(`Failed to seed fixture assignment: ${assignmentError?.message}`);
    }
    fixtureAssignmentId = assignmentRow.id as string;

    clients = {
      anon,
      staff: staffClient,
      treasurer: treasurerClient,
      service: svc,
    };
    // This hook creates two auth users over HTTP, signs each in, and seeds
    // four fixture rows -- see moneyPii.rls.test.ts's beforeAll for why the
    // budget is raised well above bun:test's 5s default.
  }, 60_000);

  afterAll(async () => {
    // Gated on `service` (assigned as beforeAll's first statement), not on
    // the full `clients` object (assigned last) -- see moneyPii.rls.test.ts
    // for the full rationale.
    if (!service) return;
    const svc = service;

    // Each cleanup step is isolated in its own try/catch: one failed delete
    // must not abort the rest and leak every subsequent resource.
    if (fixtureAssignmentId) {
      try {
        await svc.from("sponsorship_assignment").delete().eq("id", fixtureAssignmentId);
      } catch (err) {
        console.error(`Failed to clean up fixture assignment ${fixtureAssignmentId}:`, err);
      }
    }
    if (fixturePledgeId) {
      try {
        await svc.from("sponsorship_pledge").delete().eq("id", fixturePledgeId);
      } catch (err) {
        console.error(`Failed to clean up fixture pledge ${fixturePledgeId}:`, err);
      }
    }
    if (fixtureAnimalId) {
      try {
        await svc.from("animals").delete().eq("id", fixtureAnimalId);
      } catch (err) {
        console.error(`Failed to clean up fixture animal ${fixtureAnimalId}:`, err);
      }
    }
    if (fixtureSupporterId) {
      try {
        await svc.from("supporter").delete().eq("id", fixtureSupporterId);
      } catch (err) {
        console.error(`Failed to clean up fixture supporter ${fixtureSupporterId}:`, err);
      }
    }
    for (const id of createdAdminUserIds) {
      try {
        await svc.from("admin_user").delete().eq("id", id);
      } catch (err) {
        console.error(`Failed to clean up admin_user row ${id}:`, err);
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

  describe("sponsorship_assignment", () => {
    // A real row exists (seeded in beforeAll via the service-role client, which
    // bypasses RLS) so this test can genuinely fail if RLS were misconfigured
    // -- an empty table would make this pass vacuously and prove nothing.
    test("anon cannot read", async () => {
      const { data, error } = await clients.anon.from("sponsorship_assignment").select("id");
      if (error) {
        // RLS default-denies and this table's `revoke all ... from anon`
        // should make this an outright permission error rather than a
        // silently-empty result -- report whichever is actually observed.
        expect(error).not.toBeNull();
      } else {
        expect(data).toEqual([]);
      }
    });

    test("anon cannot insert", async () => {
      const { error } = await clients.anon.from("sponsorship_assignment").insert({
        pledge_id: fixturePledgeId,
        animal_id: fixtureAnimalId,
        animal_name_snapshot: "Sneaky Anon Insert",
      });
      expect(error).not.toBeNull();
    });

    test("staff can read", async () => {
      const { data, error } = await clients.staff
        .from("sponsorship_assignment")
        .select("id")
        .eq("id", fixtureAssignmentId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    // This is the test that proves the "no write policy for anyone" design:
    // every write goes through assign_sponsorship_animal_with_audit /
    // end_sponsorship_assignment_with_audit, both security definer and
    // granted only to service_role. Even a staff user, who CAN read this
    // table, must be blocked from writing to it directly via PostgREST.
    test("even a staff user cannot insert directly", async () => {
      const { error } = await clients.staff.from("sponsorship_assignment").insert({
        pledge_id: fixturePledgeId,
        animal_id: fixtureAnimalId,
        animal_name_snapshot: "Sneaky Staff Insert",
      });
      expect(error).not.toBeNull();
    });

    // Section 6.3 of the governing plan says treasurers read payments but do
    // not review sponsorship -- yet this table is deliberately readable by
    // them too (the SELECT policy's role array includes 'treasurer').
    test("a treasurer can read", async () => {
      const { data, error } = await clients.treasurer
        .from("sponsorship_assignment")
        .select("id")
        .eq("id", fixtureAssignmentId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});
