# CRM complete reads checkpoint (2026-09-06)

Allocated migration: 20260905162615_crm_complete_read_models.sql (unapplied).

Implementation: list filters/search execute as database predicates, latest channel consent breaks equal timestamps toward opt-out, aggregates are complete before output pagination, and supporters order by created_at/id descending. Supporter/donation exports return one JSON envelope under a single statement snapshot; >5000 is explicit overflow before row output. The adapter also refuses a short envelope whose row count differs from total. Donation exports retain receipt association. Supporter detail summary now uses complete aggregates and its donation history projects one persisted delivery job for root-owned retry UI.

Evidence:
- Export completeness regression: 7 pass/2 fail before checking returned envelope cardinality; 9 pass after.
- Equal-time consent regression: 3 pass/1 fail (opt_in incorrectly won); 4 pass after conservative tie-break.
- Read adapter + migration safety + admin audit contracts: 48 pass/0 fail.
- Typecheck exit 0 after complete-read integration.
- Existing supporter timeline/repository contracts: 6 pass/0 fail before adding persisted delivery metadata regression.
- Real gated tests extended for 1001/5000/5001 matches, every 1001 list record reachable, consent channels/ties, deleted filters, literal wildcard search, complete totals from1001 gifts and receipt mapping. Dedicated opt-in loopback URL absent: 1 guard pass/13 explicit DB skips including hooks. No fake or static check substitutes for these executions.

Outstanding: SQL compile and live aggregate/concurrency results; PostgREST execution of the JSON envelope against a local stack; 5000-row envelope size (count-only logging built into the local fixture); staging 1k/10k/50k p50/p95/EXPLAIN. Existing detail-history pagination is separate from this list/export completeness change; delivery metadata adds one bounded relation per returned donation, not another all-history query.

Follow-up: removed four speculative performance indexes after root review; query-plan-driven tuning remains a staging measurement gate. Actual local 5000-row JSON/CSV/heap observations are in serialization-5000.json, reproducible with `bun docs/evidence/crm-package4/serialize5000.ts`. All5000 IDs verified exactly once; metrics explicitly exclude database/PostgREST/staging latency.
