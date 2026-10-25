# Volunteer hourly retry local preparation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prepare the approved admin-confirmed retry of the current failed volunteer-hourly bucket, with an atomic claim/audit RPC draft and isolated synthetic verification.

**Architecture:** Add a dedicated POST runtime/retry route, separate from notification jobs. An authenticated admin supplies the observed bucket/update timestamp, confirmation and required reason. Replace only the existing runtime service's claim dependency with the atomic audited claim; retain its fixed configured actor, lease-fenced finish and idempotent stages. Missing RPC, non-true acknowledgement, conflict or audit failure never enters the worker stages.

**Tech Stack:** Existing TypeScript, Zod, TanStack Query/React, Supabase RPC, Bun and Playwright. No dependency changes.

**Spec:** The approved current-failed-bucket contract in `/workspace/.hkscda-tools/volunteer-selective-retry-20261025/JOB-RERUN-DECISION.md`; user approval relayed by the existing coordinator (Sentinel_fd301d0caabc8191b7824fbc99d56741). That design is already approved; this plan makes its local implementation concrete.

## Global Constraints

- Continue `/workspace/hkscda` at 2e83d020 on the existing feature branch. Preserve earlier commits/evidence and unrelated work.
- Local preparation only. No database access, migration application, real job/provider calls, production Auth, push, merge, deployment, credentials or expanded roles.
- Keep the migration outside `supabase/migrations` in `supabase/drafts`; it must require separate review and execution approval before installation.
- Current failed bucket only; no historical backfill, forced unlock, running-lease reclaim or worker actor substitution.
- Admin only; mandatory trimmed reason (existing shared 1–500 rule), explicit confirmation and exact observed update timestamp. SQL rechecks active admin and eligibility atomically.
- Use existing bilingual admin copy and ConfirmActionDialog. Do not disguise notification retry as hourly retry or declare success before finish acknowledges true.
- Preserve all incident holds. One protected preview approval remains unused and requires verified isolated bindings/access.

## Review Focus

- A second request or concurrent cron transition must lose the compare-and-set before domain work; test duplicate/stale/running/complete outcomes.
- Audit errors and unavailable/malformed RPC results must never fall back to the unaudited claim; test rejection and non-boolean responses.
- The clock may cross an hour while the confirmation is open; test old-bucket rejection and stable observed timestamps.
- Unknown/corrupt lease timestamps must fail closed; test candidate projection and draft SQL conditions.
- The UI must retain the captured revision across background refresh, block double submit and keep errors/reason visible without presenting unknown completion as success; test real rendered components with synthetic boundaries.

### Task 1: Audited claim boundary and migration draft

**Files:** Create `src/lib/volunteers/jobs/hourlyRetry.server.ts`, its test, and `supabase/drafts/20261025000000_volunteer_runtime_retry_with_audit.sql`. Create `src/routes/api/admin/volunteers/runtime/retry.ts`.

**Interfaces:** `createHourlyRetryHandler({authorize, run, reportFailure}, clock)` consumes authenticated admin identity and returns a no-store POST handler. `runHourlyRetry(repo, claim, actorId, input, clock)` wraps the existing service's claim; claim accepts bucket, owner, expectedUpdatedAt, reason and actor. It returns true only after atomic claim/audit. The SQL draft installs `retry_volunteer_runtime_job_with_audit` with no user-selected worker or job key.

- [x] Write tests for auth-before-input, strict confirmation/reason/body limits, current hour, true-only acknowledgement, missing RPC/audit error, duplicate/conflict and existing finish-ACK behavior.
- [x] Run focused tests; expect missing implementation to fail (RED).
- [x] Implement the bounded handler/composition and SQL draft. No SQL execution.
- [x] Run focused tests; expect PASS. Review SQL statically for active-admin check, current-hour/failed/revision/lease fence, audit in the same function and service-role-only grants. Static review is not SQL runtime evidence.

### Task 2: Admin candidate and confirmation UI

**Files:** Modify `jobs/health.ts`, `jobs/health.server.ts` and their tests; create `VolunteerHourlyRetry.tsx`, `volunteerHourlyRetryCopy.ts`; modify `VolunteerOverview.tsx`, `requiredReasonActions.ts`; add browser tests/fixture.

**Interfaces:** Admin-only `runtimeHealth.retryCandidate?: {bucket: string, expectedUpdatedAt: string}` exposes no raw result/owner. UI POSTs `{bucket, expectedUpdatedAt, confirmed:true, reason}` to `/api/admin/volunteers/runtime/retry` only from the shared confirmed dialog, preserving the selected candidate until dismissal.

- [x] Write candidate and actual browser tests; expect absence of candidate/button/POST to fail (RED).
- [x] Implement admin-only current-failed candidate projection, shared required-reason dialog, error recovery and completion-triggered overview refresh.
- [x] Run focused candidate/handler/browser/role/copy guard tests; expect PASS. Confirm staff/treasurer denial, cancel/no-write, required reason, pending duplicate protection, stale revision conflict and missing migration error.

### Task 3: Final local delivery and review

**Interfaces:** Final diff includes Task 1's API/RPC contract and Task 2's exact payload/projection; no deployed resources exist.

- [x] Check resources, then run one final full local suite, typecheck, affected-file lint and build in the existing Docker image with `--network=none` and synthetic settings. Expect exit 0; record skips and known build warnings.
- [x] Obtain one fresh read-only review of the whole new diff under requesting-code-review; fix scoped important findings with RED→GREEN and proportionate reruns.
- [x] Commit the verified local delivery; save version/diff fingerprints, actual test results, screenshots and migration NOT_EXECUTED status outside the checkout. Do not overwrite earlier evidence.
- [x] Return bounded integration checklist: draft review/application approval on a verified isolated target, worker config/roles/audit/lease acceptance, protected preview access and authorization for actual jobs/providers if needed. No repeated preview approval request.
