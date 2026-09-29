# Review slice 09 — sponsorship commitment and terms (T08)

Base: `codex/audit-safe-drafts-20260927` commit `4b05d09`. Branch: `codex/audit-sponsorship-commitment-20260927`. This is a draft review slice. No public preview, production migration, publication, email, or payment was authorized or performed.

## Behavior

- Payment choice is explicit: later after verified arrangements, or already paid with proof. The latter requires positive proof amount, valid date and supported non-empty file within 8 MiB before upload. Existing signed proof intent, atomic pledge, fingerprint and retry boundaries remain in place.
- The existing document-asset/slot model serves published sponsorship terms by language. PDF SHA-256 is the consent version; the server re-reads the current published slot before any new submission. Missing terms return 503; stale version returns 409 and preserves the form. Matching completed retries still recover the original status link.
- Form and status show one total monthly amount for all preferences, staff matching, manually arranged first and later monthly support, and a staff contact route for changes/stopping. They make no automatic-charge claim.
- The client shows field reasons for 400, preserves data on 409, and gives actionable 413, 429 and network guidance. It reuses the same prepared pledge ID for retries, with server fingerprint conflict protection.

## Verification and limits

Red tests reproduced automatic terms-version default, absent payment-choice radio and lost upload 429 status. Focused `bun test src/components/site/sponsorship src/lib/sponsorship` exit 0: 259 pass, 1 skip. Route/terms/upload isolated tests and migration rehearsal passed. Full `bun test --timeout=30000 --max-concurrency=8` with `SUPABASE_LOCAL_URL=http://127.0.0.1:57321` exited 0: 2846 pass/86 skip/0 fail. Plain `bun test` against the unrelated 55321 default stack failed six DB tests and the new submit precondition harness; the updated harness passed, isolated DB RLS focused tests passed 48/48. A following default-timeout full run on 57321 had one 5-second DB hook timeout; bounded-concurrency rerun passed. `bun run typecheck` exit 0; `bun run lint` exit 0 with 53 warnings; `bun run build` exit 0 after the final UI change. Synthetic 390×844 mobile/keyboard script exit 0 after a red 573px body-width assertion; fixed screenshot width 390px: later/proof radios, proof errors before upload, 400 field reason and 409 consent refresh preserving the name; screenshots and script are in `sponsorship-qa/`. No approved terms PDF was supplied; public terms publication, successful submission, provider sandbox and full real-content mobile/keyboard UAT are **not-run**. The admin UI lacks an audited terms-slot assignment workflow; operational enablement remains blocked. The existing floating shortlist bar overlaps contact fields on 390px mobile and remains a T24 issue.

Rollback boundary: preserve existing pledges, status tokens, proof objects and consent history. Stopping new submissions must not interrupt existing webhook/reconciliation. Do not publish an unapproved document to satisfy the gate.
