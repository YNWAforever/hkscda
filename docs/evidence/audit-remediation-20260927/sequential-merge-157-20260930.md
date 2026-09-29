# PR #157 / T22 portal — sequential verification, 2026-09-30 HKT

## Scope and release state

Integrated baseline `390e5e11fc53a99ff89f76cba194dd40a3f64960`; implementation and regression evidence commit `09a2d1c727a1ecfb674810d622aa20e9a3541702`. This PR is stacked on #156. CRM-01 remains partial: portal application repairs are code-complete, the single RPC is ready in the isolated clone, production schema is not ready, and neither deployment nor operational activation has occurred.

#134–#152 remain merged (19/46). #153 requires exact two-file migration approval; #154 four-file approval and #155 single-file approval are recorded but conditional on the preceding releases. #156 remains blocked by its reproduced local Auth concurrent OTP failure despite five green CI jobs. This report does not close that failure. Payments, recovery delivery and the new media repair schedule remain disabled.

## Reproduced defects

1. A pending preference save for user A kept the controls disabled after switching to user B. The actual component fixture reproduced this at 390/768/1366px, exit 1. Reset the pending state on identity change and fence all old response handlers by the current identity.
2. A receipt response arriving after portal unmount could still navigate to its private download URL. The same baseline browser runner reproduced it; cleanup now invalidates the identity token and clears the query cache. The repaired runner exits 0 at all three widths.
3. Malformed JSON and an oversized preference request returned 503 instead of 400/413. Red: 1 pass, 2 fail, exit 1. The route now preserves those client error statuses, no-store and no mutation; focused green: 3 pass, 10 assertions, exit 0.
4. Equal-time consent records could display opt-in after withdrawal. The Supabase query contract test first failed (0 pass/1 fail); ordering now prefers opt-out before the ID tie-break, matching the mutation RPC. Repaired test passes.
5. The old rejection test accepted a missing RPC as a successful authorization rejection. Requiring SQLSTATE 42501 exposed two failures on the production-schema clone. The exact migration was rehearsed and applied only locally, then the strengthened role tests passed.

## Verification

Windows, Bun 1.3.14, Node 24.18.0. Final implementation content matches the commit above.

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | Checkout DB 57322; local Supabase API 52321 | 2975 pass, 100 skip, 0 fail; 9199 assertions, 521 files, 42.23s / **0** |
| `npm.cmd run typecheck` | Feature worktree | **0**, after correcting the synthetic fetch fixture type; earlier fixture-only typecheck was exit 2 |
| `npm.cmd run lint` | Full configured lint | **0**, 52 existing warnings |
| `npm.cmd run build` | Synthetic configuration, loopback URL 54329 | **0** on final implementation; framework regenerated the route registration |
| `bun test src/lib/supporters/marketingPreference.database.test.ts src/lib/supporters/portalConsentOrdering.test.ts` | Exact schema-only clone `audit_pr135_20260929`, 52322, explicit local-fixture flag | 5 pass, 0 fail, 15 assertions, 543ms / **0** |
| `node scripts/verify-supporter-portal-review.mjs` | Actual component, loopback 56556, synthetic A/B identities, intercepted API | Three widths pass identity switch, previous-record removal, stale receipt fencing and zero page errors / **0** |
| `node scripts/verify-supporter-session-revocation.mjs` | Existing isolated Auth 52321, one generated identity, no email | Existing token refused after suspension / **0** |

The browser runner also reports zero Axe violations at all three widths and no horizontal overflow at 200% zoom on the 768px viewport. Before/after images: `ui/t22-portal-{before,after}-{390,768,1366}.png`. Fixture server stopped after verification. This is a synthetic component journey, not hosted-provider or real-staff UAT. Local public-brand/performance runs are not-run for this slice; remote CI status must be recorded separately. The 100 skipped full-suite cases are not passed.

Direct API regression coverage retains fresh verified identity checks, rejects caller-selected supporter IDs, no-store responses and private receipt ownership checks. Actual production private-file downloads, real staff identities and hosted suspension parity remain not-run. The local Auth revocation script creates a magic link without sending email, verifies it locally, suspends that synthetic identity and removes it afterward.

## Exact migration manifest, dry run and catalog

- File: `supabase/migrations/20260927163302_supporter_marketing_preference.sql`
- SHA-256: `3c945333e0ee484d61fcfca2c2e29e4dfef9805945d993b2409306eefdf2df89`
- Adds only `public.set_supporter_marketing_email(uuid,text,text)`. No backfill or existing-row rewrite.
- Production read-only preflight at approximately 2026-09-29 18:53 UTC: ledger 88, function absent, nine required columns present, all six relevant tables RLS enabled; 15 supporters, 22 consent records and two receipts. No row contents were exported.
- Exact source SQL `BEGIN ... ROLLBACK` rehearsal on the production-schema-only clone: 309ms including Docker/psql overhead, exit 0. Then applied only to that clone, without fabricating a migration ledger entry.
- Catalog postflight: exact signature, SECURITY DEFINER with empty pinned search path; anon/authenticated EXECUTE false, service_role true. RLS remains true on supporter, consent, receipt, donation, adoption_case and sponsorship_pledge. Definer is required to read current Auth state; no public grants were broadened.
- Owner connection creates synthetic fixtures, then application calls execute as actual service_role. Wrong/unconfirmed/banned identity and actual anon/authenticated calls reject with 42501. Injected audit failure rejects with 23514 and leaves zero consent rows. Two concurrent identical preferences produce changed=[false,true], one consent and one audit. Synthetic supporter/Auth fixture counts return to zero.
- CI now has a dedicated mandatory preference DB step on disposable loopback 55322, in addition to the full suite. Its remote result is pending publication of this commit.

## Compatibility, rollback and approval boundary

Current production app is compatible with this additive unused RPC. New portal preference code requires it before release. The function rechecks confirmed, non-banned Auth identity and matching verified email, locks the active supporter, writes only email-channel consent plus audit in one transaction, and returns unchanged for repeats. It neither changes transactional-notice consent nor sends email.

Apply only this reviewed file after the earlier releases, a fresh catalog/hash/backup check and explicit production migration approval. Do not run db push, alter historical ledger rows or infer approval from this local rehearsal. Existing authorized CurrentUser-DPAPI backup is retained outside Git; its full restore is not-run and it excludes Storage object bytes.

Application rollback retains the additive function and all consent/audit history; do not restore an old full DB snapshot over newer events. Recovery remains absent/false until #156's concurrent OTP failure is resolved and hosted configuration and sending are separately approved. Staff should review only their verified-email records, explicitly choose marketing preference, and log out before sharing a device. Ambiguous historical identity linking or record corrections require the existing staff process, not automatic merges.
