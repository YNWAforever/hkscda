# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T24: not yet implemented in this branch. No checkout/payment/content toggle was enabled.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

## T14 branch continuation

Draft #147 contains the immediate-export UI repair. This branch adds the independent background-export job: actor-bound filter snapshot, private 24-hour artifact, 500-row atomic progress, role reauthorization, cancellation fencing and expiry cleanup. See [T14 evidence](t14-background-export.md). The local DB/schema and synthetic UI checks passed; production migration, cron activation, real role UAT and release approval remain open. Other task slices are in separate draft PR branches, so rows above describe their original T00 worktree snapshot rather than the whole remediation programme.
