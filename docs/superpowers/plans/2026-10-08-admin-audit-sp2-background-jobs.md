# Admin audit SP-2: background jobs go-live readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule the two unscheduled jobs, make a missing `CRON_SECRET` visible in production
logs, and give the owner a correct runbook for switching the background jobs on.

**Architecture:** One config edit (`vercel.json`) guarded by a new repo-scanning contract test; one
small change to the shared cron guard `authorizedCron` with an injectable, log-once reporter; and
docs (project instructions, `.env.example`, a new runbook) pinned by an extended environment
contract test. No route, service or migration changes.

**Tech Stack:** TypeScript, Bun 1.3.14 (`bun:test`), TanStack Start file routes, Vercel crons.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-audit-sp2-background-jobs-design.md`

## Plan decisions (the code wins over the spec where they differ)

The spec says the runbook's rows are checked against the code and corrected where the code
disagrees. Writing this plan did that check. These decisions follow from it.

1. **`/api/jobs/volunteers` also needs `VOLUNTEER_JOB_ACTOR_ID`.** The repository resolves it
   against `admin_user` with `role = 'admin'` and `status = 'active'`
   (`src/lib/volunteers/jobs/repository.server.ts:17-27`). Without it, every hourly run claims
   its bucket, throws `volunteer_job_actor_missing`, records a `failed` row and answers 500.
   Production does not have it, and `.env.example` does not document it. The runbook adds a
   switch-on step for it, and `.env.example` documents it.
2. **`/api/jobs/sponsorships` also needs `SPONSORSHIP_JOB_ACTOR_ID`.** Without it the job
   answers 200 `{ "status": "disabled", "reason": "job_actor_unconfigured" }` and does nothing
   (`src/lib/sponsorshipAdmin/cron.server.ts:10-15`). Production does not have it.
3. **`/api/jobs/public-uploads` already cleans adoption uploads**, plus sponsorship proofs
   (public and staff), internship uploads and animal draft uploads. It responds 500 if any of
   these fail. Scheduling `/api/jobs/adoption-uploads` (spec §1) adds a second nightly pass over
   adoption uploads only. That is harmless: the cleanup is idempotent and the two runs are eight
   hours apart. The runbook says so.
4. **"To pause one job, remove its entry from `vercel.json`" would fail the new contract test.**
   The contract test therefore carries an `INTENTIONALLY_UNSCHEDULED` map (path → reason). It
   starts empty. Pausing one job means removing the entry and adding the path with a reason, in
   the same commit. The test also fails when an entry in the map is scheduled again or names a
   route that no longer exists.
5. **`authorizedCron` compares the token against the trimmed secret.** The Fetch `Headers` API
   strips leading and trailing whitespace from header values, so a secret saved with a stray
   space or newline could never match. Trimming fixes that and matches the export gate's
   `CRON_SECRET?.trim()`. No security cost: the secret's entropy is in the non-whitespace part.
6. **Vercel allows the same path to be scheduled more than once**, which is documented
   behaviour. The contract test compares sets and does not forbid repeated paths.

## Global Constraints

- Work only in `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\audit-final-sp2-20261008`
  on branch `codex/audit-final-sp2-20261008`. Never touch the main checkout.
- Never run `supabase db reset` or `supabase stop`; the local stack is shared. No migration ships.
- Do not set or read secret values anywhere, and make no Vercel writes. The owner sets the
  secrets by following the runbook.
- The eight existing `authorizedCron` call sites keep their two-argument calls unchanged.
- No new dependencies.
- Use the PowerShell tool for git and bun; the Bash tool here has no git.
- Read `CLAUDE.md`, `AGENTS.md` and `.env.example` with the Read tool. PowerShell 5.1
  `Get-Content` without `-Encoding UTF8` garbles their Chinese text.
- Commit messages: write the message with
  `[IO.File]::WriteAllText($p, $msg, (New-Object Text.UTF8Encoding $false))` to a file outside
  the repo, then `git commit -F $p`. Conventional Commits. End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage files by explicit path. Run `git status --short` and `git log --oneline -3` right before
  each commit.
- **The gate, after every task:**
  1. `bunx tsc --noEmit` exits 0.
  2. `bun run lint` reports 0 errors. Record the warning count before Task 1; no task adds a
     warning.
  3. `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun test --isolate` reports 0 fail.
     `--isolate` is required; SP-1's script change is not on this base.
     An unfamiliar failure in a file the task did not touch is still investigated before it is
     called unrelated.

## Review Focus

1. **A `CRON_SECRET` saved with a stray space or newline.** The cron call should authenticate,
   not get a silent 401 forever. Pinned in Task 2.
2. **A cron added to `vercel.json` later without a runbook row.** The runbook should never go
   stale. Pinned in Task 3: the runbook must mention every cron path.
3. **A future job route placed in a subfolder of `src/routes/api/jobs/`.** The contract test
   would not see it. Pinned in Task 1: the test fails if that folder has any subdirectory.
4. **Pausing one job by deleting its cron entry.** This should be a documented, test-passing
   change, not a red build. Pinned in Task 1 by the `INTENTIONALLY_UNSCHEDULED` map and its
   self-check.
5. **A lowercase `bearer` scheme.** It is accepted today and must stay accepted. Pinned in
   Task 2.

---

### Task 1: Schedule the two missing jobs, and guard the pairing (F-04)

**Files:**

- Modify: `vercel.json` (`crons` array, lines 22-43)
- Create: `src/lib/cronScheduleContract.test.ts`

**Interfaces:**

- Produces: the cron paths in `vercel.json`, which Task 3's test and runbook read. After this
  task there are seven: `/api/jobs/donations`, `/api/jobs/volunteers`, `/api/jobs/sponsorships`,
  `/api/jobs/public-uploads`, `/api/jobs/crm-exports`, `/api/jobs/adoption-uploads`,
  `/api/jobs/public-media-repair`.

- [ ] **Step 1: Write the contract test**

In `src/lib/cronScheduleContract.test.ts`, read `vercel.json` and the directory
`src/routes/api/jobs/` with `node:fs`, from `process.cwd()`, as `environmentContract.test.ts`
does. Job routes are the entries that are files, end in `.ts`, do not end in `.test.ts`, and do
not start with `-`. Each maps to `/api/jobs/<basename without .ts>`.

Define in the test file:

```ts
// Path -> reason. A job paused by removing its vercel.json entry is listed here, in the same
// commit, so the pause is deliberate and reviewed. See docs/background-jobs-runbook.md.
const INTENTIONALLY_UNSCHEDULED: Record<string, string> = {};

function compareCronSchedules(
  routes: string[],
  cronPaths: string[],
  exemptions: Record<string, string>,
): { missing: string[]; unrouted: string[]; staleExemptions: string[] };
```

- `missing`: routes with no cron path that are not in `exemptions`.
- `unrouted`: cron paths with no route.
- `staleExemptions`: exemption keys that are scheduled, or that have no route.

All three arrays are sorted and de-duplicated.

Tests:

```ts
test("every job route has a cron and every cron has a job route", () => {
  expect(compareCronSchedules(routes, cronPaths, INTENTIONALLY_UNSCHEDULED)).toEqual({
    missing: [],
    unrouted: [],
    staleExemptions: [],
  });
});

test("job routes are flat .ts files so the contract sees them", () => {
  expect(subdirectoriesOfJobsDir).toEqual([]);
  expect(routes.length).toBeGreaterThanOrEqual(7);
});

test("every cron schedule has five fields", () => {
  for (const { schedule } of crons) expect(schedule.trim().split(/\s+/)).toHaveLength(5);
});

test("the comparison reports each kind of mismatch", () => {
  expect(
    compareCronSchedules(
      ["/api/jobs/a", "/api/jobs/b", "/api/jobs/d"],
      ["/api/jobs/a", "/api/jobs/c", "/api/jobs/a"],
      { "/api/jobs/d": "paused", "/api/jobs/a": "stale", "/api/jobs/e": "gone" },
    ),
  ).toEqual({
    missing: ["/api/jobs/b"],
    unrouted: ["/api/jobs/c"],
    staleExemptions: ["/api/jobs/a", "/api/jobs/e"],
  });
});
```

- [ ] **Step 2: Run it and see the first test fail**

Run: `bun test src/lib/cronScheduleContract.test.ts`
Expected: the first test fails with `missing: ["/api/jobs/adoption-uploads", "/api/jobs/public-media-repair"]`.
The other three pass.

- [ ] **Step 3: Add the two cron entries**

Append to the end of the `crons` array in `vercel.json`, keeping the existing five unchanged:

```json
{ "path": "/api/jobs/adoption-uploads", "schedule": "15 19 * * *" },
{ "path": "/api/jobs/public-media-repair", "schedule": "45 19 * * *" }
```

Format them like the existing entries, with `path` and `schedule` on separate lines. Lint does
not cover `vercel.json`, so run `bunx prettier --check vercel.json` and expect it to pass.

- [ ] **Step 4: Run the test and see it pass**

Run: `bun test src/lib/cronScheduleContract.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 5: Run the full gate** (Global Constraints). Expected: all three green.

- [ ] **Step 6: Commit**

```
git add vercel.json src/lib/cronScheduleContract.test.ts
```

Message: `fix(jobs): schedule adoption-uploads and public-media-repair crons`, with a body
naming F-04 and the contract test.

---

### Task 2: Make a missing secret visible

**Files:**

- Modify: `src/lib/volunteers/jobs/auth.server.ts`
- Create: `src/lib/volunteers/jobs/auth.server.test.ts`

**Interfaces:**

- Consumes: `isProductionRuntime(env?: NodeJS.ProcessEnv): boolean` from
  `src/lib/security/turnstile.server.ts`.
- Produces, all exported from `auth.server.ts`:

```ts
export type MissingCronSecretReporterDeps = {
  isProduction: () => boolean;
  log: (message: string) => void;
};
export function createMissingCronSecretReporter(deps: MissingCronSecretReporterDeps): () => void;
export const reportMissingCronSecretOnce: () => void;
export function authorizedCron(
  request: Request,
  secret: string | undefined,
  reportMissing: () => void = reportMissingCronSecretOnce,
): boolean;
```

- [ ] **Step 1: Write the failing tests**

In `auth.server.test.ts`, with a `reportMissing` spy that counts calls (`mock(() => {})` from
`bun:test`) and requests built as `new Request("https://x", { headers: { authorization } })`:

- `test("a missing, empty or whitespace secret is rejected and reported on every call")`: for
  each of `undefined`, `""` and `"  \n"`, with header `"Bearer s3cret"`, `authorizedCron`
  returns `false`. The spy has been called 3 times after the loop.
- `test("the exact bearer token passes without reporting")`: `"Bearer s3cret"` with secret
  `"s3cret"` → `true`. `"bearer s3cret"` → `true`. Spy called 0 times.
- `test("a secret saved with surrounding whitespace still matches")`: `"Bearer s3cret"` with
  secret `"  s3cret\n"` → `true`. Spy called 0 times.
- `test("a wrong, short or absent token fails without reporting")`: `"Bearer s3creT"`,
  `"Bearer s3"` and a request with no authorization header, each with secret `"s3cret"` →
  `false`. Spy called 0 times.
- `test("the reporter logs the exact message once in production")`: a reporter from
  `createMissingCronSecretReporter({ isProduction: () => true, log })`, called 3 times. The
  logged messages equal exactly
  `["CRON_SECRET is not set in production: scheduled job requests are rejected with 401, so no background job runs. See docs/background-jobs-runbook.md."]`.
- `test("the reporter never logs outside production")`: `isProduction: () => false`, called 3
  times → no messages.

- [ ] **Step 2: Run them and see them fail**

Run: `bun test src/lib/volunteers/jobs/auth.server.test.ts`
Expected: FAIL. `createMissingCronSecretReporter` is not exported, and the whitespace cases do
not report.

- [ ] **Step 3: Implement**

- `createMissingCronSecretReporter` latches on its first call, as `warnUpstashDisabledOnce` does
  (`src/lib/security/rate-limit.server.ts:130-141`). It calls `log` with the message above only
  if `isProduction()` returns true at that first call.
- `reportMissingCronSecretOnce` is built with
  `isProduction: () => isProductionRuntime()` and `log: (message) => console.error(message)`.
- `authorizedCron`: `const configured = secret?.trim()`. If it is falsy, call `reportMissing()`
  and return `false`. Otherwise keep the existing token extraction
  (`replace(/^Bearer\s+/i, "")`), the length check and `timingSafeEqual`, comparing against
  `configured`.
- Do not edit any caller.

- [ ] **Step 4: Run the tests and see them pass**

Run: `bun test src/lib/volunteers/jobs/auth.server.test.ts src/lib/volunteers/jobs/service.test.ts`
Expected: all pass. `service.test.ts` holds the older `authorizedCron` test, which must still
pass unchanged.

- [ ] **Step 5: Run the full gate.** Expected: all three green.

- [ ] **Step 6: Commit**

```
git add src/lib/volunteers/jobs/auth.server.ts src/lib/volunteers/jobs/auth.server.test.ts
```

Message: `feat(jobs): log once when CRON_SECRET is missing in production`, with a body naming
F-02 and the trimmed comparison.

---

### Task 3: Record the facts, document the actors, and write the runbook

**Files:**

- Modify: `CLAUDE.md` (Deployment section, after line 159)
- Modify: `AGENTS.md` (Deployment section, after line 156)
- Modify: `.env.example` (job block, lines 78-83)
- Create: `docs/background-jobs-runbook.md`
- Modify: `src/lib/environmentContract.test.ts`

**Interfaces:**

- Consumes: the seven cron paths from Task 1; the log message text from Task 2, which names
  `docs/background-jobs-runbook.md`.

- [ ] **Step 1: Write the failing contract test**

Add to the `describe` in `src/lib/environmentContract.test.ts`:

`test("documents the background-job contract in .env.example, the runbook and both instruction files")`:

- For each of `CRON_SECRET`, `VOLUNTEER_JOB_ACTOR_ID`, `SPONSORSHIP_JOB_ACTOR_ID`,
  `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `APP_URL`: `.env.example` matches
  `^NAME=` (multiline), and `docs/background-jobs-runbook.md` contains the name.
- For every `crons[].path` in `vercel.json`: the runbook contains the path.
- Both `CLAUDE.md` and `AGENTS.md` contain the exact bullet from Step 3.

Run: `bun test src/lib/environmentContract.test.ts`
Expected: FAIL, because the runbook file does not exist.

- [ ] **Step 2: Document the volunteer job actor in `.env.example`**

Directly after the `SPONSORSHIP_JOB_ACTOR_ID=` line, add:

```
# Guarded volunteer hourly job. Configure the auth user UUID of an active admin
# (admin_user role admin, status active); without it every hourly run fails.
VOLUNTEER_JOB_ACTOR_ID=
```

Change the `CRON_SECRET` comment to
`# Bearer secret shared with guarded scheduled job endpoints. See docs/background-jobs-runbook.md.`

- [ ] **Step 3: Add the Deployment bullet to both instruction files**

Append this exact line as the last bullet of the **Deployment** section in `CLAUDE.md` and in
`AGENTS.md`:

`- Vercel plan is Pro: the crons in vercel.json run at their declared schedules. Every /api/jobs/* route and /api/internal/readiness require CRON_SECRET; without it Vercel's cron calls get 401 and no background job runs. Environment-variable changes take effect only after a redeploy. Switch-on steps: docs/background-jobs-runbook.md.`

- [ ] **Step 4: Write `docs/background-jobs-runbook.md`**

Written for the owner, in English, in plain steps. Open with two sentences: what the background
jobs are, and that as of 2026-10-08 none has ever run because `CRON_SECRET` is unset. Then three
sections.

**Jobs.** This table, with each row confirmed against the code. Where the code disagrees, the
code wins and the row is corrected.

| Route                           | Schedule (UTC → HKT) | What it does                                                                                                                                                | First run in production (measured 2026-10-08)                                                                             | Needs besides `CRON_SECRET`                                                          |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/api/jobs/crm-exports`         | every 5 min          | Builds requested supporter and donation CSV exports                                                                                                         | Queue empty. The admin export button becomes available once `CRON_SECRET` is set                                          | —                                                                                    |
| `/api/jobs/donations`           | :05 hourly           | Sends due donation delivery jobs (confirmations, receipts), 5 per run                                                                                       | Queue empty; checkout is off                                                                                              | `RESEND_API_KEY`; `APP_URL` for links in the emails                                  |
| `/api/jobs/volunteers`          | :15 hourly           | Generates due sessions, persists releases, records promotion reviews, runs the monthly assessment after its configured day, settles the notification outbox | Small: no assessment policy configured (the assessment does nothing), 2 volunteer profiles, 5 registrations, outbox empty | `VOLUNTEER_JOB_ACTOR_ID` (every run fails without it); `RESEND_API_KEY` for emails   |
| `/api/jobs/sponsorships`        | :30 hourly           | Dispatches the sponsorship delivery outbox                                                                                                                  | Queue empty                                                                                                               | `SPONSORSHIP_JOB_ACTOR_ID` (the job reports `disabled` without it); `RESEND_API_KEY` |
| `/api/jobs/public-uploads`      | 03:45 → 11:45 daily  | Deletes expired adoption, sponsorship-proof, internship and animal-draft uploads; responds 500 if any part fails                                            | May delete a backlog built up since launch                                                                                | —                                                                                    |
| `/api/jobs/adoption-uploads`    | 19:15 → 03:15 daily  | A second nightly pass over expired adoption uploads only, 50 per run                                                                                        | May clear a backlog over several nights                                                                                   | —                                                                                    |
| `/api/jobs/public-media-repair` | 19:45 → 03:45 daily  | Repairs published animal and content media; responds 500 if any repair fails                                                                                | Runs over all published items once                                                                                        | —                                                                                    |

Under the table, one line each:

- Deleted uploads are expired and were never submitted. Deleting them is the jobs' purpose and
  the privacy-correct outcome.
- The jobs' database changes are recorded as the actor user set below.

**Switch-on, in order:**

1. In Vercel, go to Project `hkscda` → Settings → Environment Variables (Production). Set
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `APP_URL` to the domain production serves
   today. Confirm `NOTIFICATION_EMAIL`.
2. Set `VOLUNTEER_JOB_ACTOR_ID` to the auth user UUID of an active admin. Find it under Supabase
   → Authentication → Users; that user must have an `admin_user` row with role `admin` and
   status `active`. Set `SPONSORSHIP_JOB_ACTOR_ID` to an active staff, admin or treasurer auth
   user UUID. One active admin can serve as both.
3. Generate a long random value locally, for example
   `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` in
   PowerShell 7 or `openssl rand -hex 32`. Add it as `CRON_SECRET` (Production, Sensitive),
   with no spaces around it, and share it with no one.
4. Redeploy production. Environment changes apply only to new deployments.

**Verify, and pause if needed:**

- Within about an hour, Vercel runtime logs show no
  `CRON_SECRET is not set in production` error.
- `volunteer_runtime_job_run` has a row for the current hour with status `complete`. A `failed`
  row whose result names `volunteer_job_actor_missing` means step 2 is wrong.
- `/api/jobs/sponsorships` no longer answers `job_actor_unconfigured`.
- In the admin, the supporters CSV export can be requested and becomes ready within about five
  minutes.
- The next day, the three daily jobs show 200 responses in the Vercel logs. Check
  `public-media-repair` on day one in particular.
- **To pause everything:** remove `CRON_SECRET` and redeploy. The missing-secret error then
  appears in the logs, which is expected.
- **To pause one job:** remove its entry from `vercel.json`, add its path with the reason to
  `INTENTIONALLY_UNSCHEDULED` in `src/lib/cronScheduleContract.test.ts` in the same commit, and
  deploy. For sponsorships only, removing `SPONSORSHIP_JOB_ACTOR_ID` and redeploying also works.

- [ ] **Step 5: Run the test and see it pass**

Run: `bun test src/lib/environmentContract.test.ts`
Expected: all pass.

- [ ] **Step 6: Run the full gate.** Expected: all three green. Lint does not cover Markdown or
      `.env.example`, so also run `bunx prettier --check docs/background-jobs-runbook.md CLAUDE.md AGENTS.md`.
      Fix what it reports in the runbook. If `CLAUDE.md` or `AGENTS.md` already failed the check
      before this task, leave their existing formatting alone.

- [ ] **Step 7: Commit**

```
git add CLAUDE.md AGENTS.md .env.example docs/background-jobs-runbook.md src/lib/environmentContract.test.ts
```

Message: `docs(jobs): add background jobs runbook and document job actors`, with a body naming
F-02, F-04 and plan decisions 1-3.
