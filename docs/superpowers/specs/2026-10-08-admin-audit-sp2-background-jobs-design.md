# Admin audit SP-2: background jobs go-live readiness

Date: 2026-10-08 · Base: `origin/main @ 4bfca5c` · Branch: `codex/audit-final-sp2-20261008`
Sub-project SP-2 of the 2026-10-07 admin audit follow-up. The SP-1 spec's context section
lists all six sub-projects. This branch does not depend on SP-1 (PR #202).

## What the audit said, and what is actually true

The audit's F-02 said `vercel.json` schedules hourly and 5-minute crons on a Vercel Hobby
plan, which runs crons at most once a day. F-04 said two protected job handlers are never
scheduled. A read-only spike on 2026-10-08 found the following.

| Question | Finding | Evidence |
| --- | --- | --- |
| Which plan? | **Pro**, active. The "Hobby" notes in the repo date from August and are out of date | Vercel team `billing.plan = "pro"`, `status = "active"` |
| Are the crons registered? | Yes. All five are registered at their declared schedules, enabled, on the current production deployment | Project `crons.definitions`, `enabledAt` set, `disabledAt: null` |
| Do the jobs do any work? | **No, and they never have.** `CRON_SECRET` is not set, so `authorizedCron` (`src/lib/volunteers/jobs/auth.server.ts:4`) answers every cron call with 401 | The full list of production env vars (18 names) has no `CRON_SECRET`. Every job table in production is empty: `volunteer_runtime_job_run`, `crm_export_job`, `donation_delivery_job`, `volunteer_operation_outbox` |
| Is anything else missing? | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `APP_URL` are unset in production, so no transactional email can send. The staff email for new adoption applications never goes out; submissions still save, because `sendSubmittedApplicationNotificationSafely` swallows the failure | Same env listing |

Today's impact is small. The queues are empty because the features that fill them are
gated: donation checkout is disabled, and the CRM export request turns itself off without
`CRON_SECRET` (`src/routes/api/admin/exports/jobs.ts:13`). Expired uploads, however, have
never been cleaned up. Nothing tells anyone that the background system is off.

## Goal

Make the background jobs ready to switch on, make the "switched off" state visible, and
give the owner a runbook for switching them on. Setting the secrets is the owner's action
and is not part of this code change.

## Non-goals

- Setting `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` or `APP_URL` in Vercel.
  They are secrets, and the owner sets them by following the runbook.
- Readiness changes. Email configuration stays out of `/api/internal/readiness`, so the
  live-readiness release gate (`scripts/verify-live-readiness.ts` requires
  `state === "ready"`) is unchanged.
- Per-job kill switches. The first-run effects below are small, so switching everything on
  at once is acceptable.
- The domain decision (D-1), which sets the final `APP_URL`. The runbook uses the domain
  production serves today.
- Editing historical plan and evidence documents that mention Hobby. The runbook and
  `CLAUDE.md` state the current fact instead.

## Design

### 1. Schedule the two missing jobs, and guard the pairing (F-04)

- `vercel.json` gets two new cron entries, off-peak in Hong Kong:
  - `{ "path": "/api/jobs/adoption-uploads", "schedule": "15 19 * * *" }` (03:15 HKT)
  - `{ "path": "/api/jobs/public-media-repair", "schedule": "45 19 * * *" }` (03:45 HKT)

  The existing five entries stay unchanged.
- A new contract test, `src/lib/cronScheduleContract.test.ts`:
  - The set of cron paths in `vercel.json` equals the set of job routes. Job routes are the
    non-test `.ts` files directly under `src/routes/api/jobs/`, excluding `-`-prefixed
    files, mapped to `/api/jobs/<basename>`. The failure message lists routes with no cron
    and crons with no route.
  - Every schedule has exactly five whitespace-separated fields.
  - A self-check proves the comparison reports a route that has no cron, using a synthetic
    input.

### 2. Make a missing secret visible

- `authorizedCron(request, secret, reportMissing = reportMissingCronSecretOnce)` in
  `src/lib/volunteers/jobs/auth.server.ts`:
  - When `secret` is missing, empty or whitespace-only, it calls `reportMissing()` and
    returns `false`. A whitespace-only secret now counts as missing, matching the export
    gate's `CRON_SECRET?.trim()`.
  - Otherwise the behaviour is unchanged: a `Bearer` token compared in constant time.
- `createMissingCronSecretReporter({ isProduction, log })` returns a function that logs at
  most once per process. It logs only when `isProduction()` is true, with exactly this
  message:
  `CRON_SECRET is not set in production: scheduled job requests are rejected with 401, so no background job runs. See docs/background-jobs-runbook.md.`
  The module's default reporter is built from `isProductionRuntime`
  (`src/lib/security/turnstile.server.ts`) and `console.error`, following
  `warnUpstashDisabledOnce` in `src/lib/security/rate-limit.server.ts`.
- All eight existing call sites keep their two-argument calls unchanged. They are the seven
  job routes or schedulers and `src/lib/operations/readiness.server.ts`.
- Tests:
  - A missing, empty or whitespace secret returns false and calls `reportMissing` once per
    call.
  - A valid token still passes, and a wrong or wrong-length token still fails without
    calling `reportMissing`.
  - The reporter logs once across repeated calls in production and never outside
    production.

### 3. Record the facts in the project instructions

Both `CLAUDE.md` and `AGENTS.md` get the same new bullet under **Deployment**, so the two
files stay consistent:

`- Vercel plan is Pro: the crons in vercel.json run at their declared schedules. Every /api/jobs/* route and /api/internal/readiness require CRON_SECRET; without it Vercel's cron calls get 401 and no background job runs. Environment-variable changes take effect only after a redeploy. Switch-on steps: docs/background-jobs-runbook.md.`

### 4. Runbook: `docs/background-jobs-runbook.md`

The runbook is written for the owner. It has three sections.

**Jobs.** One row per job with: route; schedule in UTC and HKT; what the job does; its
first-run effect in production as measured on 2026-10-08; and the env vars it needs.

| Route | Schedule (UTC → HKT) | What it does | First run in production | Needs |
| --- | --- | --- | --- | --- |
| `/api/jobs/crm-exports` | every 5 min | Builds requested supporter and donation CSV exports | Queue empty. The admin export button becomes available | `CRON_SECRET` |
| `/api/jobs/donations` | :05 hourly | Sends due donation delivery jobs (confirmations, receipts) | Queue empty | `CRON_SECRET`, `RESEND_API_KEY`, `APP_URL` |
| `/api/jobs/volunteers` | :15 hourly | Generates due sessions, persists releases, records promotion reviews, runs the monthly assessment after its configured day, settles the notification outbox | Small: no assessment policy configured (the assessment does nothing), 2 volunteer profiles, 5 registrations, outbox empty | `CRON_SECRET`; Resend for emails |
| `/api/jobs/sponsorships` | :30 hourly | Dispatches the sponsorship delivery outbox | Queue empty | `CRON_SECRET`, `RESEND_API_KEY` |
| `/api/jobs/public-uploads` | 03:45 → 11:45 daily | Deletes expired public uploads | May delete a backlog built up since launch | `CRON_SECRET` |
| `/api/jobs/adoption-uploads` | 19:15 → 03:15 daily | Deletes photos from expired, never-submitted adoption application uploads, 50 per run | May clear a backlog over several nights | `CRON_SECRET` |
| `/api/jobs/public-media-repair` | 19:45 → 03:45 daily | Repairs published animal and content media; responds 500 if any repair fails | Runs over all published items once | `CRON_SECRET` |

The implementer confirms each row against the code. Where the code shows a row is wrong,
the code wins and the row is corrected.

**Switch-on, in order:**

1. In Vercel, go to Project `hkscda` → Settings → Environment Variables (Production). Set
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `APP_URL` to the domain production serves
   today. Confirm `NOTIFICATION_EMAIL`.
2. Generate a long random value locally, for example
   `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` in
   PowerShell 7 or `openssl rand -hex 32`. Add it as `CRON_SECRET` (Production,
   Sensitive), and share it with no one.
3. Redeploy production. Environment changes apply only to new deployments.

**Verify, and pause if needed:**

- Within about an hour, Vercel runtime logs show no `CRON_SECRET is not set in production`
  error.
- `volunteer_runtime_job_run` has a row for the current hour with status `complete`.
- In the admin, the supporters CSV export can be requested and becomes ready within about
  five minutes.
- The next day, the two new daily jobs show successful runs in the Vercel cron logs.
- To pause everything, remove `CRON_SECRET` and redeploy. To pause one job, remove its
  entry from `vercel.json` and deploy.

## Order and gates

Tasks are T1 (schedules and contract test), T2 (missing-secret reporting), and T3 (docs
and runbook), in that order. After each task, run the full gate: `bunx tsc --noEmit`;
`bun run lint` (0 errors, with the existing warnings as baseline); and
`$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun test --isolate` (0 fail). The
`--isolate` flag is explicit because SP-1's script change is not on this base.

Never reset the shared local Supabase stack. No migration ships. The `codex/audit-*`
branch name means no public preview. Merging to `main` deploys production and waits for
explicit release approval. Merging does **not** turn the jobs on: that needs
`CRON_SECRET`, which only the owner sets.

## Risks

- **First-run deletion backlog.** The two upload-cleanup jobs may delete many expired
  objects on their first nights. These are expired, never-submitted uploads; deleting them
  is the jobs' purpose and the privacy-correct outcome. The runbook says so.
- **Media repair touching published media.** It responds 500 when any repair fails, which
  surfaces in the cron logs. The runbook tells the owner to check that log on day one.
- **The warning appears only after a deploy.** It fires only when a cron request arrives
  without a secret, which every cron call does until the secret is set. It appears at most
  once per server instance, so the log is not flooded.
