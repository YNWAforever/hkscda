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
      // A genuinely-down stack fails fast on connection-refused, not on
      // timeout expiry, so a generous timeout costs ~nothing in that common
      // case while absorbing "stack is up but slow under load" -- e.g. this
      // check racing against the rest of a large `bun test` run competing
      // for CPU/network at module-load time, which has been observed to
      // produce a false "unreachable" and skip this entire file's coverage.
      signal: AbortSignal.timeout(5000),
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
let fixtureDonationId: string | undefined;
let fixturePaymentId: string | undefined;
let fixtureConsentId: string | undefined;

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

    const { data: donationRow, error: donationError } = await svc
      .from("donation")
      .insert({
        supporter_id: fixtureSupporterId,
        amount_cents: 10000,
        purpose: "general",
        method: "manual",
      })
      .select("id")
      .single();
    if (donationError || !donationRow) {
      throw new Error(`Failed to seed fixture donation: ${donationError?.message}`);
    }
    fixtureDonationId = donationRow.id as string;

    const { data: paymentRow, error: paymentError } = await svc
      .from("payment")
      .insert({ donation_id: fixtureDonationId, provider: "manual", amount_cents: 10000 })
      .select("id")
      .single();
    if (paymentError || !paymentRow) {
      throw new Error(`Failed to seed fixture payment: ${paymentError?.message}`);
    }
    fixturePaymentId = paymentRow.id as string;

    const { data: consentRow, error: consentError } = await svc
      .from("consent")
      .insert({
        supporter_id: fixtureSupporterId,
        channel: "email",
        status: "opt_in",
        source: "rls-test-fixture",
      })
      .select("id")
      .single();
    if (consentError || !consentRow) {
      throw new Error(`Failed to seed fixture consent: ${consentError?.message}`);
    }
    fixtureConsentId = consentRow.id as string;

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
    if (fixturePaymentId) {
      try {
        await svc.from("payment").delete().eq("id", fixturePaymentId);
      } catch (err) {
        console.error(`Failed to clean up fixture payment ${fixturePaymentId}:`, err);
      }
    }
    if (fixtureDonationId) {
      try {
        await svc.from("donation").delete().eq("id", fixtureDonationId);
      } catch (err) {
        console.error(`Failed to clean up fixture donation ${fixtureDonationId}:`, err);
      }
    }
    if (fixtureConsentId) {
      try {
        await svc.from("consent").delete().eq("id", fixtureConsentId);
      } catch (err) {
        console.error(`Failed to clean up fixture consent ${fixtureConsentId}:`, err);
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

  describe("supporter", () => {
    test("anon cannot select", async () => {
      const { data, error } = await clients.anon.from("supporter").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("anon cannot insert", async () => {
      const { error } = await clients.anon
        .from("supporter")
        .insert({ name: "Sneaky", email: "sneaky-supporter@example.test" });
      expect(error).not.toBeNull();
    });

    test("authenticated with no admin_user row cannot select", async () => {
      const { data, error } = await clients.noRow.from("supporter").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("staff can select", async () => {
      const { data, error } = await clients.staff
        .from("supporter")
        .select("id")
        .eq("id", fixtureSupporterId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    test("staff can update", async () => {
      const { error } = await clients.staff
        .from("supporter")
        .update({ language: "en" })
        .eq("id", fixtureSupporterId!);
      expect(error).toBeNull();
    });

    test("staff cannot insert (no insert policy exists for any authenticated role)", async () => {
      const { error } = await clients.staff
        .from("supporter")
        .insert({ name: "Sneaky Staff Insert", email: "sneaky-staff-insert@example.test" });
      expect(error).not.toBeNull();
    });

    test("treasurer can select", async () => {
      const { data, error } = await clients.treasurer
        .from("supporter")
        .select("id")
        .eq("id", fixtureSupporterId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    test("admin can select", async () => {
      const { data, error } = await clients.admin
        .from("supporter")
        .select("id")
        .eq("id", fixtureSupporterId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });

  describe("donation", () => {
    test("anon cannot select", async () => {
      const { data, error } = await clients.anon.from("donation").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("authenticated with no admin_user row cannot select", async () => {
      const { data, error } = await clients.noRow.from("donation").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("staff can select but cannot update", async () => {
      const selectResult = await clients.staff
        .from("donation")
        .select("id")
        .eq("id", fixtureDonationId!);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      const updateResult = await clients.staff
        .from("donation")
        .update({ status: "succeeded" })
        .eq("id", fixtureDonationId!);
      // A blocked UPDATE under RLS either errors, or silently affects 0 rows
      // (PostgREST reports 0 affected rows as success with empty data, not
      // an error, when no row matches the USING clause for that operation).
      if (!updateResult.error) {
        const check = await clients.service
          .from("donation")
          .select("status")
          .eq("id", fixtureDonationId!)
          .single();
        expect(check.data?.status).not.toBe("succeeded");
      }
    });

    // These two tests are intentionally coupled: this one leaves the fixture
    // donation's status as "succeeded", and the next one ("admin can select
    // and update") depends on running afterward to revert it back to
    // "pending" -- bun:test runs tests within a describe block in source
    // order, so that ordering is guaranteed here. This is safe only because
    // nothing else in this file reads fixtureDonationId's status between the
    // two. If a later task's fixture (e.g. a `payment` row keyed off this
    // same donation) needs a specific status, seed/assert it explicitly
    // there rather than relying on this pair leaving "pending" behind --
    // and if this "admin" test is ever changed to stop reverting the status,
    // update this comment (and any downstream assumption) accordingly.
    test("treasurer can select and update", async () => {
      const { error } = await clients.treasurer
        .from("donation")
        .update({ status: "succeeded" })
        .eq("id", fixtureDonationId!);
      expect(error).toBeNull();

      const check = await clients.service
        .from("donation")
        .select("status")
        .eq("id", fixtureDonationId!)
        .single();
      expect(check.data?.status).toBe("succeeded");
    });

    // Reverts the status the previous test ("treasurer can select and
    // update") set to "succeeded", back to the fixture's original "pending"
    // -- see the comment above that test for why this ordering dependency
    // exists and is safe.
    test("admin can select and update", async () => {
      const { error } = await clients.admin
        .from("donation")
        .update({ status: "pending" })
        .eq("id", fixtureDonationId!);
      expect(error).toBeNull();
    });

    test("no authenticated role can insert a donation directly", async () => {
      const { error } = await clients.admin.from("donation").insert({
        supporter_id: fixtureSupporterId!,
        amount_cents: 500,
        purpose: "general",
        method: "manual",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("payment", () => {
    test("anon cannot select", async () => {
      const { data, error } = await clients.anon.from("payment").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("authenticated with no admin_user row cannot select", async () => {
      const { data, error } = await clients.noRow.from("payment").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("staff can select but cannot reconcile (update)", async () => {
      const selectResult = await clients.staff
        .from("payment")
        .select("id")
        .eq("id", fixturePaymentId);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      await clients.staff
        .from("payment")
        .update({ status: "succeeded" })
        .eq("id", fixturePaymentId);
      const check = await clients.service
        .from("payment")
        .select("status")
        .eq("id", fixturePaymentId)
        .single();
      expect(check.data?.status).not.toBe("succeeded");
    });

    // These two tests are intentionally coupled, the same way the "treasurer
    // can select and update" / "admin can select and update" pair above is
    // for `donation`: this one leaves the fixture payment's status as
    // "succeeded", and the next one ("admin can reconcile") depends on
    // running afterward to revert it back to "pending" -- bun:test runs
    // tests within a describe block in source order, so that ordering is
    // guaranteed here. This is safe only because nothing else in this file
    // reads fixturePaymentId's status between the two. If this "admin" test
    // is ever changed to stop reverting the status, update this comment (and
    // any downstream assumption) accordingly.
    test("treasurer can reconcile (update)", async () => {
      const { error } = await clients.treasurer
        .from("payment")
        .update({ status: "succeeded" })
        .eq("id", fixturePaymentId);
      expect(error).toBeNull();

      const check = await clients.service
        .from("payment")
        .select("status")
        .eq("id", fixturePaymentId)
        .single();
      expect(check.data?.status).toBe("succeeded");
    });

    // Reverts the status the previous test ("treasurer can reconcile") set to
    // "succeeded", back to the fixture's original "pending" -- see the
    // comment above that test for why this ordering dependency exists and is
    // safe.
    test("admin can reconcile (update)", async () => {
      const { error } = await clients.admin
        .from("payment")
        .update({ status: "pending" })
        .eq("id", fixturePaymentId);
      expect(error).toBeNull();
    });
  });

  describe("receipt", () => {
    test("anon cannot select", async () => {
      const { data, error } = await clients.anon.from("receipt").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("staff has no access at all -- cannot select, insert, or update", async () => {
      const selectResult = await clients.staff.from("receipt").select("id");
      if (!selectResult.error) expect(selectResult.data).toEqual([]);

      const insertResult = await clients.staff.from("receipt").insert({
        supporter_id: fixtureSupporterId,
        receipt_no: `RLS-TEST-STAFF-SHOULD-FAIL-${Date.now()}`,
        donation_ids: [fixtureDonationId],
        total_amount_cents: 100,
        tax_year: 2026,
      });
      expect(insertResult.error).not.toBeNull();

      // Seed a receipt via the service client (bypassing RLS) purely so this
      // test has something to attempt an update against -- it must not
      // depend on the treasurer/admin tests below having already run and
      // left a row behind, since describe-block test order is an
      // implementation detail this test shouldn't rely on. Cleaned up in the
      // `finally` regardless of what the assertions below do, so a failed
      // assertion here can never leak a row and poison a later run via the
      // `receipt_no` unique constraint or the one-issued-receipt-per-donation
      // index.
      const { data: seededReceipt, error: seedError } = await clients.service
        .from("receipt")
        .insert({
          supporter_id: fixtureSupporterId,
          receipt_no: `RLS-TEST-STAFF-UPDATE-SEED-${Date.now()}`,
          donation_ids: [fixtureDonationId],
          total_amount_cents: 100,
          tax_year: 2026,
        })
        .select("id")
        .single();
      if (seedError || !seededReceipt) {
        throw new Error(`Failed to seed receipt for staff-update test: ${seedError?.message}`);
      }
      const seededReceiptId = seededReceipt.id as string;
      try {
        await clients.staff
          .from("receipt")
          .update({ status: "void", voided_at: new Date().toISOString() })
          .eq("id", seededReceiptId);
        const check = await clients.service
          .from("receipt")
          .select("status")
          .eq("id", seededReceiptId)
          .single();
        expect(check.data?.status).not.toBe("void");
      } finally {
        await clients.service.from("receipt").delete().eq("id", seededReceiptId);
      }
    });

    test("treasurer can insert, select, and update a receipt", async () => {
      const insertResult = await clients.treasurer
        .from("receipt")
        .insert({
          supporter_id: fixtureSupporterId,
          receipt_no: `RLS-TEST-TREASURER-${Date.now()}`,
          donation_ids: [fixtureDonationId],
          total_amount_cents: 10000,
          tax_year: 2026,
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      expect(insertResult.data?.id).toBeDefined();
      const createdReceiptId = insertResult.data?.id as string;

      // Cleanup runs in `finally` (not as a trailing statement) so a genuine
      // RLS regression that throws out of an assertion above it can never
      // leave this receipt behind -- `receipt_no` is `unique` and this
      // fixture's value has no randomization safety net beyond the
      // timestamp suffix above, so a leaked row would otherwise break every
      // subsequent run's insert with a unique-constraint violation, masking
      // the original failure until someone manually deletes the row.
      try {
        const selectResult = await clients.treasurer
          .from("receipt")
          .select("id")
          .eq("id", createdReceiptId);
        expect(selectResult.error).toBeNull();
        expect(selectResult.data).toHaveLength(1);

        const updateResult = await clients.treasurer
          .from("receipt")
          .update({ status: "void", voided_at: new Date().toISOString() })
          .eq("id", createdReceiptId);
        expect(updateResult.error).toBeNull();
      } finally {
        await clients.service.from("receipt").delete().eq("id", createdReceiptId);
      }
    });

    test("admin can manage receipts too", async () => {
      const insertResult = await clients.admin
        .from("receipt")
        .insert({
          supporter_id: fixtureSupporterId,
          receipt_no: `RLS-TEST-ADMIN-${Date.now()}`,
          donation_ids: [fixtureDonationId],
          total_amount_cents: 10000,
          tax_year: 2026,
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      const createdReceiptId = insertResult.data?.id as string;
      // The id-defined assertion runs inside `try` (not before it, unlike
      // the error-is-null check above -- a thrown error there means the
      // insert itself failed and left no row to clean up) so that cleanup
      // in `finally` still fires even if that assertion is ever the one
      // that fails. See the comment in the treasurer test above for the
      // full rationale on why cleanup belongs in `finally`.
      try {
        expect(insertResult.data?.id).toBeDefined();
      } finally {
        await clients.service.from("receipt").delete().eq("id", createdReceiptId);
      }
    });
  });

  describe("consent", () => {
    test("anon cannot select or insert", async () => {
      const selectResult = await clients.anon.from("consent").select("id");
      if (!selectResult.error) expect(selectResult.data).toEqual([]);

      const insertResult = await clients.anon.from("consent").insert({
        supporter_id: fixtureSupporterId,
        channel: "email",
        status: "opt_out",
        source: "sneaky",
      });
      expect(insertResult.error).not.toBeNull();
    });

    test("authenticated with no admin_user row cannot select", async () => {
      const { data, error } = await clients.noRow.from("consent").select("id");
      if (!error) expect(data).toEqual([]);
    });

    test("staff can select and update (unlike donation/payment, staff has update access here)", async () => {
      const selectResult = await clients.staff
        .from("consent")
        .select("id")
        .eq("id", fixtureConsentId!);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      // Restore runs in `finally` (not as a trailing statement): unlike the
      // treasurer/donation-style coupled pairs elsewhere in this file, this
      // single test both mutates and restores the fixture's state with no
      // cross-test ordering dependency -- but that's only true if the restore
      // genuinely always runs. The `expect` on `updateResult.error` below can
      // throw if the update itself regresses, which without `finally` would
      // skip the restore and leave the fixture as "opt_out" for whatever test
      // runs next -- so cleanup belongs in `finally`, matching the rigor
      // established for `receipt` in the previous task.
      try {
        const updateResult = await clients.staff
          .from("consent")
          .update({ status: "opt_out" })
          .eq("id", fixtureConsentId!);
        expect(updateResult.error).toBeNull();
      } finally {
        await clients.service
          .from("consent")
          .update({ status: "opt_in" })
          .eq("id", fixtureConsentId!);
      }
    });

    test("treasurer can update", async () => {
      const { error } = await clients.treasurer
        .from("consent")
        .update({ status: "opt_in" })
        .eq("id", fixtureConsentId!);
      expect(error).toBeNull();
    });

    test("admin can update", async () => {
      const { error } = await clients.admin
        .from("consent")
        .update({ status: "opt_in" })
        .eq("id", fixtureConsentId!);
      expect(error).toBeNull();
    });

    test("no authenticated role can insert a consent row directly", async () => {
      const { error } = await clients.admin.from("consent").insert({
        supporter_id: fixtureSupporterId,
        channel: "whatsapp",
        status: "opt_in",
        source: "rls-test-insert-attempt",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("recurring_mandate", () => {
    test("every non-service-role caller is blocked from selecting, regardless of admin status", async () => {
      for (const [roleName, client] of [
        ["anon", clients.anon],
        ["authenticated with no admin_user row", clients.noRow],
        ["staff", clients.staff],
        ["treasurer", clients.treasurer],
        ["admin", clients.admin],
      ] as const) {
        const { data, error } = await client.from("recurring_mandate").select("id");
        if (!error) {
          expect(data, `${roleName} should see zero recurring_mandate rows`).toEqual([]);
        }
      }
    });

    test("even admin cannot insert a recurring_mandate row directly", async () => {
      const { error } = await clients.admin.from("recurring_mandate").insert({
        supporter_id: fixtureSupporterId,
        amount_cents: 5000,
        provider: "stripe",
        provider_ref: "rls-test-should-fail",
      });
      expect(error).not.toBeNull();
    });
  });
});
