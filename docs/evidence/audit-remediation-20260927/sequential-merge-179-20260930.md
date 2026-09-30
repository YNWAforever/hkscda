# PR179 sequential release preparation — 2026-09-30

## Source and UI behavior

Application/integrated merge `c0da836ee5f3e3a47bd2d61f4cb83d7e52ec436a`; verified predecessor178 head `419da937b699ca619d89fe60f2de6a31a940a093`, app79838107. Original focused179 source958dfe9c was based on140; this candidate integrates all intervening fixes. The tracker merge retained the latest predecessor records and179's adoption row. The identical shared live-actor repair is present;175's updated fixture, follow-up report and separate captures are carried into this package.

Only `/adoption/apply` (including optional trailing slash) hides the fixed global shortlist tray. The provider remains mounted. Each ranked candidate has a labelled button with type=button; removal calls the exact animal ID through the existing reducer, compacts adoption ranks, preserves sponsorship entries and uses the established empty-adoption state. Other routes retain the tray. The historical failed-removal test and original captures remain in t09-adoption-wizard-overlap.md; they are not rewritten.

## Verification actually executed

| Command | Environment | Result / exit |
| --- | --- | --- |
| Independent focused `bun test --isolate src/components/site/adoption/WizardFields.test.tsx src/components/site/adoption/ApplicationWizard.test.tsx src/lib/publicAdoption/shortlist.test.ts` | original179 delta versus140; synthetic callback harness |26pass/59assertions; exact-ID/ranks/sponsor/empty handling; no findings /0 |
| `npm.cmd run typecheck` | integrated candidate |0 |
| `npm.cmd run lint` | integrated candidate |0;52warnings |
| `bun test --isolate --timeout 30000` | checkoutDB57322 and localAuth52321; no CRM-assignment DB opt-in |3155pass/150skip/0fail/9996assertions/589files/43.45s /0 |
| `npm.cmd run build` | synthetic loopback54329 Supabase settings |0 |
| `node scripts/verify-adoption-wizard-review.mjs` final | actual built178 before4174 /179 after4173, same read-only PostgREST fixture54329, browser/host/viewports |six captures; keyboard Enter removes middle candidate; ranks1,2; sponsor retained; next/back; remove all adoption candidates→empty state→actual client navigation→sponsor tray restored; after Axe0/overflow0/pageerrors0 /0 |
| Earlier browser harness runs | same environment |first URL glob failed on canonical query parameters /1; next erroneously required baseline Axe0 /1; corrected measurement/gate harness then reran |

The seven-step progress shell is present, but this slice's browser check traverses only ranking/contact/back/empty/list. Full seven-step submit, actual private uploads, staff receipt, expired status links, live provider sandbox and hosted real-role UAT are not-run. Local/full skips are not passes;178 actual assignment DB proof remains under its source and explicit opt-in. No real submission, email, payment, refund or content publication occurred. Build success is independently accompanied by typecheck success.

## Same-environment before/after

Chromium `148.0.7778.96`; fixture SHA256 `1515dea29e49e96a61c869945acdeb44000589fc433adbc950d96619592ed40c`. Both built previews run on the same Windows host with the same synthetic data and widths390/768/1440, height1000. One unthrottled cold-navigation CLS sample per viewport; these are not medians or hosted performance measurements. Desktop CLS remains unchanged. Baseline Axe finds color-contrast and landmark-unique with the selected global tray; after hiding that tray all three scans have zero violations.

| Width | Tray before→after | Removal buttons before→after | CLS before→after | After Axe / overflow / page errors |
| --- | --- | --- | --- | --- |
|390|1→0|0→3|0.104719→0.000861|0 /0 /0|
|768|1→0|0→3|0.011590→0.000000|0 /0 /0|
|1440|1→0|0→3|0.070421→0.070421|0 /0 /0|

- [t09-current-wizard-after-1440.png](ui/t09-current-wizard-after-1440.png) — SHA256 `eec616427a588cb3d2ef42836a127d1e2455a574835279c1c1c2214aa6685c40`
- [t09-current-wizard-after-390.png](ui/t09-current-wizard-after-390.png) — SHA256 `f72647508d48d10d0ea019cf920c47462fe050c5ac41dd35643aad02e65f5362`
- [t09-current-wizard-after-768.png](ui/t09-current-wizard-after-768.png) — SHA256 `84065da2111906437e491891d8de9b04f11cefa6c323f2e9fe75f81f033e3542`
- [t09-current-wizard-before-1440.png](ui/t09-current-wizard-before-1440.png) — SHA256 `3bd563bdd1457b373eab9672c2ea54d1a179218e95e5cd2629fbdec46b7a1040`
- [t09-current-wizard-before-390.png](ui/t09-current-wizard-before-390.png) — SHA256 `da5812f753559363fc718c37470ee810575e03e005b9aaa602e33685ed5a8685`
- [t09-current-wizard-before-768.png](ui/t09-current-wizard-before-768.png) — SHA256 `d7f2462829aaadc585dd89e1552891a3ea4d312f8a71cd74b691e8f266076e45`

Raw sample and environment metadata: [measurement JSON](ui/t09-current-wizard-results.json). Browser DOM/Axe checks verify generated artifacts; standalone image inspection is unavailable. Existing public median Lighthouse comparisons remain attributed to their original source/report. Current-head remote brand/a11y/performance/RLS gates follow the final push.

## Release package, operations and rollback

No new migration in179. The61-file inventory/checksums include preceding slices and remain per-file approval gated. Migration161 and157 approvals are retained;178 exact approval was requested after its five green CI gates. Other pending approvals remain pending. Do not apply the full inventory or alter the historical migration ledger. Production15supporters still lack178 owner column, ledger95. Remote main and refreshed production alias24196faf027998388eff3196a6979e23566e2443, deployment dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk READY. New payments and schedules remain disabled; existing webhooks/reconciliation are preserved.

Application rollback removes the focused wizard change, restoring the global tray; shortlist storage schema, drafts, stored applications, photos and payment facts are unchanged. Staff handoff remains: never infer submission from a saved draft; verify authoritative application/result state; expiry/unknown-response and private-file access require the pending role journey UAT. For the new assignment/financial queues use actor-scoped retained IDs and read-only refresh after unknown responses before retrying; inspect/download each per-item result. No refund, adoption approval or identity merge is authorized by these bulk tools.

[Tracker](tracker.csv) records every issue separately with code-complete/schema-ready/deployed/operationally-enabled fields. [Migration runbook](migration-runbook.md), [release manifest](release-manifest.json), [approval and PR queue snapshot](sequential-release-queue-20260930.md), [staff handoff](operations-handoff.md) and each sequential report contain the concrete release package. External gates:156 provider OTP atomic redemption (two sessions observed from one concurrent OTP; actual failing test exit1), exact outstanding production migrations, approved seven-day draft retention, bilingual sponsorship terms/policy/content, scoped hosted staff/test identities, provider sandbox/payment activation and notification/worker approval. Existing backup is restricted DPAPI with prior roundtrip proof; full restore and Storage backup are not-run. Reverify backup/catalog/hash before any separately approved DDL.

Code-complete for179 UI; no new schema; not deployed or operationally enabled. 22/46 requested PRs (#134–#155) merged.24 remain open. #156 ordinary CI is green but its required actual provider gate fails; disabled-feature release exception remains unanswered. No out-of-order merge occurred. This packet does not claim the entire remediation/UAT or release is complete. Current integrated179 CI pending push.
