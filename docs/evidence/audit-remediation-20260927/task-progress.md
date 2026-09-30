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
- T03: server admission and donor projection implemented on `codex/audit-payment-policy-20260927`; migration applied only to dedicated loopback DB. New policy defaults disabled, with zero approved methods. Focused and isolated grant/replay tests pass; provider sandbox success/cancel/delay and operational approval remain not-run. PR is a review slice, not a release approval.
- T04: code-complete on `codex/audit-payment-instructions-20260927`: donation admission and sponsorship pledge instruction snapshots are durable; both API and email use approved purpose/version data; changed or revoked config suppresses old instructions while keeping evidence. Hard-coded account/link output removed. Dedicated isolated DB and email sink pass. Real approved content, provider sandbox and release activation remain external gates.
- T05: partial on `codex/audit-payment-lifecycle-20260927`: committed payment status and receipt/notification status are separate; a new donation-success trigger queues durable delivery with audit, protected hourly cron runs bounded batches, and PDF/email failures leave payment succeeded. Isolated DB trigger/grant test passes. Provider sandbox and historical data-bearing recovery rehearsal remain not-run; no operational enablement.
- T06: HKT receipt date and process-level single-flight font-byte cache implemented on `codex/audit-receipt-date-font-20260927`. UTC midnight/year-end tests and 100-PDF same-host benchmark pass. Font fetches 100→1; wall time and ~4.34 MB size did not improve. Rare glyph U+20BB7 is absent from the bundled font; alternate font/size remains open.
- T07: sponsorship proof challenge compatibility implemented on `codex/audit-proof-token-20260927`; absent token omission and legacy-null normalization are red-to-green, with signed-intent/fail-closed/replay regression coverage. Browser/provider UAT remains not-run.
- T08: explicit payment choice, proof validation, published PDF checksum consent gate, stale-version rejection, total-monthly/manual arrangement summary and actionable error states implemented on `codex/audit-sponsorship-commitment-20260927`. The new migration passed an isolated loopback dry run and rolled-back RLS/grant test; 67-object compatibility check exit 0. Bounded full suite: 2846 pass/86 skip/0 fail, exit 0. Synthetic 390px keyboard/payment-error UAT passed, with body-width red 573px → green 390px; existing floating shortlist overlap remains T24. Association-approved terms, audited slot assignment, end-to-end submission UAT and release approval remain open; no live publication.
- T09: opt-in seven-day versioned drafts, explicit restore/clear, data whitelists, photo re-selection, preparation checklist and final review changes implemented on `codex/audit-safe-drafts-20260927`. Full isolated suite 2834 pass/86 skip/0 fail; synthetic 390px mobile restore/clear browser UAT exit 0. Full eligibility/submission UAT and seven-day policy approval remain open.
- T10 / R03: code complete in draft PR #143, commit 62e22692d69b41135f705672c940976825281b53; synthetic browser and full isolated suite passed. No schema change or deployment. See t10-cms-unsaved.md.
- T11 / R04: code complete in draft PR #144, commit 558f191c4ff8b801bf4a758aef37d38118b3b528; bounded summaries, direct revision reads, role/no-store and isolated DB rollback passed. No schema change or deployment. See t11-cms-history.md.
- T12 / R05: versioned estate create/content/publication commands and additive audited SQL migration prepared in the independent branch codex/audit-estate-version-20260927. Red 0/3 to green 3/3, focused 76/76, full isolated 2794 pass/83 skip, rollback-only DB drill and synthetic mobile browser passed. Draft PR #145, source commit 60ed2d612d7b426d3d4641f6cbabf66f978d1486; release approval pending; no production DDL or deploy. See t12-estate-version.md.
- T13–T24: see separate PRs; not implemented in this branch. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

## T14 branch continuation

Draft #147 contains the immediate-export UI repair. This branch adds the independent background-export job: actor-bound filter snapshot, private 24-hour artifact, 500-row atomic progress, role reauthorization, cancellation fencing and expiry cleanup. See [T14 evidence](t14-background-export.md). The local DB/schema and synthetic UI checks passed; production migration, cron activation, real role UAT and release approval remain open. Other task slices are in separate draft PR branches, so rows above describe their original T00 worktree snapshot rather than the whole remediation programme.

## T15 branch continuation

Draft #149 addresses ADMIN-02 in an isolated branch: fresh supporter read on open, dirty-close guard, versioned atomic mutation and 409 conflict response. Its local synthetic browser and isolated DB tests passed; production schema, real test-identity UAT and release approval remain open. ADMIN-03 and later tasks remain separate. The original rows above describe this plan's T00 snapshot, not the whole remediation programme.

## Sequential release continuation — 2026-09-30

#134–#152 have merged sequentially (19/46), with each PR and its predecessor main CI checked before merge. #152 production READY; its main CI pending. T18/#153 archive leakage and migration identity collision repaired; local code/UI checks passed, current schema rehearsal and remote gates pending. See sequential-merge-153-20260930.md. Historical entries above are retained.

- T22 sequential #156: activation gate, challenge reset, pending verification lock and local OTP templates repaired. Full 2964 pass/96 skip/0 fail; typecheck/lint/build 0. Actual isolated Auth sink concurrent OTP check fails (two sessions). Recovery remains disabled and not merge-ready under all-tests-green. See sequential-merge-156-20260930.md.


## T22 recovery broker continuation, 2026-09-30

Implemented the approved purpose-bound/hashed/single-use15-minute fallback after native Auth concurrency failed. Code SHA `4a4eef8e2c5b146c401b442d8b9a8af494049ce2`, local gates and isolated schema ready; production DDL/deployment/enablement remain no. CRM-01 stays partial for #157 portal and external UAT. #134-#155 remain22/46 merged; no new merge or production mutation in this checkpoint. Trackers and manifest updated; [concrete release evidence](sequential-merge-156-broker-20260930.md).
