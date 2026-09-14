# Booking correctness release report — 2026-09-15

## Delivered scope

- New forward migration `supabase/migrations/20260914160716_volunteer_member_booking_correctness.sql` was created with Supabase CLI. Root applied it and two targeted function patches to dedicated local DB56322; no production access, resets, historical migration edits, or ledger mutation by this agent.
- Authoritative cancellation implements unrestricted, disabled, hours/calendar cutoff semantics (cutoff is inclusive), preserving attendance facts and suspended-member cancellation behavior.
- Availability returns authoritative waitlist eligibility/full/disabled reasons for capacity_full, reserved_for_core_role, role_full, tier_quota_full and daily_quota_full. Configured first-come waitlist promotion is enforced against earlier currently eligible/consented applicants.
- Existing move_preview/move_apply RPC names retained. Preview returns destination policy/terms/body and whether consent is required. Apply checks preview/policy/terms and accepts consent only from the registration owner within the same transaction; original booking survives failure and destination consent/transition survives successful retry exactly once. Staff cannot impersonate consent.
- Shared attendance action eligibility mirrors the existing authoritative start/end/status checks. Bulk owner integrates admin list/detail callers. Completed/no-show do not become available before end.
- Public sessions filter on server by query/title+location, shelter and Hong Kong date before stable starts_at/id paging (25+1 sentinel). Me reads separate upcoming/history pages and counts through a service-only RPC. Public projections exclude private notes/contacts.
- `/volunteer` starts with schedule/auth/group choices and supported policy signup. The obsolete policy-less signup form is removed. Confirmation shows configured age, eligibility and terms. Member actions show cancellation restrictions; `/volunteer/operations` supplies explicit destination consent.
- Booking/operation HTTP responses consume root's common error contract. Booking GET/POST use static telemetry labels and redacted failure logging; request timing does not contain actor/payload details.

## Verification

Real isolated commands:

`bun .local-policy-test/run-booking-tests.ts src/lib/volunteers/policy/booking.release.database.test.ts`

PASS: 1 lifecycle test, 178 assertions, approximately4seconds. Covers all five waitlist reasons/full/disabled, FIFO promotion after capacity frees, cancellation three modes and exact48h boundary, newcomer/regular/senior admissions, owner destination terms/wrong-version rollback/idempotent transition, overlap, completed-before-end denied/after-end factual event,27future registrations across25+2 pages,101newer historical registrations without losing future commitments and past page5. Fixtures have per-run registered synthetic shelters so immutable daily bindings do not collide across repeated runs.

`bun .local-policy-test/run-booking-tests.ts src/lib/volunteers/policy/policy.database.test.ts src/lib/volunteers/policy/group.database.test.ts src/lib/volunteers/policy/daily.database.test.ts`

PASS:4tests,152assertions. Existing group A/B, stale preview, atomic concurrent admissions, shared daily revisions/quotas/releases and legacy bypass checks remain intact. These ran before the additive FIFO guard; root full integrated acceptance owns the final complete suite.

Focused booking/unit/member/API/action tests:40tests119assertions passed before the final copy/test refinements. Obsolete legacy route/recovery tests were replaced with current behavior;7tests45assertions passed. New challenge test executes the current production command/run callbacks, checks stable retry key, error feedback, fresh challenge and preserved input. Repository tests assert filter/range/order/HongKong UTC conversions and that terms never fetch sessions/availability again.

Full source `bunx tsc --noEmit` passed during integration; final root gates supersede interim validation. Owned file ESLint passed before final documentation; final focused checks are rerun at handoff.

## Actual browser evidence

Browser skill CLI opened local56336; Playwright attached to that isolated Chromium for timezone/context control. `report.json` and `flow.json` under `.local-policy-test/browser/booking-release/` are copied into this release evidence directory.

- Mobile390x844 and desktop1440x1000 in America/Los_Angeles; product dates remain Hong Kong formatted.
- Public first load: one sessions request plus one terms request. Page2 works; changing search resets page1; direct group enquiry href preserved. No horizontal overflow or JS errors.
- Synthetic member private me endpoint200, owned counts/actions, booking cards rendered. Fresh refreshed-session role check confirms member read200 and admin endpoint403 (`member-role.json`).
- Actual UI mutation sequence: source booked/approved → destination preview requires new terms → apply disabled before consent → owner checks destination terms and applies → destination terms recorded → member cancels successfully. No JS errors/overflow.
- Screenshots: `member-public-mobile.png`, `member-bookings-desktop.png`, `member-reschedule-mobile.png`.

## Query and lock review

Baseline from current source before editing: public refresh made6database calls: catalogue SELECT+summary RPC, plus terms latest SELECT+duplicate catalogue SELECT+summary RPC+pinned terms SELECT. It ran every30seconds and on focus. Me made3calls and capped the latest100 registrations by creation date before considering future activity time.

After: first uncached public page uses4database calls; subsequent fully-pinned page refresh uses2(catalogue+summary), latest-following policies refresh only the latest pointer and missing pinned versions. The browser retains immutable term bodies. Poll cap is300seconds with earlier actual policy transition/focus refresh. Public HTTP count is still2on first load (not a claimed reduction there). Actual35second idle browser observation had0extra requests. Read page sizes are bounded25; no full-description/detail fetch introduced. These are measured request counts and inspected query counts, not a production latency claim.

The read global lock is deliberately retained for authenticated availability: volunteer_booking_command takes volunteer-domain then activity FOR UPDATE, then runs the multi-statement current policy/daily/role/waitlist evaluation. Removing it without a single-snapshot replacement could combine occupancy, daily release and policy revisions from different committed states. Mutations remain under the same canonical domain lock; tests verify quota/overlap and rollback. Public aggregate summary is SQL stable and does not acquire this domain lock; new member read RPC is stable and likewise reads one statement snapshot without mutation locks. Public aggregates are informational and book/apply revalidate authoritatively. Frequency/bounded projection reductions address pressure without weakening admission serialization.

## Remaining integration/release boundaries

Root owns final fresh+upgrade+compatibility/full-suite/build/brand checks, combined bulk review, commits and release approval. No production behavior/performance or notification delivery is claimed. Unresolved real operating policies remain unpublished. The user-facing guide is `member-booking-guide.md`.
