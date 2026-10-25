# Volunteer local DB acceptance — 2026-10-25

The approved isolated local acceptance ran against real PostgreSQL, GoTrue,
PostgREST and the rendered application. One successful normal worker run generated
two synthetic published sessions and persisted a completed job with cleared leases.
The integration exposed and repaired a real overview field mismatch: the calendar
API returns `approved` / `policy_version_id`, while the page read the old
`approved_participants` / `policy` fields. The page now shows the confirmed count
and linked-policy status correctly, using the shared calendar row type.

This result covers the constructed synthetic target. It does not establish the
hosted incident root cause, production configuration/schema or hosted repair.

## Version and authority

- New local branch: `codex/isolated-test-db-20261025`.
- Full base: `e51f536d2094b9acd2a33860f121a0bc6f34a42c`; original branch preserved.
- Product delta: `VolunteerOverview.tsx` and its existing bilingual component
  fixtures. The retry draft and existing job implementation remain unchanged.
- Added `scripts/local-volunteer/` operational harness and this phase's plan/report.
- Final local delivery SHA, complete changed-file list and staged diff fingerprint
  are recorded in the external `REPORT.md` and `delivery-manifest.json` after commit.
- Authorized: fresh local stack, synthetic data, draft application and job/overview
  acceptance. No production DB/Auth, original OV-RO, push, merge or deployment.

## Target identity and isolation

| Evidence             | Verified value                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Local project label  | `hkscda-volunteer-local-05f9a731e8` (not a hosted project ref)            |
| Fixture UUID         | `a4a56532-82ee-4dae-8cc0-0ede26dc8434`                                    |
| Docker endpoint      | `unix:///var/run/docker.sock`                                             |
| DB host/database     | `db:5432` / `postgres`, only on the internal Docker network               |
| PostgreSQL           | 17.11, Debian 17.11-1.pgdg12+2, C.UTF-8                                   |
| DB system identifier | `7700512950460022828`                                                     |
| Exact DB container   | `0361e25550081d28f3efce4ce32b9a7511a91521294d48ba466c563435dca040`        |
| Fresh volume         | `hkscda-volunteer-local-05f9a731e8-pgdata`, created 2026-10-25T08:03:05Z  |
| Internal network     | `hkscda-isolated-05f9a731e8`, `Internal=true`, five owned containers only |
| App/gateway          | `127.0.0.1:59330` / `127.0.0.1:59321` **inside the app container**        |

Physical container/image/volume/network identity was checked before the first
write. Initial SQL showed zero public tables, no Auth schema and no volunteer
profile table. Later writes checked the system identifier and private fixture
marker. Final proof checks each Auth/REST/Storage/app DB URL is `db:5432/postgres`
on this same internal network. It never prints credentials or full connection URLs.

Host loopback publishing was requested in Docker HostConfig but is not active for
this internal-network configuration. Host browser access is not claimed. The
retained app is operated with `docker exec`, including Chromium. New local secrets
are in private mode-0600 files outside Git; old application dotenv/token files and
cloud credentials were not loaded. Provider keys are absent, notification outbox
is empty, and no provider call is made.

## Schema application and precise limits

PASS: 191 selected source migrations and the unchanged draft
`supabase/drafts/20261025000000_volunteer_runtime_retry_with_audit.sql` applied to
this local target. The volunteer R01 admission guard passed unchanged.

Installed RPC: `retry_volunteer_runtime_job_with_audit(uuid,timestamptz,timestamptz,uuid,boolean,text)`;
owner `postgres`, security definer, `search_path=public, pg_temp`; anon and
authenticated cannot execute, service_role can. Draft SHA256:
`bc6386e19c097b62de787ae3432a9e06987ae589a80ed04722cda56b67c8abd6`;
installed definition MD5: `5e57c2e983fa4895f4b056e3f5113416`.

Full application schema replay did not pass the unrelated finance prerequisite
guard: `extensionMembers` ordering differed, although the 136 member objects were
equal as sets and all other compared prerequisite fields matched. The guard was
not weakened, edited or marked passed. The final target is explicitly a volunteer
fixture baseline. These ten migrations are NOT_APPLIED:

- `20261002170945_r01_finance_callback_forward.sql`
- `20261003005322_r01_group_enquiry_forward.sql`
- `20261003075753_r01_document_publication_guards_forward.sql`
- `20261006023123_r01_document_publication_fence.sql`
- `20261008143512_faq_search_gaps.sql`
- `20261010130000_sp5b2_receipt_void_reason.sql`
- `20261010130200_sp5b2_internship_review_audit_reason.sql`
- `20261010130300_sp5b2_faq_deactivate_reason.sql`
- `20261010130400_sp5b2_admin_content_delete_reason.sql`
- `20261010130500_sp5b2_coordinator_status_delete_reason.sql`

The draft remains outside auto migrations. Only its local application is approved
and executed. Earlier empty local setup attempts and volumes are stopped and
retained; they are not production resources.

## Actual acceptance evidence

| Check                      | Result and evidence                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native SQL/RPC             | 18 scenarios: staff/treasurer/disabled admin denial, confirmation/reason validation, stale revision, historical bucket, complete/running/live/infinite lease rejection, atomic audit rollback, concurrent claims, finish owner fencing and requester audit.     |
| Direct authenticated RPC   | Final independent SQL invocation denied 42501; real GoTrue token through PostgREST denied 403/42501. Arguments were read before changing SQL role, avoiding a false table-read-denial result.                                                                   |
| Selective statistics retry | Real table lock makes pending registrations time out/null, while profile2/today0 and degraded job health remain. Releasing lock and clicking retry requests only `stats=pendingRegistrations`; it recovers0 without replacing successful figures or job health. |
| Admin UI/HTTP              | Cancel sends0 requests; blank reason disabled; invalid400; stale409; injected audit failure500 leaves job and audit unchanged and preserves typed reason. Synchronous double clicks send one request per intended attempt.                                      |
| Successful worker          | Exactly1 successful normal run: complete, generated2, released0, promoted0, assessmentfalse, deferred0. Complete job result persisted; lease owner/until null.                                                                                                  |
| Audit identity             | 2 retry audit records total (native + browser) identify requester admin. Session-generation audit identifies the distinct configured worker admin.                                                                                                              |
| Reload/counts              | Overview matches SQL: pending profiles2, pending registrations0, today published sessions1. Healthy job projection, no rerun candidate/diagnostic.                                                                                                              |
| Roles                      | Staff overview200, retry403 and no admin rerun control; treasurer overview403 and retry403. SQL active non-admin denial and authenticated execute denial also proven.                                                                                           |
| Actual rendered components | Real `/admin/volunteers`, actual Auth/API/DB, zero mocked responses, zero page errors and zero external origins. Final screenshots at320/390/1280px have no horizontal overflow.                                                                                |
| Calendar fix               | Updated real-contract fixtures produce RED3fail, then GREEN19pass. Final DB-backed browser shows0 confirmed and recognizes policy binding, without `undefined`/`NaN` or a false no-policy warning.                                                              |

Six real local GoTrue accounts are synthetic (admin, fixed admin worker, staff,
treasurer, two volunteers), with unique `example.invalid` emails and fixture
metadata. An initial local GoTrue bootstrap omission left their Auth role blank;
only these six verified fixtures were corrected via local GoTrue. Future seeding
sets `authenticated` explicitly. This is a scaffold correction, not a production
permission change. SQL Auth-ban rejection was not a draft-RPC contract and is not
claimed; real Auth validity remains at the HTTP boundary.

Final persisted counts: Auth6 (unknown provenance0), active admin rows4, profiles2,
activities2, registrations0, policy versions1, runtime rows2, notifications0,
retry audits2. Temporary audit-failure trigger/function counts are both0. The
native claim runs no worker; the failed browser audit claim rolls back. The single
successful normal worker budget is used once; final verification runs no extra job.

## Validation and review

- Component regression: 19pass,0fail. Expected router-provider warnings from the
  existing static-render test harness are retained in its log.
- Product typecheck: PASS. Harness strict typecheck: PASS.
- Harness lint: PASS,0warnings after correcting an empty animation-cleanup catch.
- Product lint: PASS,0errors,52warnings (existing fast-refresh warnings).
- Python compilation and Git whitespace check: PASS.
- Full suite: PASS, 7,359 pass / 727 skip / 0 fail, 8,086 tests across 844 files.
  Build: PASS. Build warning categories match the prior base report exactly:
  69 route-file warnings,13 route-export warnings,51 ignored `use client` directives,
  15 deprecated inputValidator warnings and1 chunk-size notice (149 total category
  occurrences). The final suite has120 existing router-provider warning lines;
  the focused component log has12.
  The initial suite had7356pass727skip3fail because the harness's browser-only
  localhost APP_URL/public origin leaked into public-origin and COD URL unit tests.
  Unsetting only those two variables for the unit-test child process makes the
  focused publicOrigin/COD files9pass0fail; the original failure log is retained.
  The Vite process and its local DB/Auth bindings are unchanged.
- One fresh independent read-only reviewer found no Critical/Important product or
  isolation defect; approval was conditional on final suite/build results. The
  reviewer explicitly excluded hosted repair, full schema parity and unexecuted
  fresh reconstruction of the final factory.

The generic suite uses `SUPABASE_LOCAL_URL=http://127.0.0.1:1`, so its database
suites remain skipped; it does not provide the live-DB claims above. Those come
from the separate identity-checked acceptance scripts. Full database/RLS coverage,
nonzero waitlist/release/assessment/notification dispatch, Auth-ban integration,
provider delivery, hosted behavior and a second fresh restore of the final factory
are NOT_RUN. No additional permission or fresh-task gate is invented for these
out-of-scope cases.

## Evidence, retained operation and incident status

External evidence root:
`/workspace/.hkscda-tools/volunteer-local-db-20261025/`.
The active `target-v3/` contains `target-proof.json`, `migration-installed.json`,
`schema-applied.json`, `native-results.json`, `browser-stats-results.json`,
`browser-worker-results.json`, `final-verification.json`, screenshots and check logs.
Parent `REPORT.md` and `delivery-manifest.json` contain the final commit/diff/check
record. Private files are excluded from evidence hashes and Git.

See `scripts/local-volunteer/README.md` for retained-target checks and explicit
fresh-target instructions. Do not seed/reset or rerun a completed job. The final
factory itself received static review and compilation; a second fresh target built
with the final factory is NOT_RUN.

This phase changes local services and local Git only. It does not change the saved
cloud environment configuration or product-interface publication, and creates no
preview deployment. The earlier protected-preview grant remains unused. Existing
CONNECTOR-ID-01 five UNKNOWN, P0-ID pause, incident deviation and formal repair
HOLD remain unchanged. No production DB/Auth, original OV-RO, push, merge or deploy
was performed. Hosted acceptance requires a separately verified nonproduction
binding and publishing authority; it is not needed to preserve or use this local
synthetic target.
