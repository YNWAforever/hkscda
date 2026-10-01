# R01: inherited service write privileges — 2026-10-01 HKT

Source repair: `aca5822a124521d9e6acc94b171600ac344e9b97`, based on released main `07e4c881863b715342ed0757aad7bd691a272738`. Independent SpecCompliance and Quality review approved this exact source; no actionable Critical/Important findings. This slice is **code-complete / schema-ready in isolation / deployed=no / operationally-enabled=no**. Complete R01 compatibility remains NO-GO.

## Reproduced defect and minimal repair

Production read-only metadata shows `public.crm_export_job` and `public.sponsorship_payment_instruction_snapshot` owned by postgres, RLS enabled, but service_role has SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. Production public table defaults grant service ALL. The earlier migrations revoke public/anonymous/authenticated access and grant service SELECT without revoking inherited service writes. The same omission affects the not-yet-created `public.recipient_notification_draft_duplicate_archive`.

The [new forward migration](../../../supabase/migrations/20261001080000_service_readonly_evidence_privileges.sql) has canonical LF SHA256 **e0023564a32cc3f46aff90647c0fa42a9909d9826e37c72442e4cf9a0e557808**. It precreates the empty duplicate archive with the identical historical table definition, enables its RLS, removes table and independent column privileges from PUBLIC/anon/authenticated/service_role on these three tables, then grants only service SELECT. It performs no archival, deduplication, backfill or application-row mutation. Existing owners, owner-context RPCs, default ACLs, other tables, finance/audit facts and migration ledger remain intact.

Runtime writer inspection confirms export enqueue/claim/page/append/fail/cancel/cleanup use guarded SECURITY DEFINER RPCs. Sponsorship snapshot capture likewise uses its owner-context RPC. The archive has no runtime direct service writer. Preserved functions/OIDs/owners/ACL/config and existing defaults/roles/ledger are checked by the isolated harness. Actual hosted staff/API/provider journeys were not-run for this slice.

## Actual verification

Windows; Bun1.3.14; PostgreSQL17.6; guarded disposable loopback database derived only from the existing schema/synthetic clone. Production owners/default grants are modeled inside this new copy. Source SQL and real [integration regression](../../../src/lib/operations/readOnlyEvidence.database.test.ts) are tracked; raw harness/logs and complete catalog snapshots remain ignored locally.

| Command / check | Actual result / exit |
|---|---|
| `bun test src/lib/operations/readOnlyEvidence.database.test.ts` — original grants, matched owners | RED:3pass/17fail/86assertions;20tests;430ms /1 expected |
| Same actual-role test after exact forward SQL | GREEN:20pass/0fail/110assertions;682ms /0 |
| Whole-file BEGIN/ROLLBACK rehearsal; lock2s/statement15s | Exact seeded candidate catalog/data/ACL/roles/defaults/ledger/sequence hash restored /0 |
| Reapply exact repair on the disposable copy | Catalog/data hash identical; idempotent /0 |
| Later unchanged historical CMS owner archival | Live drafts3→1; empty archive0→2; all9 inherited audit rows unchanged /0 |
| `bun test --isolate --timeout 30000` |3027pass/127skip/0fail;9415assertions;534files;83.65s /0 |
| `bun run typecheck` | Strict TypeScript /0 |
| `bun run lint` — initial/final | Initial1:115Prettier errors in new test. Owned file formatted; final0errors/52existing warnings /0 |
| `bun run build` | Exclusive serial build with loopback54329 and placeholder anon/service keys /0; generated route tree unchanged |
| `bun test src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts` |2pass/0fail/39assertions /0 |
| `git diff --check`; generated-file diff |0 /0 |

Full suite uses only the existing isolated checkout-policy DB and local Auth sink; the new20 opt-in DB cases are among its127skips and were run separately above. No real provider payment/email or public preview. `codex/audit-*` previews remain disabled by existing vercel.json. UI, new same-environment performance, hosted role/private-file/export UAT, full backup restore and provider sandbox were not-run for this grant-only slice.

INSERT/UPDATE/DELETE permission probes use `WHERE false`; they test statement authorization without changing records. TRUNCATE is genuinely attempted and rolled back to a savepoint, even on the original vulnerable schema. CRM's old TRUNCATE reaches FK error0A000 rather than42501; the repaired version rejects permission first. REFERENCES/TRIGGER/MAINTAIN are privilege metadata checks; no maintenance/trigger command ran. Residual service UPDATE on export `filters` and instruction `snapshot` is separately exercised.

Retained instrumentation history: first Bun absolute-path import failed before any connection/DDL. Two early RED runs had9pass/11fail because the older local instruction table was owned by supabase_admin; a postgres GRANT silently could not model its production owner. Both receipts and their explicitly paired `r01-readonly-red-first-tests.log` / `r01-readonly-red-second-tests.log` are preserved. Only the new disposable copy's owner was aligned to actual production postgres; matched RED then failed all17 expected assertions before source repair. Original stacks were never altered. The raw early receipts retain their original shared log-name field; publication does not relabel that field.

After every attempt the exact newly created DB was dropped without FORCE, and both original stacks matched full before/after hashes: clone `96379458830fa9f8bd2e4dae283dced3f57f26313dabbfdf2ce7835e0242a7e4`, dedicated `563122cc633da61f519909ba77cb6af26f651aca52649bcf00f325eff1b17058`. All9 inherited audits, original provider sessions, schemas/defaults/roles/ledger/data/sequences are preserved. [Sanitized receipt](r01-readonly-privilege-verification-20261001.json).

The evidence-summary helper initially matched an earlier diagnostic count in the full-suite log and exited1 before writing the receipt or trackers. It was corrected to read the final summary, then exited0; no tests or SQL were rerun for this metadata parser correction.

## Named production preflight / release / rollback

This new exact file has **no production migration approval yet**. #160's existing named question remains unanswered; #161's prior named scope approval remains operative. The supplied R01 catalog still reports146requirements/92gaps and ledger98. Earlier legacy SQL approvals are not included in this permission repair.

Before applying only the approved e002 file: fetch current main; verify exact source/head CI and predecessor main five gates/READY alias; refresh restricted encrypted backup and catalog; confirm existing export/instruction table shapes, owners, RLS and owner-RPC signatures/grants; check recipient draft shape and whether its archive is absent or exactly compatible. Reject unexpected views/columns/owners/catalog drift. Use bounded lock/statement limits inside the migration transaction and preserve the provider's actual generated ledger version.

Postflight must show all three tables RLS=true, service SELECT only, no forbidden table/column rights for PUBLIC/anon/authenticated/service, exact existing row/audit hashes/counts, unchanged functions/default ACLs/roles, empty newly created archive, and one genuine ledger addition. Recheck owned RPC permission compatibility before releasing code. Then merge the reviewed green PR and wait for all main gates plus the same-SHA READY alias. New checkout/payment admission, mail delivery and new media schedules stay disabled; existing webhook/reconciliation remain available.

Rollback retains the additive empty/archive schema and tightened ACLs; application rollback must preserve these security fixes. Do not restore mutable service grants, drop archived evidence, overwrite newer finance/audit facts or insert fake ledger entries. If an unexpected writer needs access, stop that affected operation and repair its guarded owner RPC after review. Existing backup roundtrip/ACL were checked previously; full restore/off-machine recovery/Storage bytes remain not-run.

Staff handoff: continue the controlled export/snapshot endpoints; service operators must use the existing RPC workflow. This change does not run exports, capture a real payment, deduplicate live drafts, send notifications or enable schedules. Broader R01 legacy dependencies have their own62-file catalog/rehearsal evidence and independent approvals.
