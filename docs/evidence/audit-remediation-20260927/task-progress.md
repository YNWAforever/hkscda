# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T10 and T12–T24: not implemented in this T00-based branch; see separate draft PRs for completed slices. No checkout/payment/content toggle was enabled here.
- T11 / R04: code complete in draft PR #144, commit 558f191c4ff8b801bf4a758aef37d38118b3b528; bounded summaries, direct revision reads, role/no-store and isolated DB rollback passed. No schema change or deployment. See t11-cms-history.md.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.
