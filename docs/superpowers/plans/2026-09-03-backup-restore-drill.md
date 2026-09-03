# Manual Backup/Restore Scripts and a Drilled Recovery Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual backup and restore scripts for HKSCDA's Supabase database, and prove they work with a real, drilled backup→loss→restore→verify cycle against the local Supabase CLI stack.

**Architecture:** `scripts/backup-database.mjs` wraps `bunx supabase db dump --data-only` (data only, not schema — schema lives in version-controlled migrations and is recovered via `supabase db push`/`db reset`, not from a backup file). `scripts/restore-database.mjs` pipes a dump file into `docker exec ... psql` against the local Supabase stack's own Postgres container only — it has no code path that can reach a remote target. A runbook documents real production usage as a human-run procedure.

**Tech Stack:** Bun (`Bun.spawnSync`), Supabase CLI (via `bunx`), Docker, Postgres (`psql`, bundled in the Supabase CLI's local Postgres container image).

---

## Verified current state (do not re-derive — confirmed by actually running every command below during plan-writing)

- **`supabase/config.toml` does not exist on `main` yet** — it only exists (committed) on the unmerged `feat/rls-behavioral-matrix` branch (PR [YNWAforever/hkscda#102](https://github.com/YNWAforever/hkscda/pull/102), sets `project_id = "hkscda"`, ports remapped to the `55320-55329` block). This branch does not depend on that PR merging first — Task 1 creates its own transient local config the same way earlier fresh-DB-migration-fix work this session did, without committing it (matching that established precedent, since committing it here would create an avoidable merge conflict with PR #102 over the exact same file).
- **`supabase db dump` with no extra flags dumps SCHEMA ONLY, not schema+data** — confirmed by actually running it (a 7,493-line file with zero `Data for Name` markers). This contradicts a naive assumption that a plain dump captures everything. `--data-only` is required to actually capture data, and this repo does not need schema in the backup at all, since `supabase/migrations/` already is the durable, version-controlled schema source of truth.
- **The local stack's Postgres container is named `supabase_db_hkscda`**, confirmed via `docker ps` (derived from `project_id = "hkscda"` in `supabase/config.toml`). Every other local-stack container follows the same `supabase_<service>_hkscda` pattern.
- **Restoring a `--data-only` dump onto a database that has already run its own migrations produces expected `duplicate key value violates unique constraint` errors** for tables the migrations themselves seed with reference data (`about_page_content`, `adoption_fees`, `care_topics`, `coordinator_status_category`, `site_config`, `payment_public_config`, storage `buckets`, `knowledge_posts`, `adoption_rules`, `site_document_slots`, and others) — confirmed by actually running the restore and observing 11 such errors. This is harmless: `pg_dump`'s data-only output isn't wrapped in one transaction, so each table's `INSERT` commits independently — genuinely-new rows (a real donor record, in production; the drill's own fixture row, here) land successfully regardless. `psql` also exits `0` even when errors occur mid-replay (confirmed: 384 "already exists" errors from a schema-only dump replay still produced exit code `0`) — **exit code alone is never a reliable success signal for this restore**, only an actual post-restore data check is.
- **`pg_dump` (invoked internally by `supabase db dump`) emits a real, reproducible warning** about circular foreign-key constraints between `content_item` and `content_media`: `"You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints."` This did not cause an actual failure in the verified drill, but is worth documenting since a future schema change could make it matter.
- **Real Postgres connection details for the local stack** (from `bunx supabase start` output, matching this session's established RLS-matrix port convention): `postgresql://postgres:postgres@127.0.0.1:55322/postgres` — user `postgres`, database `postgres`.

---

## File Structure

**Create:**
- `scripts/backup-database.mjs` — wraps `supabase db dump --data-only`.
- `scripts/restore-database.mjs` — wraps `docker exec ... psql` against the local stack only.
- `docs/backup-restore-runbook.md` — the operator-facing runbook.

**Modify:**
- `package.json` — add `backup:db` and `restore:db` scripts.
- `.gitignore` — add `backups/`.

---

### Task 1: Backup and restore scripts, drilled against the local stack

**Files:**
- Create: `scripts/backup-database.mjs`
- Create: `scripts/restore-database.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `scripts/backup-database.mjs`**

```js
import { mkdirSync } from "node:fs";

// Data only, deliberately -- this repo's schema lives in version-controlled
// migrations (supabase/migrations/) and is recovered via `supabase db push`
// or `supabase db reset`, not from a backup file. A plain `supabase db dump`
// with no flags dumps SCHEMA ONLY (confirmed empirically), so `--data-only`
// is required for this script to capture anything worth calling a backup.
const isLocal = process.argv.includes("--local");
const dbUrl = process.env.SUPABASE_DB_URL;

if (!isLocal && !dbUrl) {
  console.error(
    "Set SUPABASE_DB_URL to your Supabase connection string (percent-encoded), " +
      "or pass --local to back up the local dev stack instead.",
  );
  process.exit(1);
}

mkdirSync("backups", { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = `backups/hkscda-${timestamp}.sql`;

const dumpArgs = isLocal
  ? ["supabase", "db", "dump", "--local", "--data-only", "-f", outputFile]
  : ["supabase", "db", "dump", "--db-url", dbUrl, "--data-only", "-f", outputFile];

const result = Bun.spawnSync(["bunx", ...dumpArgs], { stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) {
  console.error("Backup failed.");
  process.exit(result.exitCode ?? 1);
}

console.log(`Backup written to ${outputFile}`);
```

- [ ] **Step 2: Create `scripts/restore-database.mjs`**

```js
import { existsSync, readFileSync } from "node:fs";

// This script only restores into the LOCAL Supabase dev stack -- it has no
// code path capable of reaching a remote/production target. Restoring into
// production is a deliberate, human-run procedure documented in
// docs/backup-restore-runbook.md, using your own Postgres client tools and
// credentials, not this script.
const dumpFile = process.argv[2];
if (!dumpFile) {
  console.error("Usage: bun run restore:db <path-to-dump-file>");
  process.exit(1);
}
if (!existsSync(dumpFile)) {
  console.error(`Dump file not found: ${dumpFile}`);
  process.exit(1);
}

const psResult = Bun.spawnSync(
  ["docker", "ps", "--filter", "name=supabase_db_hkscda", "--format", "{{.Names}}"],
  { stdout: "pipe" },
);
const container = psResult.stdout.toString().trim();
if (!container) {
  console.error(
    "No running container named supabase_db_hkscda found. This script only " +
      "restores into the local dev stack -- run `bunx supabase start` first.",
  );
  process.exit(1);
}

console.log(`Restoring ${dumpFile} into local container ${container}...`);
console.log(
  "Note: 'duplicate key'/'already exists' errors below for migration-seeded\n" +
    "reference tables (e.g. adoption_fees, site_config, care_topics) are\n" +
    "EXPECTED when restoring onto a database that has already run its\n" +
    "migrations -- those rows already exist from the migration itself.\n" +
    "Any OTHER kind of error should be investigated. This command's exit\n" +
    "code is not a reliable success signal either way -- verify success by\n" +
    "checking your actual data afterward.\n",
);

const dumpContent = readFileSync(dumpFile);
const result = Bun.spawnSync(
  ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres"],
  { stdin: dumpContent, stdout: "inherit", stderr: "inherit" },
);

console.log(
  `\nRestore command finished (exit code ${result.exitCode}). Review the output above, then verify your data.`,
);
```

Before running this, verify `Bun.spawnSync`'s `stdin` option actually accepts a `Buffer` (from `readFileSync`) directly to pipe as the child process's stdin, per Bun's current API — this plan's author verified the overall `docker exec -i ... psql -U postgres -d postgres < dump.sql` shell pipeline works during design-time investigation, but confirm the exact `Bun.spawnSync` option shape at implementation time (Bun's own docs/type definitions) rather than assuming; adjust if the API differs (e.g., if it requires a string, a `Uint8Array`, or a different stdin mode).

- [ ] **Step 3: Add the npm scripts**

In `package.json`'s `"scripts"` block, add (near the other `verify:*`/db-related scripts):

```json
    "backup:db": "bun scripts/backup-database.mjs",
    "restore:db": "bun scripts/restore-database.mjs",
```

- [ ] **Step 4: Add the `.gitignore` entry**

Add to `.gitignore` (dump files can contain real production data when used for real — they must never be committed):

```
# Local database backups -- never commit; may contain real production data
backups/
```

- [ ] **Step 5: Verify both scripts fail safely before the local stack even exists**

Before starting any stack, confirm the two safety behaviors the spec explicitly requires:

```bash
unset SUPABASE_DB_URL
bun scripts/backup-database.mjs
```

Expected: exits non-zero immediately with the "Set SUPABASE_DB_URL..." message — no hang, no attempt to run `supabase db dump`, no file created under `backups/`.

```bash
echo "dummy" > /tmp/dummy-dump.sql
bun scripts/restore-database.mjs /tmp/dummy-dump.sql
```

Expected: exits non-zero with the "No running container named supabase_db_hkscda found..." message — since nothing is running yet, this must be the very first thing to fail, before any `docker exec` is attempted. Clean up: `rm /tmp/dummy-dump.sql`.

If either script behaves differently (hangs, produces a partial file, or attempts to proceed), fix it before moving on — these are the two specific safety guarantees the approved design spec calls out by name.

- [ ] **Step 6: Set up the local Supabase stack for the drill**

Check whether `supabase/config.toml` already exists in this worktree (`ls supabase/config.toml`). If it doesn't (expected, per "Verified current state" above), create one:

```bash
bunx supabase init --workdir .
```

Then check for port conflicts (`docker ps --format "{{.Ports}}"` — this machine runs other unrelated local Supabase stacks) and remap `supabase/config.toml`'s port fields if needed, matching the `55320-55329` block convention already established and verified free earlier this session (`[api] port`, `[db] port` + `shadow_port`, `[db.pooler] port`, `[studio] port`, `[local_smtp] port`, the analytics `port`). Set `project_id = "hkscda"` if not already set (`supabase init` may not set this automatically). Do NOT commit `supabase/config.toml` in this task's commit — it's transient local setup, matching the same out-of-scope treatment this session gave it in the two earlier fresh-DB-migration-fix branches, to avoid an avoidable merge conflict with the still-open RLS matrix PR which already owns committing this file.

Start the stack:

```bash
bunx supabase start
```

- [ ] **Step 7: Seed a non-sensitive fixture row**

```bash
docker exec supabase_db_hkscda psql -U postgres -d postgres -c "insert into public.supporter (name, email) values ('Backup Drill Test Supporter', 'backup-drill-test@example.test');"
```

Expected: `INSERT 0 1`.

- [ ] **Step 8: Run a real backup and verify it actually captured the fixture data**

```bash
bun run backup:db -- --local
```

Expected: a new file at `backups/hkscda-<timestamp>.sql`. Confirm it actually contains the fixture row:

```bash
grep "backup-drill-test@example.test" backups/hkscda-*.sql
```

Expected: a matching `INSERT INTO "public"."supporter" ...` line is found. If nothing is found, the backup script has a real bug — stop and fix it before proceeding (don't treat a silently-empty backup as acceptable).

- [ ] **Step 9: Simulate data loss**

```bash
bunx supabase db reset
```

Expected: all migrations replay successfully. Confirm the fixture row is genuinely gone:

```bash
docker exec supabase_db_hkscda psql -U postgres -d postgres -c "select count(*) from public.supporter where email = 'backup-drill-test@example.test';"
```

Expected: count `0`.

- [ ] **Step 10: Restore and verify recovery**

```bash
bun run restore:db backups/hkscda-<timestamp>.sql
```

(Use the actual filename from Step 8.) Expected: the script runs to completion, printing the note about expected duplicate-key noise, followed by real `psql` output — some `ERROR: duplicate key value violates unique constraint` lines for migration-seeded tables are expected here and are NOT a failure (per "Verified current state" above); do not treat their presence as this task failing. Confirm the actual thing that matters — the fixture row is back:

```bash
docker exec supabase_db_hkscda psql -U postgres -d postgres -c "select name, email from public.supporter where email = 'backup-drill-test@example.test';"
```

Expected: one row, `Backup Drill Test Supporter` / `backup-drill-test@example.test`. If this query returns zero rows, the restore genuinely failed — investigate before proceeding, don't paper over it.

- [ ] **Step 11: Clean up the drill's own state**

```bash
docker exec supabase_db_hkscda psql -U postgres -d postgres -c "delete from public.supporter where email = 'backup-drill-test@example.test';"
rm backups/hkscda-*.sql
bunx supabase stop
```

Confirm via `docker ps` that no `hkscda`-named containers remain running, and that this didn't touch any of the other unrelated Supabase/Postgres stacks this machine runs for other projects.

- [ ] **Step 12: Commit**

```bash
git add scripts/backup-database.mjs scripts/restore-database.mjs package.json .gitignore
git commit -m "feat: add manual database backup/restore scripts, drilled against local stack

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(`supabase/config.toml`, if you created one in Step 6, stays uncommitted/untracked — do not include it in this commit.)

---

### Task 2: Write the recovery runbook

**Files:**
- Create: `docs/backup-restore-runbook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Database Backup and Restore Runbook

HKSCDA's Supabase project (ref `iihqjzilgawhfdhdevam`) is on the free tier, which has no
built-in automatic backups or point-in-time recovery. `scripts/backup-database.mjs` and
`scripts/restore-database.mjs` give you a manual, on-demand way to back up and recover
the database's data until/unless that changes (upgrading to a paid tier with built-in
PITR, or building scheduled automated backups, are both reasonable future upgrades --
neither is done here).

## What this backs up (and what it deliberately doesn't)

This backs up **data only** -- donor records, submissions, admin-authored content edits,
and everything else that lives only in the live database. It does **not** back up schema.
That's intentional: this repo's schema is already fully captured in version-controlled
migrations (`supabase/migrations/`), which is a more durable and reviewable source of
truth than a snapshot in a backup file. Recovering schema means running
`bunx supabase db push` (or, for a from-scratch project, letting the migrations apply
during `bunx supabase start`/project setup) -- not restoring from one of these dumps.

## Taking a backup

```bash
SUPABASE_DB_URL="postgresql://postgres:<your-password>@db.iihqjzilgawhfdhdevam.supabase.co:5432/postgres" bun run backup:db
```

Get the real connection string from the Supabase dashboard (Project Settings -> Database
-> Connection string -> URI). It must be percent-encoded if your password contains special
characters. **Never commit this value or paste it into a shared chat/ticket** -- treat it
like any other production credential.

This writes a timestamped file to `backups/` (gitignored -- these files can contain real
donor data and must never be committed). **A local `backups/` directory on one laptop is
not itself durable disaster-recovery storage.** After taking a backup you intend to actually
rely on, move the file to secure, off-machine storage yourself (e.g. an encrypted cloud
storage bucket) -- this repo's tooling stops at producing the file.

## Restoring in a real emergency

`scripts/restore-database.mjs` only restores into the **local** Supabase dev stack
(`bunx supabase start`) -- it has no code path that can reach a remote target, by design,
so it can never be the thing that accidentally overwrites production. Use it to rehearse
a restore, verify a backup file is good, or recover your own local dev database.

To restore into a **real** remote target (recovering the actual production database after
a real incident), do this yourself, deliberately, using your own Postgres client tools and
credentials:

```bash
psql "$YOUR_REAL_TARGET_CONNECTION_STRING" < backups/hkscda-<timestamp>.sql
```

Some `ERROR: duplicate key value violates unique constraint` lines are expected if the
target has already run its own migrations (which seed some reference tables) -- these are
harmless; each `INSERT` in a data-only dump commits independently, so your real data still
lands. Any *other* kind of error is worth investigating before trusting the restore.
**Verify success by checking your actual data afterward, never by the restore command's
exit code alone** -- `psql` can exit `0` even when individual statements failed.

There is one known, reproducible warning from the underlying `pg_dump` about a circular
foreign-key relationship between `content_item` and `content_media`:

```
pg_dump: warning: there are circular foreign-key constraints among these tables
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers
```

This did not cause an actual restore failure when drilled (2026-09-03), but if a future
schema change makes it matter, `psql --set ON_ERROR_STOP=0 -c "SET session_replication_role = replica;"`
before replaying the dump (and setting it back to `origin` after) is the standard Postgres
way to temporarily disable trigger/FK enforcement during a bulk restore.

## What has (and hasn't) actually been proven

This runbook's backup/restore mechanics were drilled end-to-end on 2026-09-03 against the
**local** Supabase CLI stack: a fixture row was seeded, backed up, the local database was
reset (simulating total data loss), and the row was successfully restored and verified
present again. This proves the dump file format and restore mechanics genuinely work
against a real Postgres instance running this repo's actual schema and migrations.

It does **not** prove a real production dump/restore round-trip. That requires your own
production credentials, and -- given the risk of a mistake overwriting real donor
records -- should only ever be run deliberately by a human against a true throwaway
target (e.g., a fresh scratch Supabase project), never automated by an agent. If you want
that additional confidence, run the same restore procedure above against a disposable
project you create for the purpose, then discard it.
```

- [ ] **Step 2: Run the full test suite, typecheck, and lint**

```bash
bun test && bunx tsc --noEmit && bun run lint
```

Expected: all pass, no errors. (New `.mjs` scripts and this doc aren't part of the app's own typechecked/linted source, matching this repo's existing convention that `scripts/` isn't in ESLint's scope and isn't part of `bunx tsc`'s `include` — confirm this is still true, and that nothing regressed.)

- [ ] **Step 3: Commit**

```bash
git add docs/backup-restore-runbook.md
git commit -m "docs: add database backup/restore runbook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
