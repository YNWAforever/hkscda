# Bulk/activity release report

## Implemented

- Authenticated route → validated service → repository → transactional `volunteer_bulk_command`. Persisted actor/input/idempotency/exact selections and execution groups; status resumes from URL operation identity. Staff/admin identity is confirmed, non-banned and active at execution; treasurer denied.
- New draft creation is one audited, idempotent RPC and always draft. Legacy clone HTTP is authenticated410 directing target-date preview. Legacy audited updates cannot publish unbound drafts. Policy-sensitive rebind/publish uses effective published policies and the existing candidate/daily invariants; published policy versions remain immutable.
- Generate multiple templates over dates/weekdays/exclusions; four-week helper; per-date real domain preview (savepoint rollback) and explicit independent <=100 groups, all same-HK-day items together. Copy resolves target policy/new IDs, binds source revision, copies no booking/terms/attendance history. Descriptive edits, effective-policy rebind, close, cancel, attendance/correction implemented and audited.
- Group apply holds the existing volunteer-domain advisory lock. Same-day fingerprints include sessions, registrations, groups, scheduled published policies, relevant profiles/credentials and daily bindings. Changes cause visible conflict. Each group rolls back entirely on audit/outbox failure; retry keeps original identity. >100 same-day selection is explicitly rejected; 5000 selection bound is explicit, never truncated.
- 25-row filtered/sorted/count-aware table and calendar; Hong Kong dates independent of device timezone; default30days and historical/all navigation. Search title/location and policy-backed shortage counts. Exact page/cross-page/all selection; changed filters clear selection. Accessible Sheet drawer loads roster/history only on demand; both are independently paginated25 with totals.
- Actual outbox queue and immutable staff-completion records drive follow-up status. `volunteer_operation_changed` is handled by existing staff task workflow. Completion is never described as notification delivery; provider reference is shown only if present.
- Shared zh-HK error mapping and timing headers integrated. Calendar endpoint now uses bounded summaries; standalone calendar route uses the same workspace. Legacy completion buttons use shared authoritative action eligibility and HK formatting.

## Verification

- `bun test src/lib/volunteers/bulk`: 4 passed, 88 assertions, real dedicated DB56322 plus service/date unit checks. Covers28-day generation, exact130selection/two65groups, page6 of131rows, changed-input idempotency, lost-response retry, stale activity/source, close preserving booking, cancellation history, role revocation, draft-only atomic create, policy rebind publication, actual copy, attendance preview rollback/replay/correction, audit and outbox fault rollback/retry, >100same-day rejection, 52historyrecords/page3, actual pending→completed staff task without delivery evidence.
- Existing volunteer service/http/management:21 passed56assertions.
- Confirmed synthetic staff fixture repaired in CRM manualGift test;17 passed90assertions, retaining capacity/reduction concurrency assertions.
- `scripts/verify-volunteer-bulk.mjs`:6 real API/browser checks passed, no page errors, Axe0violations. Audited draft + selection/edit/preview/apply; LA-device HK09:30; detail Esc/context; mobile no horizontal overflow; standalone calendar route; treasurer403. Screenshots and JSON under `docs/evidence/operations-release-20260915/bulk/`.
- Final owned TypeScript check and focused lint passed (empty `.local-policy-test/bulk-typecheck.log` and `bulk-lint.log`). All owned files formatted. Root owns full build/replay/integrated gates.
- Before-edit live-local calendar SQL baseline saved:122rows39743bytes; scope excludes roster/HTTP. Separate controlled same122synthetic-row replay: old projection40261bytes122rows vs bounded RPC11759bytes25rows. Seven samples/two warmups: old p50 49.64ms/p95 132.64ms, bounded p50 65.97ms/p95 152.97ms. Payload reduction70.8%; no measured SQL latency improvement. No production performance claim.
- Actual bulk operation samples: preview n8 p50 9.81ms/p95 1031.34ms; apply n34 p50 49.11ms/p95 101.15ms. Varying operation sizes; not a controlled latency benchmark. Detailed sample scope in evidence JSON.

## Migration/integration

Forward migration created via CLI: `supabase/migrations/20260914160736_volunteer_bulk_operations.sql`. Root has applied approved local deltas only and coordinates clean/upgrade replay. Latest addition `.local-policy-test/bulk-followup-delta.sql` was applied by root. No existing migration rewritten, no production access, commit, push or deployment.

## Operational limits and decisions

- Groups are independent transactions, explicitly reviewed/executed by staff. No claim that a whole multi-day operation is atomic. A committed group survives page closure; unapplied groups can be resumed with the saved operation URL. Failed groups alone retain same retry identity; stale groups require new preview.
- Conservative same-day fingerprints can require fresh preview after another administrator changes relevant day data. Existing locks/quotas are retained; no speculative lock optimization.
- Draft policy business decisions remain blocked (shared group total, newcomer counting, experienced cap, group windows/size, T−48h threshold/scope/weekdays). Guide and field-specific decisions are in the bulk evidence folder. No production policies or sessions seeded.
- Notification records here are staff follow-up tasks, not provider delivery receipts. Provider sending and production release remain separate authorized operations.
