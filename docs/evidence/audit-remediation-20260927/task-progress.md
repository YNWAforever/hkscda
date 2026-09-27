# Audit remediation task progress

- T00: baseline completed at `f8d5e5d`; production alias and CI recorded. Original checkout preserved; handoff plan/spec and historical references copied, not rewritten.
- T01: code commit `da9967a`; diagnostics and migration manifest implemented. Fresh 143-migration install and 109-to-143 upgrade rehearsed in an unlinked disposable stack; 67 catalog requirements and RLS matrix passed. Still open: full constraints/indexes/forbidden grants/storage-policy review, data-bearing rehearsal, backup/restore proof and production approval. Production R01 remains incompatible.
- T02: partial, code commit `9854087`. Two reproduced defects fixed (error cause, private logging); #133 regression matrix passed; production public submissions now fail closed on absent Turnstile or required rate limiter and return 503 when the limiter is unavailable. Still open: readiness endpoint/synthetic, proper SSR 503/no-store, operational alert limits and live content gate.
- T03–T09, T11 and T13–T24: not implemented in this T00-based branch; see separate draft PRs for completed slices. No checkout/payment/content toggle was enabled here.
- T10 / R03: code complete in draft PR #143, commit 62e22692d69b41135f705672c940976825281b53; synthetic browser and full isolated suite passed. No schema change or deployment. See t10-cms-unsaved.md.

Ruling: Treat #133 adoption instructions as a narrowly restored public page and R01 as partial because the same release still lacks other required schema. A 200 response cannot close CMS, upload, submission, or finance compatibility. Cost if wrong: premature release acceptance.

- T12 / R05: versioned estate create/content/publication commands and additive audited SQL migration prepared in the independent branch codex/audit-estate-version-20260927. Red 0/3 to green 3/3, focused 76/76, full isolated 2794 pass/83 skip, rollback-only DB drill and synthetic mobile browser passed. Draft PR #145, source commit 60ed2d612d7b426d3d4641f6cbabf66f978d1486; release approval pending; no production DDL or deploy. See t12-estate-version.md.
