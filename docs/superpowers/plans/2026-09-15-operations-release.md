# HKSCDA operations release implementation plan

**Goal:** Implement all unblocked phases A–E in the approved 2026-09-15 brief, with real isolated database/API/UI verification and a local release candidate.
**Architecture:** Preserve route → handler → service → repository, existing policy commands, canonical history and six admin domains. New bulk workflow owns persisted selection/preview/operation state and delegates invariant-enforcing commands transactionally. No framework/dependency migration.
**Baseline:** Latest fetched origin/main = audit 9e2b0f4ffb2dee051319b02d1413fa2576475434. Previous PR122 is merged. No source differences at start. Existing unrelated untracked production-repair note preserved.

## Global constraints
- Local/synthetic implementation and verification only. No production SQL, credentials output, live bookings/messages, grant widening, migration replay, policy activation, public preview, merge or deploy.
- Explicit unresolved operating policies remain unpublishable. No invented group/quota/release defaults. Use synthetic policies for acceptance.
- All new writes authenticated, idempotent, audited/outboxed transactionally; immutable factual history retained.
- Use dedicated local API56321/DB56322; coordinate migration application through root. Fresh/upgrade tests use separate disposable database(s), never reset shared/production state.
- TypeScript strict/no any; semantic brand tokens, zh-HK copy, accessible keyboard/mobile, HK time independent of device timezone.
- Read latest definitions before edits. Existing migration history stays unchanged; genuinely new changes get forward migrations created through CLI. No agent edits another owner's files without agreement.

## Task 1 — Volunteer booking correctness (owner booking agent)
Files: member booking/terms/availability/reschedule/cancellation domain, corresponding APIs/public volunteer member components, forward booking migration and real DB tests.
- [x] Revalidate cancellation_close, waitlist reason coverage, terms on reschedule, completed-after-end and shared action eligibility.
- [x] Agree command API/schema with bulk owner before shared interfaces change; keep existing calls backward compatible or update all owned callers.
- [x] Implement authoritative atomic commands with idempotency, destination terms consent and original-booking rollback on conflict.
- [x] Filter/paginate future sessions and own upcoming/history before limits; reduce polling/duplicate immutable terms reads without sharing personal data.
- [x] Improve first-time/returning volunteer journey and product-facing reason/error copy.
- [x] Verify boundaries, quotas/overlap, concurrent booking and cross-terms failure/success against isolated DB; add behavior-level tests.

## Task 2 — Policy-backed activities and bulk maintenance (owner bulk agent)
Files: VolunteerManagement/activity routes and domain, new bulk subdomain/APIs/UI, forward bulk migration, calendar read path, recurrence integration and DB/browser fixtures.
- [x] Agree activity/booking command and revision contracts with Task1; root owns shared error/compatibility modules.
- [x] Policy-backed create/edit/copy-to-dates replaces unsafe legacy mutation paths; incomplete activities are drafts, publish requires effective resolved policy.
- [x] Implement 30-day paginated HK-time activity workspace, filters/search/title+location, count/shortage semantics, accessible detail drawer/calendar/list.
- [x] Persist exact page/all-matching selection snapshots; preview/apply generate/copy/edit/close/cancel/attendance with per-item identity, revisions, actor and payload binding.
- [x] Enforce explicit <=100 execution groups, deterministic shared-scope locks, no silent truncation/eviction, resumable idempotent operation status and distinct notification delivery state.
- [x] Keep unresolved policy decisions visibly linked to fields and blocked from publication.
- [x] Test four-week generation, stale state, changed roles, audit/outbox rollback, duplicate retries, >100 shared quotas, cancellation/history and timezone behavior.

## Task 3 — Admin/public quality and bounded data access (owner quality agent)
Files: animals/publication/CMS/supporters/internships/access/sponsorship/admin-copy domains, APIs/UI and new migrations if necessary; no volunteer member/activity files.
- [x] Real saved-revision visual animal preview with dirty protection and server stale-publish checks; missing-photo queue and thumbnails.
- [x] Server pagination/filter/count for supporters, CMS references, internships, animals, audit history; late-page boundary fixtures and detail-only payloads.
- [x] CMS ???? correction/type-specific draft create, demo/provenance publication guard/review queue without production cleanup or guessed legacy classification.
- [x] Keyboard sponsorship review, copy/form validation timing, correct intake terminology and omit repetitive public unknown fields.
- [x] Verify boundary records (26/51/501/1001/>50), publication A/previewA/editB and role denial. Measure relevant payload/query changes.

## Task 4 — Reliability, migration compatibility, performance and integration (owner root)
Files: shared volunteer error contract, directory/legacy deferred reads, compatibility release scripts, migration harness, performance/browser scripts, evidence and staff docs.
- [x] Reproduce older migration baseline directory/legacy failures, test upgrades and fresh installation without rewriting existing fixes.
- [x] Add server-only capability/dependency release gate; standardize useful redacted error contract for policy/activity/attendance/bulk actions with owners.
- [x] Establish controlled baseline measurements before relevant edits and after with identical dataset/sample settings; document API/list/filter/calendar/policy/bulk independently, no production speed claim.
- [x] Trace read locks and retain mutation invariants; optimize only with evidence and concurrency validation; avoid speculative indexes/region changes.
- [x] Review admin route inventory, integrate independent changes, apply forward migrations once to dedicated test DB, and run required unit/integration/RLS/build/lint/brand/a11y gates.
- [x] Actual desktop/mobile/non-HK-timezone browser verification including changed writes in synthetic environment and test email sink.
- [x] Finding→change→test matrix, operating-decision list, staff month-generation/edit/close/cancel/attendance guide, migration/release/rollback runbook, local PR description and scoped commits.

## Completion ledger
Track each task result and evidence in docs/evidence/operations-release-20260915/coverage.md. Routine decisions proceed; only production/release/content/policy activation remains explicitly pending. This repository is public and pushes create Vercel previews: prepare the candidate locally and obtain release/publication approval before any push that would publish a preview.

## Integration update

New upstream `33b1583` (PR124) was preserved by rebasing the private plan commit and reapplying implementation changes. The sole ContentEditor overlap retains both features; normalized file hashes verified every other tracked implementation file unchanged. Final command results, browser coverage and precise limitations are in `docs/evidence/operations-release-20260915/verification.md` and `coverage.md`. Checkmarks denote completed implementation/evidence work, not production activation or release approval.
