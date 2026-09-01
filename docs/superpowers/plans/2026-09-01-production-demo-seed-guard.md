# Production Demo-Seed Guard (BP-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent both of this repo's demo-seeding scripts (`scripts/seed-admin.js`, `supabase/seed.sql`) from accidentally running against the live production Supabase project.

**Architecture:** Two independent guards, since the two scripts have fundamentally different environment awareness. `seed-admin.js` (a Node script with real env-var access) gets a hard, non-overridable block comparing the target Supabase project's ref against the known production ref. `seed.sql` (pure SQL, no npm/CI invocation, no way to introspect which project it's connected to) gets an explicit `-v confirm=yes` opt-in gate that aborts the transaction if missing.

**Tech Stack:** Node.js (ESM), Bun test, PostgreSQL/`psql`.

---

## File Structure

**Modify:**
- `scripts/seed-admin.js` — refactored to move its existing top-level logic into a `main()` function behind an entry-point guard (matching the established pattern already used by `scripts/import-adoption-guide-drafts.mjs`), so its new project-ref-checking functions can be imported and unit-tested without triggering real env reads or Supabase API calls. Adds the production-ref hard block.
- `supabase/seed.sql` — adds a confirmation-gate block as the file's first new statement.

**Create:**
- `scripts/seed-admin.test.ts` — unit tests for the new project-ref-extraction/comparison functions.

---

### Task 1: Refactor `seed-admin.js` and add the production-ref hard block

**Files:**
- Modify: `scripts/seed-admin.js`
- Create: `scripts/seed-admin.test.ts`

The current `scripts/seed-admin.js` runs all of its logic (env loading, validation, the actual Supabase Auth calls) as top-level module code, ending with an unconditional `main().catch(...)` call at the bottom. This means simply adding an `export function` to the file would NOT make it safely testable — importing the module for a test would immediately execute real env-file reads, validation exits, and (if env vars happened to be set) real network calls. This task first restructures the file to move all of that into a `main()` function invoked only when the file is run directly — mirroring the exact pattern already used by `scripts/import-adoption-guide-drafts.mjs` (check its last 6 lines for the idiom being mirrored: `const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""; if (invokedPath === fileURLToPath(import.meta.url)) { main().catch(...) }`) — then adds the new guard.

- [ ] **Step 1: Write the failing tests**

Create `scripts/seed-admin.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import {
  extractProjectRef,
  isProductionProjectRef,
  PRODUCTION_PROJECT_REF,
} from "./seed-admin.js";

describe("extractProjectRef", () => {
  test("extracts the project ref from a real-shaped Supabase URL", () => {
    expect(extractProjectRef("https://iihqjzilgawhfdhdevam.supabase.co")).toBe(
      "iihqjzilgawhfdhdevam",
    );
  });

  test("extracts the project ref from a different, non-production Supabase URL", () => {
    expect(extractProjectRef("https://abcdefghijklmnop.supabase.co")).toBe("abcdefghijklmnop");
  });

  test("returns null for a malformed or non-Supabase URL", () => {
    expect(extractProjectRef("https://example.com")).toBeNull();
    expect(extractProjectRef("not-a-url")).toBeNull();
  });

  test("returns null for undefined or empty input", () => {
    expect(extractProjectRef(undefined)).toBeNull();
    expect(extractProjectRef("")).toBeNull();
  });
});

describe("isProductionProjectRef", () => {
  test("returns true for the production Supabase URL", () => {
    expect(isProductionProjectRef(`https://${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(true);
  });

  test("returns false for a different Supabase project's URL", () => {
    expect(isProductionProjectRef("https://abcdefghijklmnop.supabase.co")).toBe(false);
  });

  test("returns false for a malformed URL", () => {
    expect(isProductionProjectRef("not-a-url")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test scripts/seed-admin.test.ts`
Expected: FAIL — `seed-admin.js` doesn't export `extractProjectRef`/`isProductionProjectRef`/`PRODUCTION_PROJECT_REF` yet (and today's version of the file would also throw/exit immediately on import, since its validation logic runs at module top level with no env vars set in the test process — this failure is expected and is exactly the problem Step 3 fixes).

- [ ] **Step 3: Rewrite `scripts/seed-admin.js`**

Replace the entire file with:

```javascript
/**
 * Admin Account Seeder  —  scripts/seed-admin.js
 *
 * Creates or updates an admin user in Supabase Auth so you can log in at:
 *   http://localhost:8080/admin/login
 *
 * Auth system: Supabase Auth (signInWithPassword). No custom user table.
 * Password hashing: handled by Supabase internally (bcrypt).
 * Admin creation requires the service_role key (bypasses email confirmation).
 *
 * Requirements:
 *   VITE_SUPABASE_URL=...          (already in .env)
 *   SUPABASE_SERVICE_ROLE_KEY=...  (Supabase Dashboard → Settings → API → service_role)
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_PASSWORD=your-password
 *   ADMIN_NAME=Admin               (optional, defaults to "Admin")
 *   ADMIN_ROLE=admin                (optional: staff, treasurer, admin)
 *
 * Run:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-this npm run seed:admin
 *   node scripts/seed-admin.js
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Env loading ──────────────────────────────────────────────────────────────

function readEnv() {
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.trim().match(/^([^#=][^=]*?)\s*=\s*(.*)$/);
      if (m) merged[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...merged, ...process.env };
}

// ── Production guard ─────────────────────────────────────────────────────────
//
// This script is a local development tool only (see docstring above) -- there
// is no legitimate reason to run it against the live production Supabase
// project. These are pure, exported functions with no side effects, so they
// can be unit-tested without reading real env files or making real Supabase
// Auth calls (see scripts/seed-admin.test.ts).

export const PRODUCTION_PROJECT_REF = "iihqjzilgawhfdhdevam";

export function extractProjectRef(supabaseUrl) {
  if (typeof supabaseUrl !== "string") return null;
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : null;
}

export function isProductionProjectRef(supabaseUrl) {
  return extractProjectRef(supabaseUrl) === PRODUCTION_PROJECT_REF;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnv();

  const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_EMAIL = env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
  const ADMIN_NAME = env.ADMIN_NAME || "Admin";
  const ADMIN_ROLE = env.ADMIN_ROLE || "admin";

  // ── Validation ───────────────────────────────────────────────────────────

  if (!SUPABASE_URL) {
    console.error("✗ VITE_SUPABASE_URL not set.");
    process.exit(1);
  }
  if (isProductionProjectRef(SUPABASE_URL)) {
    console.error("✗ Refusing to run against the production Supabase project.");
    console.error(`  Detected project ref: ${PRODUCTION_PROJECT_REF}`);
    console.error("  This script is a local development tool only. To manage a production");
    console.error("  admin account, use the Supabase Dashboard directly.");
    process.exit(1);
  }
  if (!SERVICE_KEY) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set.");
    console.error("  Get it: Supabase Dashboard → Project Settings → API → service_role");
    console.error("  Add to .env: SUPABASE_SERVICE_ROLE_KEY=eyJ...");
    process.exit(1);
  }
  if (!ADMIN_EMAIL) {
    console.error("✗ ADMIN_EMAIL not set.");
    console.error("  Example: ADMIN_EMAIL=admin@example.com npm run seed:admin");
    process.exit(1);
  }
  if (!ADMIN_PASSWORD) {
    console.error("✗ ADMIN_PASSWORD not set.");
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error("✗ ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }
  if (!["staff", "treasurer", "admin"].includes(ADMIN_ROLE)) {
    console.error("✗ ADMIN_ROLE must be one of: staff, treasurer, admin.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Admin seeder — target: ${ADMIN_EMAIL}\n`);

  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("✗ Cannot list users:", listErr.message);
    console.error("  Verify SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key.");
    process.exit(1);
  }

  const existing = users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  let authUser = existing;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: ADMIN_ROLE },
      app_metadata: { role: ADMIN_ROLE },
    });
    if (error) {
      console.error("✗ Update failed:", error.message);
      process.exit(1);
    }
    authUser = data.user;
    console.log("✓ Admin updated (existing account)");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: ADMIN_ROLE },
      app_metadata: { role: ADMIN_ROLE },
    });
    if (error) {
      console.error("✗ Create failed:", error.message);
      process.exit(1);
    }
    authUser = data.user;
    console.log("✓ Admin created");
  }

  if (!authUser?.id) {
    console.error("✗ Auth user was not returned by Supabase.");
    process.exit(1);
  }

  const { error: adminUserError } = await supabase.from("admin_user").upsert(
    {
      auth_user_id: authUser.id,
      email: ADMIN_EMAIL.toLowerCase(),
      role: ADMIN_ROLE,
      status: "active",
    },
    { onConflict: "auth_user_id" },
  );

  if (adminUserError) {
    console.error("✗ Admin role sync failed:", adminUserError.message);
    console.error("  Make sure Supabase migrations have been applied before seeding admin users.");
    process.exit(1);
  }
  console.log(`✓ Admin role synced (${ADMIN_ROLE})`);

  console.log("");
  console.log(`  Login URL : http://localhost:8080/admin/login`);
  console.log(`  Email     : ${ADMIN_EMAIL}`);
  console.log(`  Password  : [hidden]`);
  console.log(`  Name      : ${ADMIN_NAME}`);
  console.log(`  Role      : ${ADMIN_ROLE}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
```

This preserves every existing message and behavior exactly — the only functional addition is the `isProductionProjectRef(SUPABASE_URL)` check (placed immediately after the existing `SUPABASE_URL` presence check, before any other validation) and the three new exports. Everything else is the same logic, just moved inside `main()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test scripts/seed-admin.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Manually verify the script still runs correctly end to end**

This refactor changes control flow (top-level code → `main()` behind an entry-point guard), so confirm the script still behaves identically when actually invoked, not just when imported for tests:

```bash
node scripts/seed-admin.js
```

Expected: since no `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set in your shell (unless you've exported them), this should print `✗ VITE_SUPABASE_URL not set.` or one of the other existing validation errors and exit with status 1 — the exact same behavior as before this refactor, proving `main()` still runs when the file is executed directly.

- [ ] **Step 6: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed-admin.js scripts/seed-admin.test.ts
git commit -m "feat: block seed-admin.js from running against the production Supabase project"
```

---

### Task 2: Add the confirmation gate to `supabase/seed.sql`

**Files:**
- Modify: `supabase/seed.sql`

`supabase/seed.sql` has no npm script or CI reference anywhere in this repo — it's only ever run manually via `psql -f supabase/seed.sql` or pasted into the Supabase Dashboard SQL editor, so it has no way to know which project it's connected to. This task adds an explicit, conscious opt-in requirement instead: every invocation must pass `-v confirm=yes`, or the whole seed transaction aborts before any row is touched.

- [ ] **Step 1: Add the confirmation gate**

`supabase/seed.sql` currently begins:

```sql
begin;

set local timezone to 'Asia/Hong_Kong';

-- HKSCDA demo seed data.
-- Safe to rerun: every row uses fixed demo IDs and ON CONFLICT upserts.
-- Domain data only: this file must not create Supabase Auth users or admin_user rows.
```

Replace those opening lines with:

```sql
begin;

set local timezone to 'Asia/Hong_Kong';

-- Requires an explicit -v confirm=yes on every invocation, so an accidental
-- run (wrong connection string, muscle memory, pasting into the wrong
-- Supabase Dashboard SQL editor tab) requires a deliberate extra step
-- instead of "just working". This does not detect which project is
-- connected -- supabase/seed.sql has no programmatic way to know that -- it
-- only prevents a silent, unintentional run.
--
-- Run as: psql <connection-string> -v confirm=yes -f supabase/seed.sql
--
-- If pasting into the Supabase Dashboard SQL editor instead (which does not
-- support psql variable substitution), replace :'confirm' below with the
-- literal 'yes' before running, or this file will fail with a syntax error
-- at the `set local myvars.confirm` line -- which still prevents a silent
-- accidental run, just with a less friendly error message.
set local myvars.confirm = :'confirm';

do $$
begin
  if current_setting('myvars.confirm', true) is distinct from 'yes' then
    raise exception
      'Refusing to run supabase/seed.sql without explicit confirmation. '
      'Re-run as: psql <connection-string> -v confirm=yes -f supabase/seed.sql '
      '(or set myvars.confirm = ''yes'' before running this file in the Supabase '
      'Dashboard SQL editor).';
  end if;
end $$;

-- HKSCDA demo seed data.
-- Safe to rerun: every row uses fixed demo IDs and ON CONFLICT upserts.
-- Domain data only: this file must not create Supabase Auth users or admin_user rows.
```

No other line in the file changes — every seed `insert`/`on conflict` statement after this point, and the final `commit;`, stay exactly as they are today.

- [ ] **Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: require explicit confirmation to run supabase/seed.sql"
```

---

### Task 3: Verify both guards against a disposable Postgres container

**Files:** none (manual verification only).

`supabase/seed.sql`'s guard reads/writes only a session-level Postgres setting (`current_setting`/`set local`) — it needs no tables, no schema, and no migrations applied to verify, so this can be checked against a bare `postgres:16-alpine` container in isolation, without replaying this repo's full migration history (which would fail immediately on an unrelated pre-existing migration's assumptions about schemas that a vanilla container doesn't have — the same limitation documented in the content-media-upload plan's Task 8).

- [ ] **Step 1: Start a disposable Postgres container**

```bash
docker run --rm -d --name seed-guard-verify -e POSTGRES_PASSWORD=postgres -p 5434:5432 postgres:16-alpine
```

If Docker is unavailable in this environment, stop here and tell the user explicitly — do not skip this step silently.

- [ ] **Step 2: Confirm the guard blocks a run with no `-v confirm`**

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" -f supabase/seed.sql
```

Expected: this aborts before reaching any real `insert` statement (this bare container has none of this repo's tables, so those would fail anyway, but the point is the guard trips first). The exact error depends on how `psql` handles the undefined `:'confirm'` reference, and either outcome confirms the guard works — don't be surprised if it's not exactly the first one:
- Most likely: `psql`'s `:'confirm'` quoted-substitution form falls back to an empty string for an undefined variable, so `set local myvars.confirm = '';` runs, `current_setting(...)` returns `''`, and you see `ERROR:  Refusing to run supabase/seed.sql without explicit confirmation. ...` (the guard's own `raise exception` message).
- Possible alternative: if `psql` instead leaves `:'confirm'` completely unsubstituted in this `psql`/environment's version, you'll see a Postgres syntax error at the `set local myvars.confirm = :'confirm';` line instead.

Either way, confirm the failure happens at or before the guard block — NOT a "relation does not exist" error from further down the file — and that no rows are inserted (the whole transaction aborts).

- [ ] **Step 3: Confirm the guard passes with `-v confirm=yes`**

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" -v confirm=yes -f supabase/seed.sql
```

Expected: the guard block passes with no error; the run then fails on the first real `insert` statement (e.g. `relation "living_area" does not exist`), since this bare container has none of this repo's schema applied — that failure is expected and fine, it's outside this guard's scope. What matters is that the FIRST error encountered is now the missing-table error, not the guard's confirmation error, proving `-v confirm=yes` correctly satisfies the gate.

- [ ] **Step 4: Confirm `seed-admin.js`'s production guard fires correctly**

```bash
VITE_SUPABASE_URL=https://iihqjzilgawhfdhdevam.supabase.co node scripts/seed-admin.js
```

Expected: prints `✗ Refusing to run against the production Supabase project.` and the following three explanatory lines, then exits with status 1 — confirming the guard fires for the real production URL shape when the script is actually invoked (not just in the unit tests).

- [ ] **Step 5: Tear down the container**

```bash
docker stop seed-guard-verify
```

- [ ] **Step 6: Final full-suite check**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors — confirming Task 1's refactor and Task 2's SQL change together haven't broken anything else in the repo.
