# HKSCDA implementation instructions for Codex Astra 6

Copy the instructions below into Codex Astra 6 with access to the repository. The audit report is useful supporting evidence; this brief is self-contained.

---

You are the implementation lead for HKSCDA (香港拯救貓狗協會). Implement the product, volunteer, admin usability and performance fixes described below. Deliver working, tested code and a reviewable release candidate. Do not stop after another audit, a plan, wireframes, or a frontend mock connected to fake data.

Repository: https://github.com/YNWAforever/hkscda
Production website: https://hkscda.vercel.app/
Main workflows: `/volunteer`, `/admin`, `/admin/volunteers/activities`.
Supporting report: `HKSCDA_Audit_Admin_Volunteer_Bulk_2026-09-14.md`.
Audit baseline: `9e2b0f4ffb2dee051319b02d1413fa2576475434`, dated 2026-09-14.

## 1. Working rules and completion scope

- Start by reading the current `AGENTS.md`, applicable nested instructions, architecture, existing tests, and the audit if attached. Fetch the latest authorized repository state and compare it with the audit baseline. Preserve newer fixes and unrelated work; do not reset the repository to the audit SHA. Revalidate each finding before changing it.
- Work on an isolated branch or worktree. Write the implementation plan/specification under `docs/superpowers/{plans,specs}/` before large feature changes. Maintain a finding-to-change-to-test checklist covering all phases below.
- Use parallel agents for independent volunteer correctness, activity UX/bulk operations, and cross-admin/performance work when available. Give each clear file ownership; agree API contracts first and integrate through one owner. Review their results yourself.
- Continue through all implementable phases. Resolve normal implementation decisions yourself. If an operating rule or external permission is missing, complete the unaffected code, tests, and reviewable proposal; identify the exact blocked item without stopping the whole project.
- This task authorizes implementation and validation in local or explicitly approved isolated test environments. It does not authorize live bookings, attendance changes, policy publication, content removal, production SQL access, migrations against production, real messages, or a production release.
- The earlier audit's direct production SQL request was rejected by automatic approval review because that data source was outside its authorization. Do not retry through another interface. If direct production SQL is needed, prepare the exact read-only queries and request specific authorization after completing the available work.
- Follow `AGENTS.md` release rules: merging/pushing to `main` automatically deploys production and needs explicit release approval. Do not publish/share a preview without the required approval. Prepare commits, PR text, migrations and release instructions first; ask only when the next actual action requires approval. If an authorized review branch can be published privately, create a draft PR; otherwise leave the branch and PR description ready locally.
- Use synthetic data and a test email sink for mutation/E2E/concurrency tests. Do not log personal data or secrets. Clearly distinguish implemented, locally verified, staging verified, production verified, and awaiting an operating decision.

## 2. Architecture and behavior to preserve

The existing app uses strict TypeScript, Bun, TanStack Start/Router, React, Vite/Nitro, Supabase Postgres, Tailwind and shadcn/ui. Follow current versions and repository conventions. Do not migrate frameworks or broadly upgrade dependencies as part of this work.

Use the existing route → HTTP handler → service → repository architecture with dependency injection, Zod validation, injectable clocks, server-only boundaries, and explicit error contracts. No handwritten `any`. New mutations go through authenticated APIs; do not copy legacy browser-to-Supabase mutations. Keep role checks, RLS, RPC grants, pinned security-definer search paths, rate limits and applicable Turnstile protection.

Preserve the six admin navigation groups, verified volunteer identities, qualification evidence, immutable published policy versions, preview/revision safeguards, atomic booking commands, waitlist protections, attendance history, audit records, and existing recurrence engine. Reuse working pagination/debounce patterns in Finance and the animal coordinator, plus the CMS dirty-state guard.

Retain the approved HKSCDA branding in `brand/design-tokens.*`, `src/styles.css` and `docs/brand-guidelines.md`. Use Traditional Chinese appropriate to Hong Kong for product UI. Keep public animal photos large and authentic. Do not invent animals, rescue stories, qualifications, business rules or approved content.

## 3. Phase A — Repair volunteer reliability and deployment compatibility

At audit time, the production alias matched the audit SHA, but the migration ledger did not include these already-committed migrations:

- `supabase/migrations/20260913180745_volunteer_admin_directory_read.sql`
- `supabase/migrations/20260913182552_volunteer_legacy_list_alias_fix.sql`

The live people directory failed to load; the legacy identity list failed with `42702 column reference "a.id" is ambiguous`. This concerns legacy-list reads, not proof that all qualification mutations fail. Actual production function definitions were not inspected.

Required work:

1. Trace the latest definitions/callers, including `src/lib/volunteers/directory/repository.server.ts` and the legacy reconciliation SQL. Reproduce from an isolated database at the audit's recorded migration baseline, then upgrade with the repository migrations. Also test a clean installation. Do not rewrite previously applied migration history or duplicate an existing fix under a new timestamp without a concrete need.
2. Verify directory search includes verified volunteer profiles without registrations; verify legacy candidates load and role access stays correct. Do not hide a failed endpoint behind an empty list.
3. Add a deployment compatibility check for required database capabilities/migration state using an approved CI/test or release mechanism. Document database-before-dependent-app ordering and rollback compatibility. Keep privileged checks server-side; do not expose SQL definitions publicly.
4. Standardize volunteer API errors and UI action results. Fix the policy `{kind, issues/reason}` versus client `error` mismatch. Render validation, conflict, authorization and retryable failures with useful zh-HK guidance. Include clone, attendance, create, update, preview and bulk mutations. Keep technical details in appropriately redacted logs.
5. Avoid fetching the legacy reconciliation panel before it is opened when its results are not otherwise needed. Preserve filters and allow retry on failures.

Acceptance: fresh-install and upgrade tests pass; directory and legacy list load in the test environment; missing capabilities fail a release check clearly; no success-shaped empty result conceals an error. Production recovery remains a separate release verification item until authorized and performed.

## 4. Phase B — Connect the complete volunteer journey

### Policy-aware activity creation and editing

Replace the disconnected legacy creation/clone paths. Inspect `VolunteerManagement.tsx`, `src/lib/volunteers/{repository.server.ts,service.ts}`, policy services, jobs and current SQL before designing replacements.

- New incomplete activities default to drafts. A bookable published session must have the correct effective published policy, template and shelter bindings.
- Provide a working flow: choose template → choose date/time → resolve applicable policy → preview rules and availability → generate/publish through existing domain commands. Distinguish publishing a policy from publishing a session.
- Add a normal edit entry point. Separate descriptive edits from capacity, time, eligibility or policy changes; the latter must use impact preview and version checks. Show effects on existing registrations. Do not silently invalidate accepted commitments or rewrite attendance facts.
- Replace clone-with-original-date-and-`copy` behavior with “複製至指定日期”. Resolve target-date policy from the template, create new IDs, and do not copy registrations, terms consents or attendance history. A legacy source without a usable template needs explicit mapping before generation.
- Make mutations and required audit/outbox writes transactional. An audit failure must not leave an activity created while the UI reports failure. Make retries idempotent.
- Remove or reconcile the legacy public signup dead end: the old catalogue offers policy-less published activities that the newer registration guard rejects. Route eligible activities through the supported booking model; do not weaken the guard to make the old UI appear functional.

### Unresolved operating rules

The audit found existing draft templates and a working generation engine. These draft values are evidence, not permission to publish them:

| Draft setting | Decision still needed |
| --- | --- |
| Dog morning session 09:30–12:30, total capacity 10 | Whether group participants count toward the same total |
| Scenario B newcomer daily cap 5 | Distinct people versus attendance instances |
| Scenario A confirmed group / regular and senior volunteers | Actual experienced-volunteer cap; 5–6 was an example |
| Group booking windows | Open/close timing and any unresolved group size limits |
| T−48h release | Experienced-volunteer threshold, day versus session scope, weekday treatment |

Build a clear zh-HK decision checklist linked to the relevant fields, with examples and readable consequences. Keep unresolved policies unpublishable. Do not hardcode guesses, activate draft rules, or seed production sessions. Use explicitly labelled synthetic policy fixtures for tests. Keep an operations-decision document so HKSCDA can resolve these points without blocking the software implementation.

Distinguish an enquiry or pending group from a confirmed group. Scenario changes must not silently cancel existing volunteer commitments. Verify one complete policy-backed future session and member booking flow in the isolated environment before expanding to bulk generation.

### Member booking correctness

- Enforce configured `cancellation_close` rules in the authoritative cancellation command, including unrestricted, disabled and cutoff boundaries. Return available actions/reasons to the client.
- Make waitlist availability authoritative on the server. Handle eligible `capacity_full`, `reserved_for_core_role`, `role_full`, `tier_quota_full` and `daily_quota_full` cases according to the actual policy, including disabled/full waitlists and promotion rules.
- Implement reschedule preview with destination terms acceptance. Validate the destination policy/terms version in the same authoritative reschedule operation. A failure leaves the original booking intact; success records the accepted destination terms and transition. Do not require a second overlapping booking to accept terms.
- Use shared action eligibility across registration list/detail/member surfaces. Enable `completed` only after session end, with the server enforcing the same rule. Show errors for every action and preserve reasoned attendance corrections.
- Map actual server reason codes such as `overlapping_duty`, `not_open` and `registration_closed` into useful product explanations and next steps.
- Filter/paginate public sessions on the server before limiting results. Separate active future bookings from paginated past history so old creation dates cannot hide an upcoming commitment.
- Shorten the public volunteer introduction, distinguish first-time participation from returning-member sign-in, and expose schedule browsing earlier. Remove internal terms such as “快照” and “原子更新” from public flows. Add a direct group enquiry CTA where required.

Acceptance: test newcomer/regular/senior/group scenarios, cancellation boundaries, all supported waitlist reasons, cross-terms rescheduling, overlapping bookings and session-end completion against real isolated database commands, not only mocked frontend states.

## 5. Phase C — Make activity maintenance efficient and support bulk actions

This is the main usability deliverable. Build complete API-backed operations by extending the existing policy preview, recurrence, weekday/exclusion/horizon/duplicate checks and jobs. Do not implement batch work by repeatedly calling the unsafe legacy create endpoint from the browser.

### Daily workspace

- `/admin/volunteers/activities`: table/calendar views; default today through the next 30 days; explicit historical/all-date navigation. Store date range, filters, sort, page and selected activity in validated URL state.
- Filters: shelter, template, group scenario, status, policy readiness and staffing shortage. Search must match both title and location. Distinguish first-use empty, no matching results, loading and failed loading.
- Use server pagination with stable ordering/count semantics. Each row shows Hong Kong date, weekday/time, shelter, template, policy version, scenario, approved/waitlisted counts and applicable actions. Define shortage indicators from the actual policy, not guessed staffing rules.
- Use `Asia/Hong_Kong` consistently in date input, API conversion, tables, calendar and exports. Test from devices configured to other time zones. Do not append a UTC suffix to browser-local input and assume it is Hong Kong time.
- Open an accessible details drawer with details, registrations, attendance and history. On mobile use a suitable full-screen presentation. Preserve context on return; support keyboard focus management and meaningful buttons. Show today/previous/next calendar controls and a list alternative.

### Required bulk operations

| Operation | Required experience and behavior |
| --- | --- |
| Generate sessions | Published template(s) → date range/weekdays → exclusions → per-date preview → apply. Preview effective policy, closures, duplicates and unresolved blockers. Staff can generate four weeks without re-entering each date. |
| Copy to dates | Source/template → multiple target dates → target policy/time preview → create new sessions. Preserve source history. |
| Edit selected sessions | Choose supported fields; show before/after changes and affected registrations. Route policy-sensitive changes through versioned policy commands. |
| Close registrations | Require a reason where the domain requires it; preserve the session and existing bookings. Do not treat this as cancellation. |
| Cancel sessions | Preview affected bookings and notifications, require reason, preserve history, write cancellation/audit/outbox transactionally. |
| Attendance actions | Preview eligible records, explain skipped/conflicting items, enforce time/status/role rules and reasoned corrections. Never bulk-rewrite historical facts. |

### Selection, consistency and execution

- Explicitly distinguish “select this page (25)” from “select all matching”. Always show selection count, cross-page state and clear selection.
- For all-matching selection, the server captures exact IDs, revisions, filter/sort context, actor/scope and selection time. New matches must not silently enter the selection. Changing filters resets/rebuilds the selection with clear feedback.
- Previews identify date, time, shelter and policy on every item; repeated titles alone are insufficient. Bind apply to the previewed action, input, actor, IDs and relevant revisions. Recheck authorization at execution.
- Respect the existing 100-session policy preview limit. Larger selections need explicit, reviewable execution groups with progress; do not silently truncate or present multiple requests as one atomic transaction.
- Determine transaction/locking scope from shared business invariants. Sessions sharing a daily quota or other capacity constraint cannot bypass it across chunks. Lock scopes deterministically and revalidate shared constraints; reject unsafe groupings rather than weakening the invariant.
- Revalidate relevant session/policy revisions, registrations, group arrangements and capacity at apply time. A stale preview becomes a visible conflict requiring a fresh preview. Capacity reductions cannot silently evict confirmed volunteers.
- Use stable operation/item idempotency keys with server-side payload validation. Retrying after a timeout or lost response cannot duplicate sessions, audit entries or outbox events. Reusing a key with different input must fail clearly.
- Persist progress/results for work that spans requests. Report applied, skipped, conflicted and failed items accurately; retry only eligible failures with the original operation identity. Use existing job infrastructure when suitable, and do not rely on a tab remaining open.
- Distinguish the business result from notification delivery. An outbox entry is not proof of delivery; show pending/sent/failed using actual provider evidence and the existing retry/deduplication model.

Acceptance: four-week generation; 30 same-title sessions clearly distinguishable; page/all selection is exact; >100 selection is explicit and safe; double-submit/lost-response retry is idempotent; a second admin changing policy/registrations invalidates stale previews; shared daily capacity is never exceeded; closing signups preserves bookings; cancellation preserves history; mobile and keyboard workflows work end to end.

## 6. Phase D — Fix the remaining public and admin quality problems

1. **Animal editing/publication:** implement a real visual preview of the saved revision. Any relevant field/photo/gallery edit invalidates that preview. Require save and new preview before publishing changed content; the server must reject stale publication state. Prevent late initial draft loads from overwriting input, and add unsaved-change navigation protection using existing CMS patterns.
2. **Pagination/data access:** replace truncated or unbounded lists with server filtering, stable pagination and appropriate counts. Cover supporters (25), CMS rules/topics/reference pickers (50), public volunteer sessions/history (100), internships (500), animal lists (potential 1,000 cap) and access audit history (50). Return list summaries; load large descriptions, attachments, events and rosters only for details. Preserve filter/selection context.
3. **CMS:** fix the literal `????` label and the test that expects it. Add type-appropriate “新增內容” draft creation using the existing API and publication workflow.
4. **Content authenticity:** implement an explicit, reviewable separation between demo fixtures and publishable approved content. Add publication validation and a content-review queue using existing provenance fields where possible. Prepare a list of known demo items and the proposed unpublish/quarantine action, but do not alter production records or classify all legacy content automatically from titles. Do not fabricate replacement stories. Existing published demo cleanup requires a concrete authorized content action.
5. **Accessibility and copy:** add real keyboard-accessible review links/buttons to sponsorship rows; fix focus behavior for drawers and bulk controls. Translate raw statuses and inconsistent English in zh-HK admin surfaces. Show required-field validation after interaction/submission, not on an untouched form. Correct “建立新捐款人” in adoption intake to the appropriate supporter/adopter terminology.
6. **Photo maintenance:** provide a missing-photo filter/queue and clearer admin thumbnails, using real source photos and existing media controls. Omit repetitive nonessential “未有記錄” fields from public cards while keeping internal data-quality prompts. Keep already-improved public imagery and sponsorship functionality.
7. **Admin coverage:** review the current admin route inventory against the audit's 48 route files, including permissions and relevant changed write flows. Parent/index wrappers are not independent successful workflow tests. Avoid redesigning unrelated modules that already work.

## 7. Phase E — Improve performance with evidence

Known source risks were excessive volunteer polling/duplicate terms reads, broad calendar loads, per-keystroke source resolution, capped/unbounded lists and global locks acquired by read paths. Timeouts were observed, but lock contention was not proven as their cause. Vercel reported `iad1`; the database region was not verified. Historical September 5 local benchmarks do not establish current production performance.

- Establish a reproducible baseline for the current revision in an isolated environment with synthetic data. Record commit, runtime, dataset, device/network, concurrency, samples and p50/p95. Measure list-ready/filter-ready, API latency/payload, calendar, policy resolution, bulk preview and bulk apply separately.
- Reduce duplicated session/terms reads. Fetch immutable terms by version, reuse data already loaded, refresh availability appropriately, and refresh after relevant mutations. Do not share personalized eligibility or private results between users. Preserve booking correctness with authoritative write-time checks.
- Filter calendar queries by the visible date range and server-side scope. Return aggregate counts instead of up to 10,000 full registrations; load selected rosters on demand. Remove repeated full-array scans where a query/lookup map suffices.
- Debounce text filters/source resolution, cancel obsolete requests, retain useful previous results, and only fetch expensive collapsed sections when needed. Reuse established TanStack Query patterns; do not add overlapping caches without a clear consistency contract.
- Trace global volunteer locks in the latest SQL. Separate genuinely read-only availability/catalogue evaluation from mutations only after specifying acceptable snapshot consistency. Preserve authoritative transactional validation; any narrower locks need concurrency tests for shared quotas, qualifications, terms, rescheduling and bulk operations. Do not simply delete locks.
- Add privacy-safe route/action timing and structured error context. Investigate the observed React hydration error if reproducible; do not assert a root cause from error #418 alone.
- Use query plans on synthetic/approved data to justify indexes and query changes. Treat advisor warnings as candidates, not proven slow queries. Do not bulk-add every suggested foreign-key index, delete all “unused” indexes, or change hosting region without evidence.
- Measure animal image publication transfers before changing concurrency; if needed, use bounded concurrency and meaningful progress without weakening publication/audit consistency.
- Set and document realistic performance budgets from the controlled baseline and existing project gates. Record before/after under the same conditions. Report failed budgets honestly; do not invent a production speedup or claim zero errors without a defined observation window.

## 8. Required verification

Use behavior-level tests around concrete risks, not tests that merely repeat implementation details. Run repository-required gates after integration:

```sh
bunx tsc --noEmit
bun test
bun run lint
bun run build
```

Also run the applicable existing isolated database/RLS acceptance and public brand/accessibility gates after inspecting their configuration. The build does not typecheck. Never point fixture, reset, seed, load-test or mutation verification scripts at production. If a required runtime is missing, attempt the normal authorized setup; report a specific blocked gate if it cannot run.

Mandatory scenarios:

- Fresh database and migration upgrade from the recorded older baseline; directory/legacy reads and correct RPC grants/roles.
- Unauthorized/member/wrong-admin-role access to new read and mutation endpoints; no private data leakage in bulk previews, selection IDs or result retrieval.
- Unbound/unresolved policy cannot produce a bookable published session; valid generation binds the effective target-date version; duplicate generation is safe.
- Concurrent 11th applicant against capacity 10 and 6th newcomer against daily cap 5 in synthetic policies; confirmed-group scenario changes; configured T−48h boundaries. Assert invariants across separate sessions sharing a day quota.
- Cancellation unrestricted/disabled/cutoff boundaries; all eligible waitlist reasons and promotion; rescheduling to new terms and overlap; original booking retained on failure; no completion before end.
- Audit/outbox failure rolls back the corresponding mutation; retries and concurrent duplicates do not create duplicate facts. Test stale previews, reduced capacity, changed membership/role authorization and partially completed jobs.
- All-matching selection across pages, changes to filters, new matching records after selection, duplicate titles, >100-session batches, shared-quota groups crossing a nominal chunk boundary, and resumable result retrieval.
- 101 public sessions, 26 supporters, 51 CMS references, 1,001 same-category animals, 501 internship applications and >50 audit records. Late-page searches and records remain reachable; upcoming bookings remain visible despite long histories.
- Save animal A → preview A → edit B: stale publication rejected until B is saved and previewed. Slow initial loading cannot overwrite edits.
- Browser tests at desktop/mobile widths and a non-Hong-Kong device timezone; keyboard-only sponsorship review/bulk selection/drawer controls; visible action errors and correct empty states; no raw internal codes or `????` labels in the changed zh-HK flows.
- Controlled before/after performance measurements. Distinguish first observation from a proven cold cache, and development performance from deployed runtime performance.

## 9. Required handoff

Deliver:

1. A coherent implementation branch with scoped Conventional Commits, completed code and migrations, and no unrelated formatting or generated-file edits.
2. A concise implementation/coverage matrix: audit finding → change → test/evidence → remaining dependency. When a finding was already fixed in newer code, cite that evidence instead of rewriting it.
3. A staff-facing zh-HK quick guide for generating a month of sessions, editing selected sessions, closing registrations, cancelling sessions and correcting attendance. Include actual screenshots from the implemented test UI where available.
4. Test results and reproducible performance evidence with actual commands, commit, environment, fixtures, pass/fail and limitations. Redact personal data.
5. An operations-decision list containing only genuinely unresolved business rules/content approvals, with suggested questions and examples rather than invented defaults.
6. A release runbook: database/app dependency order, compatibility checks, backup/rollback considerations for the actual migrations, required approvals, targeted post-release smoke checks and error monitoring. A web rollback does not automatically roll back database state.
7. A draft PR or ready-to-post PR description explaining the problems, resulting behavior, verification and material remaining risks. Do not merge or deploy without the explicit approval required by the repository.

The implementation is ready for review only when the implemented UI calls the real tested APIs, the bulk workflows preserve booking/history/audit invariants, and all unblocked acceptance checks have results. Policy decisions, content approval and production release may remain explicitly pending. Do not describe production as fixed until the authorized release and production checks have actually succeeded.
