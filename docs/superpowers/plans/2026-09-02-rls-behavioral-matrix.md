# RLS Behavioral Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first genuine behavioral RLS test suite to this repo, covering the 7 money/PII tables (`admin_user`, `supporter`, `donation`, `payment`, `receipt`, `consent`, `recurring_mandate`) across 5 roles, against a real local Supabase stack.

**Architecture:** One new test file, `supabase/rls-tests/moneyPii.rls.test.ts`, gated by a top-level-await reachability check so plain `bun test` skips it cleanly when no local Supabase stack is running. `beforeAll` creates 4 real Supabase Auth users (one each for "authenticated with no admin_user row", staff, treasurer, admin) plus corresponding `admin_user` rows, and seeds one fixture row per target table via a service-role client. Each table gets its own `describe` block asserting the real, verified current policy behavior for every role.

**Tech Stack:** `@supabase/supabase-js` (existing dependency), Bun test, Supabase CLI (local stack).

---

## Verified current RLS behavior (read directly from every migration touching these 7 tables — do not re-derive, this is the ground truth for every task below)

All 7 tables have RLS enabled. The shared helper `private.has_admin_role(roles[])` (SECURITY DEFINER) returns true iff an `admin_user` row exists with `auth_user_id = auth.uid()`, `status = 'active'`, `role = any(roles)`.

| Table | anon | authenticated, no admin_user row | staff | treasurer | admin |
|---|---|---|---|---|---|
| `admin_user` | SELECT/INSERT/UPDATE/DELETE: blocked (no grant to anon) | SELECT: sees 0 rows (their own row doesn't exist); querying another user's row: sees 0 rows. INSERT/UPDATE/DELETE: blocked | SELECT: sees exactly their own row, not others'. INSERT/UPDATE/DELETE: blocked (only `admin` role has the "manage all" policy) | same as staff | SELECT: sees ALL rows (own + others). INSERT/UPDATE/DELETE: allowed on any row |
| `supporter` | all ops: blocked (anon grant revoked) | SELECT/UPDATE: blocked (not staff/treasurer/admin) | SELECT/UPDATE: allowed. INSERT/DELETE: blocked (no such policy for any role) | same as staff | same as staff |
| `donation` | all ops: blocked | SELECT/UPDATE: blocked | SELECT: allowed. UPDATE: blocked (only treasurer/admin) | SELECT/UPDATE: allowed | SELECT/UPDATE: allowed |
| `payment` | all ops: blocked | SELECT/UPDATE: blocked | SELECT: allowed. UPDATE: blocked (only treasurer/admin "reconcile") | SELECT/UPDATE: allowed | SELECT/UPDATE: allowed |
| `receipt` | all ops: blocked | all ops: blocked | **all ops: blocked** (staff is entirely excluded — only treasurer/admin have any access, via a single FOR ALL policy) | SELECT/INSERT/UPDATE/DELETE: allowed | SELECT/INSERT/UPDATE/DELETE: allowed |
| `consent` | all ops: blocked | SELECT/UPDATE: blocked | SELECT/UPDATE: allowed (staff CAN update here, unlike donation/payment) | SELECT/UPDATE: allowed | SELECT/UPDATE: allowed |
| `recurring_mandate` | all ops: blocked | all ops: blocked | **all ops: blocked** (zero policies exist anywhere for this table; the `authenticated` blanket grant was also explicitly revoked — this table is default-deny for every non-service-role caller, unconditionally) | all ops: blocked | all ops: blocked |

No table has an INSERT policy for any non-service-role caller except `admin` on `admin_user` and `treasurer`/`admin` on `receipt` — every other row (`supporter`, `donation`, `payment`, `consent`) is created only by the service-role client in application code.

---

## File Structure

**Create:**
- `supabase/rls-tests/moneyPii.rls.test.ts` — the harness and all 7 tables' behavioral tests (added incrementally, task by task).
- `docs/rls-testing.md` — prerequisite/usage documentation.

**Modify:**
- `package.json` — add `"test:rls": "bun test supabase/rls-tests"`.
- `.github/workflows/ci.yml` — add a non-blocking `rls-matrix` job.

---

### Task 1: Harness skeleton, skip-path behavior, and `admin_user` tests

**Files:**
- Create: `supabase/rls-tests/moneyPii.rls.test.ts`
- Create (committed this time, unlike the earlier migration-fix worktrees this session that deliberately left it out of scope): `supabase/config.toml`
- Modify: `package.json`

- [ ] **Step 1: Add the `test:rls` script**

In `package.json`'s `"scripts"` block, add (alphabetical position doesn't matter, but keep it near `"test"`):

```json
    "test:rls": "bun test supabase/rls-tests",
```

- [ ] **Step 2: Create the harness file with the reachability-skip mechanism**

Create `supabase/rls-tests/moneyPii.rls.test.ts`:

```ts
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

let clients: RoleClients;
const createdAuthUserIds: string[] = [];
const createdAdminUserIds: string[] = [];
let fixtureSupporterId: string;

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
  if (error || !data.user) throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  createdAuthUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Failed to sign in test user ${email}: ${signInError.message}`);

  return { userId: data.user.id, client };
}

describe.skipIf(!reachable)("RLS behavioral matrix: money/PII tables", () => {
  beforeAll(async () => {
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const anon = createClient(SUPABASE_URL, ANON_KEY);

    const { client: noRowClient } = await createRoleUser(
      service,
      "rls-test-no-row@example.test",
      "test-password-12345",
    );
    const { userId: staffAuthId, client: staffClient } = await createRoleUser(
      service,
      "rls-test-staff@example.test",
      "test-password-12345",
    );
    const { userId: treasurerAuthId, client: treasurerClient } = await createRoleUser(
      service,
      "rls-test-treasurer@example.test",
      "test-password-12345",
    );
    const { userId: adminAuthId, client: adminClient } = await createRoleUser(
      service,
      "rls-test-admin@example.test",
      "test-password-12345",
    );

    for (const [authUserId, email, role] of [
      [staffAuthId, "rls-test-staff@example.test", "staff"],
      [treasurerAuthId, "rls-test-treasurer@example.test", "treasurer"],
      [adminAuthId, "rls-test-admin@example.test", "admin"],
    ] as const) {
      const { data, error } = await service
        .from("admin_user")
        .insert({ auth_user_id: authUserId, email, role, status: "active" })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Failed to seed admin_user for ${email}: ${error?.message}`);
      createdAdminUserIds.push(data.id as string);
    }

    const { data: supporterRow, error: supporterError } = await service
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
      service,
    };
  });

  afterAll(async () => {
    if (!clients) return;
    for (const id of createdAdminUserIds) {
      await clients.service.from("admin_user").delete().eq("id", id);
    }
    if (fixtureSupporterId) {
      await clients.service.from("supporter").delete().eq("id", fixtureSupporterId);
    }
    for (const authUserId of createdAuthUserIds) {
      await clients.service.auth.admin.deleteUser(authUserId);
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
```

- [ ] **Step 3: Verify the skip path with no local stack running**

Run: `bun test supabase/rls-tests/moneyPii.rls.test.ts`
Expected: PASS with 0 tests run (all skipped), and the console log "Skipping RLS behavioral tests: local Supabase stack not reachable..." printed once. Confirm via `docker ps` beforehand that no `hkscda`-named Supabase containers are currently running, so this genuinely exercises the skip path, not an accidental real run.

- [ ] **Step 4: Start the local stack and verify the `admin_user` tests actually pass**

This worktree may already have `supabase/config.toml` from earlier manual exploration this session — check first with `ls supabase/config.toml`. If it doesn't exist, run `bunx supabase init --workdir .`. Either way, check `docker ps --format "{{.Ports}}"` for currently-bound ports (this machine runs other unrelated Supabase stacks) and ensure `supabase/config.toml`'s ports don't collide — remap if needed (the `55320-55329` block has been used successfully by prior tasks this session, but re-verify it's still free). Set `project_id = "hkscda"` if not already set.

Run `bunx supabase start` and read its printed output carefully for the actual "API URL", "anon key", and "service_role key" values. Compare them against the hardcoded defaults in Step 2's `ANON_KEY`/`SERVICE_ROLE_KEY`/`SUPABASE_URL` constants (accounting for your chosen port). If they differ (e.g., because `supabase/config.toml`'s `[auth]` section customizes `jwt_secret`), export `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_ANON_KEY`, `SUPABASE_LOCAL_SERVICE_ROLE_KEY` as environment variables matching the real printed values before running tests, rather than editing the hardcoded fallback constants (keeps the file portable for other developers whose local port/config might differ).

Run: `bun run test:rls`
Expected: the `admin_user` describe block's 5 tests all pass. If any fails, use it as a debugging signal about the actual RLS policy behavior vs. this plan's documented matrix — do not just change the test to match unexpected behavior without understanding why first; if the real behavior genuinely differs from the verified matrix at the top of this plan, escalate rather than silently "fixing" the test to match, since that could mask a real RLS regression.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors. (`bun test`'s default run should still skip the RLS file cleanly if the stack is stopped by the time you run this — or pass if left running; either is fine as long as nothing fails.)

- [ ] **Step 6: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 7: Commit, including `supabase/config.toml`**

The spec explicitly calls for `supabase/config.toml` to be committed this time (unlike the two earlier fresh-DB-migration-fix worktrees this session, where it was deliberately left uncommitted as out-of-scope local setup) — this harness's CI job depends on a checked-in config so `bunx supabase start` in GitHub Actions uses the same port/project settings verified locally. Confirm it isn't gitignored first:

```bash
git check-ignore -v supabase/config.toml
```

Expected: no output (not ignored) — if it prints a match, stop and investigate `.gitignore` before proceeding rather than force-adding over an intentional ignore rule.

```bash
git add supabase/rls-tests/moneyPii.rls.test.ts package.json supabase/config.toml
git commit -m "feat: add RLS behavioral test harness with admin_user coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `supporter` and `donation` tests

**Files:**
- Modify: `supabase/rls-tests/moneyPii.rls.test.ts`

- [ ] **Step 1: Add fixture seeding for a `donation` row**

In the `beforeAll` block added in Task 1, after the `fixtureSupporterId` insert, add a fixture donation row (needs a `supporter_id`, `amount_cents`, `purpose`, `method` per the table's check constraints):

```ts
    const { data: donationRow, error: donationError } = await service
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
```

Add the corresponding `let fixtureDonationId: string;` declaration alongside the existing `let fixtureSupporterId: string;` near the top of the file.

In `afterAll`, add cleanup for the donation row (before the supporter delete, since `donation.supporter_id` has a foreign key to `supporter.id`):

```ts
    if (fixtureDonationId) {
      await clients.service.from("donation").delete().eq("id", fixtureDonationId);
    }
```

- [ ] **Step 2: Add the `supporter` describe block**

Add after the `admin_user` describe block:

```ts
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
        .eq("id", fixtureSupporterId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    test("staff can update", async () => {
      const { error } = await clients.staff
        .from("supporter")
        .update({ language: "en" })
        .eq("id", fixtureSupporterId);
      expect(error).toBeNull();
    });

    test("staff cannot insert (no insert policy exists for any authenticated role)", async () => {
      const { error } = await clients.staff
        .from("supporter")
        .insert({ name: "Sneaky Staff Insert", email: "sneaky-staff-insert@example.test" });
      expect(error).not.toBeNull();
    });

    test("treasurer can select and update", async () => {
      const { data, error } = await clients.treasurer
        .from("supporter")
        .select("id")
        .eq("id", fixtureSupporterId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    test("admin can select and update", async () => {
      const { data, error } = await clients.admin
        .from("supporter")
        .select("id")
        .eq("id", fixtureSupporterId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
```

- [ ] **Step 3: Add the `donation` describe block**

Add after the `supporter` describe block:

```ts
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
      const selectResult = await clients.staff.from("donation").select("id").eq("id", fixtureDonationId);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      const updateResult = await clients.staff
        .from("donation")
        .update({ status: "succeeded" })
        .eq("id", fixtureDonationId);
      // A blocked UPDATE under RLS either errors, or silently affects 0 rows
      // (PostgREST reports 0 affected rows as success with empty data, not
      // an error, when no row matches the USING clause for that operation).
      if (!updateResult.error) {
        const check = await clients.service
          .from("donation")
          .select("status")
          .eq("id", fixtureDonationId)
          .single();
        expect(check.data?.status).not.toBe("succeeded");
      }
    });

    test("treasurer can select and update", async () => {
      const { error } = await clients.treasurer
        .from("donation")
        .update({ status: "succeeded" })
        .eq("id", fixtureDonationId);
      expect(error).toBeNull();

      const check = await clients.service
        .from("donation")
        .select("status")
        .eq("id", fixtureDonationId)
        .single();
      expect(check.data?.status).toBe("succeeded");
    });

    test("admin can select and update", async () => {
      const { error } = await clients.admin
        .from("donation")
        .update({ status: "pending" })
        .eq("id", fixtureDonationId);
      expect(error).toBeNull();
    });

    test("no authenticated role can insert a donation directly", async () => {
      const { error } = await clients.admin.from("donation").insert({
        supporter_id: fixtureSupporterId,
        amount_cents: 500,
        purpose: "general",
        method: "manual",
      });
      expect(error).not.toBeNull();
    });
  });
```

- [ ] **Step 4: Run the full suite against the local stack**

Start the stack if not already running (`bunx supabase start`, same port/config as Task 1), then:

Run: `bun run test:rls`
Expected: all `admin_user`, `supporter`, and `donation` tests pass.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 7: Commit**

```bash
git add supabase/rls-tests/moneyPii.rls.test.ts
git commit -m "feat: add supporter and donation RLS behavioral coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `payment` and `receipt` tests

**Files:**
- Modify: `supabase/rls-tests/moneyPii.rls.test.ts`

- [ ] **Step 1: Add fixture seeding for a `payment` row**

In `beforeAll`, after the donation fixture insert, add (payment requires `donation_id`, `provider`, `amount_cents`):

```ts
    const { data: paymentRow, error: paymentError } = await service
      .from("payment")
      .insert({ donation_id: fixtureDonationId, provider: "manual", amount_cents: 10000 })
      .select("id")
      .single();
    if (paymentError || !paymentRow) {
      throw new Error(`Failed to seed fixture payment: ${paymentError?.message}`);
    }
    fixturePaymentId = paymentRow.id as string;
```

Add `let fixturePaymentId: string;` alongside the other fixture-id declarations.

In `afterAll`, add cleanup BEFORE the donation delete (payment has a foreign key to donation, `on delete cascade` per the schema — but delete explicitly anyway for clarity and to not depend on cascade behavior in a test):

```ts
    if (fixturePaymentId) {
      await clients.service.from("payment").delete().eq("id", fixturePaymentId);
    }
```

- [ ] **Step 2: Add the `payment` describe block**

Add after the `donation` describe block:

```ts
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
      const selectResult = await clients.staff.from("payment").select("id").eq("id", fixturePaymentId);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      await clients.staff.from("payment").update({ status: "succeeded" }).eq("id", fixturePaymentId);
      const check = await clients.service
        .from("payment")
        .select("status")
        .eq("id", fixturePaymentId)
        .single();
      expect(check.data?.status).not.toBe("succeeded");
    });

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

    test("admin can reconcile (update)", async () => {
      const { error } = await clients.admin
        .from("payment")
        .update({ status: "pending" })
        .eq("id", fixturePaymentId);
      expect(error).toBeNull();
    });
  });
```

- [ ] **Step 3: Add the `receipt` describe block**

Receipt is the special case: staff has NO access at all (only a single FOR ALL policy scoped to treasurer/admin). Add after the `payment` describe block:

```ts
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
        receipt_no: "RLS-TEST-STAFF-SHOULD-FAIL",
        donation_ids: [fixtureDonationId],
        total_amount_cents: 100,
        tax_year: 2026,
      });
      expect(insertResult.error).not.toBeNull();
    });

    test("treasurer can insert, select, and update a receipt", async () => {
      const insertResult = await clients.treasurer
        .from("receipt")
        .insert({
          supporter_id: fixtureSupporterId,
          receipt_no: "RLS-TEST-TREASURER-0001",
          donation_ids: [fixtureDonationId],
          total_amount_cents: 10000,
          tax_year: 2026,
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      expect(insertResult.data?.id).toBeDefined();
      const createdReceiptId = insertResult.data?.id as string;

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

      // Clean up this test's own receipt (not part of the shared fixture set).
      await clients.service.from("receipt").delete().eq("id", createdReceiptId);
    });

    test("admin can manage receipts too", async () => {
      const insertResult = await clients.admin
        .from("receipt")
        .insert({
          supporter_id: fixtureSupporterId,
          receipt_no: "RLS-TEST-ADMIN-0001",
          donation_ids: [fixtureDonationId],
          total_amount_cents: 10000,
          tax_year: 2026,
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      const createdReceiptId = insertResult.data?.id as string;
      await clients.service.from("receipt").delete().eq("id", createdReceiptId);
    });
  });
```

- [ ] **Step 4: Run the full suite against the local stack**

Start the stack if needed, then:

Run: `bun run test:rls`
Expected: all tests pass, including the new `payment` and `receipt` blocks.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 7: Commit**

```bash
git add supabase/rls-tests/moneyPii.rls.test.ts
git commit -m "feat: add payment and receipt RLS behavioral coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `consent` and `recurring_mandate` tests

**Files:**
- Modify: `supabase/rls-tests/moneyPii.rls.test.ts`

- [ ] **Step 1: Add fixture seeding for a `consent` row**

In `beforeAll`, after the payment fixture insert, add (consent requires `supporter_id`, `channel`, `status`, `source`):

```ts
    const { data: consentRow, error: consentError } = await service
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
```

Add `let fixtureConsentId: string;` alongside the other fixture-id declarations.

In `afterAll`, add cleanup (before the supporter delete):

```ts
    if (fixtureConsentId) {
      await clients.service.from("consent").delete().eq("id", fixtureConsentId);
    }
```

`recurring_mandate` needs no fixture row — every role is blocked from selecting anything regardless of whether a row exists, so the tests only need to confirm that inserting/selecting is universally blocked. No fixture insert is needed for this table.

- [ ] **Step 2: Add the `consent` describe block**

Add after the `receipt` describe block:

```ts
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
      const selectResult = await clients.staff.from("consent").select("id").eq("id", fixtureConsentId);
      expect(selectResult.error).toBeNull();
      expect(selectResult.data).toHaveLength(1);

      const updateResult = await clients.staff
        .from("consent")
        .update({ status: "opt_out" })
        .eq("id", fixtureConsentId);
      expect(updateResult.error).toBeNull();

      // Restore for subsequent tests/tasks that might rely on the fixture's state.
      await clients.service.from("consent").update({ status: "opt_in" }).eq("id", fixtureConsentId);
    });

    test("treasurer can select and update", async () => {
      const { error } = await clients.treasurer
        .from("consent")
        .update({ status: "opt_in" })
        .eq("id", fixtureConsentId);
      expect(error).toBeNull();
    });

    test("admin can select and update", async () => {
      const { error } = await clients.admin
        .from("consent")
        .update({ status: "opt_in" })
        .eq("id", fixtureConsentId);
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
```

- [ ] **Step 3: Add the `recurring_mandate` describe block**

Add after the `consent` describe block. This table has zero policies and no grant to any non-service-role — every role is blocked for every operation, unconditionally:

```ts
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
```

- [ ] **Step 4: Run the full suite against the local stack**

Start the stack if needed, then:

Run: `bun run test:rls`
Expected: all 7 tables' describe blocks pass.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 7: Commit**

```bash
git add supabase/rls-tests/moneyPii.rls.test.ts
git commit -m "feat: add consent and recurring_mandate RLS behavioral coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: CI job, documentation, and final verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/rls-testing.md`

- [ ] **Step 1: Add the non-blocking `rls-matrix` CI job**

Read `.github/workflows/ci.yml` first to find its exact current end, since other work may have touched this file since this plan was written (its `brand-verify` job is the most recently added at plan-writing time). Add a new job at the end, mirroring `brand-verify`'s shape but scoped to the RLS suite:

```yaml
  # Separate job so the fast gate stays fast. Non-blocking until proven green
  # repeatedly on main, then promote via branch protection (matching the
  # process already used for brand-verify).
  rls-matrix:
    runs-on: ubuntu-latest
    needs: verify
    timeout-minutes: 15
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - run: bun install --frozen-lockfile

      - name: Start local Supabase stack
        run: bunx supabase start

      - name: Run RLS behavioral tests
        run: bun run test:rls

      - name: Stop local Supabase stack
        if: always()
        run: bunx supabase stop
```

Note: GitHub Actions' `ubuntu-latest` runners have Docker preinstalled, so `bunx supabase start` should work without additional setup. If this job fails in CI for environment reasons unrelated to the RLS logic itself (e.g., a Docker-in-CI networking quirk), that's expected to surface and be triaged once this job is observed running in CI for the first time — it's `continue-on-error: true`, so it cannot block other work while that's sorted out.

- [ ] **Step 2: Write `docs/rls-testing.md`**

```markdown
# RLS Behavioral Testing

`supabase/rls-tests/moneyPii.rls.test.ts` runs real queries against a real local Supabase
stack, as five different roles (anon, an authenticated user with no admin role, staff,
treasurer, admin), to prove that Row Level Security policies actually allow and block
what they're supposed to -- not just that the policy SQL text looks right.

This is separate from the fast, dependency-injected-fake test suite (`bun test`), which
never touches a real database. Plain `bun test` skips this file cleanly if no local
Supabase stack is reachable.

## Running locally

1. Install the Supabase CLI (no global install needed -- `bunx supabase` fetches it
   on demand).
2. If this is the first time in this checkout, run `bunx supabase init --workdir .`
   (creates `supabase/config.toml`, untracked -- do not commit it; it's local-only
   scaffolding). Skip this step if `supabase/config.toml` already exists.
3. Check for port conflicts: `docker ps --format "{{.Ports}}"`. If this machine runs
   other local Supabase/Postgres stacks, remap `supabase/config.toml`'s port fields
   (`[api] port`, `[db] port` + `shadow_port`, `[db.pooler] port`, `[studio] port`,
   `[inbucket] port`, the analytics `port`) to a free 10-port block before starting.
4. `bunx supabase start` -- applies every migration to a fresh local Postgres and
   starts the full local stack (Postgres, GoTrue, PostgREST, Storage, Studio).
5. `bun run test:rls` -- runs the RLS behavioral suite against that stack.
6. `bunx supabase stop` when done.

## Scope

Currently covers the 7 highest-risk tables (money/PII): `admin_user`, `supporter`,
`donation`, `payment`, `receipt`, `consent`, `recurring_mandate`. Extending to the
remaining RLS-enabled tables in this schema is a separate, follow-up task -- the
harness and fixture-seeding pattern in `moneyPii.rls.test.ts` are meant to be
copied for additional tables, not redesigned.
```

- [ ] **Step 3: Final full-stack verification**

Start the stack (if not already running), then run the complete gate one more time:

```bash
bun run test:rls
bun test
bunx tsc --noEmit
bun run lint
```

Expected: all pass, no errors. This confirms all 5 tasks' cumulative changes work together, not just each task in isolation.

- [ ] **Step 4: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/rls-testing.md
git commit -m "ci: add non-blocking rls-matrix job, document local RLS testing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
