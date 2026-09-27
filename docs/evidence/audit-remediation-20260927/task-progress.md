# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T17 were implemented as stacked draft PRs #135–#152 on successor branches; see individual PR evidence. Later tasks have separate status entries below. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

- T18: code/schema implemented in draft PR #153, source commit 434ec6a38d2ddbd02e7250c18b2cf6b62413ba3c; exact seven-record read-only production review list, SQL eligibility/metadata, ended-event UI, photo queue and optional sponsor facts. Production classification, migration, replacement content and T21 filters remain open. See `t18-content-eligibility.md`.

- T19: code and additive schema ready in draft PR #154 (9b40e5a), stacked on #153; R08 fairness/fencing and staff queue tested. Five-minute cron, production migration and live metrics are not enabled. See t19-media-repair.md.

- T20: production server iad1 and DB ap-southeast-1 verified; same-SHA private-region benchmark and switch not-run. See region-benchmark.md.
- T21: public listing code/schema ready in draft PR #155, source 8352adfaa88ed6655f906571bb9c7397ec3f7329, with 10k parity/RLS and 30-sample local DB comparison. Production migration and paid image transforms remain disabled. See t21-public-pagination.md.

- T22 recovery: draft PR #156, source 3b5941b2b37860f0cfdc33cfe20a8c9072e19346; generic OTP request and public entry tested. CRM-01 partial until verified-record portal; hosted OTP settings and email sink not-run.

- T22 portal: verified records and private receipt authorization, explicit audited marketing preference. Source commit/PR pending. Full isolated suite 2844 pass, 89 skip, 0 fail; typecheck/lint/build exit 0; disposable catalog 87 compatible with manual unledgered local function. Real OTP email sink, hosted settings, status-link reissue and browser journey remain open; CRM-01 partial.

- T22 portal: draft PR #157 source ef59ca34b885822b9837aae3beee6ef0ad994db8; verify, brand, a11y, RLS and performance CI passed at that SHA. CRM-01 remains partial for hosted OTP/email sink/browser and ambiguous legacy records.
- T23 overview: read-only role-based task cards in progress; direct API/access/UI tests 4 pass and 11 metric queries executed against dedicated local PostgREST. Cross-domain bulk and filter-preserving links remain open.

- T23 overview verification: local typecheck/lint/build exit 0; isolated full suite 2849 pass 90 skip 0 fail after sequential rerun; 11 local PostgREST metric queries pass. An initial concurrent run timed out only in the unrelated migration safety scan (targeted rerun 1/1 pass).

- T23 CRM bulk slice: code/schema prepared on branch `codex/audit-bulk-review-20260928`, PR pending. Supports 25 visible or up to 1000 filtered supporters, immutable preview, per-item role/version check, 25-at-a-time apply, skip/conflict/result CSV and tab recovery. Dedicated local DB tests 2 pass/16 assertions; focused selection/API/UI 6 pass/27 assertions; 92-item catalog compatible. All production and cross-domain bulk remain open. Full release gates pending at this point.
- T23 CRM bulk dedicated-stack full suite: 2855 pass, 92 skip, 0 fail across 503 files. Initial default-old-stack run failed six unrelated RLS/document-slot assertions plus one CSV test edited concurrently; focused CSV and dedicated rerun pass. Final SQL checksum f106bf0 rehearsed in BEGIN/ROLLBACK.
