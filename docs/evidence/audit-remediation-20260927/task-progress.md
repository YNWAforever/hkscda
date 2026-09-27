# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T17 were implemented as stacked draft PRs #135–#152 on successor branches; see individual PR evidence. T19–T24 remain pending. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

- T18: code/schema implemented in draft PR #153, source commit 434ec6a38d2ddbd02e7250c18b2cf6b62413ba3c; exact seven-record read-only production review list, SQL eligibility/metadata, ended-event UI, photo queue and optional sponsor facts. Production classification, migration, replacement content and T21 filters remain open. See `t18-content-eligibility.md`.
