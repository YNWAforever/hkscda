# Production baseline compatibility follow-up

2026-09-13. Production inspection was read-only on project `iihqjzilgawhfdhdevam`. No customer rows, provider calls, production DDL or ledger repair were used. The release candidate now contains 37 new migrations: the verified prerequisite `20260913060000`, followed by the original 36 unchanged feature migrations.

## Confirmed findings and disposition

The 63-file source baseline yields 148 public/private objects; production exposes 146. After reproducing Supabase public default privileges in the disposable comparison database, 87 object fingerprints match exactly. Thirty functions match after whitespace normalization; that is an observation, not a proof of SQL semantic equivalence. Seven further function-body differences were inspected as diffs and contain comment removal only. Their production definitions remain intact unless an already-reviewed feature migration replaces them.

| Observed difference | Candidate disposition |
| --- | --- |
| Eight missing fields: donation attribution (4), webhook claim/expiry (3), payment provider order reference (1), with associated checks/indexes | Add nullable fields and their baseline constraints/indexes; no factual backfill |
| Three provider/method checks lack existing repository COD/AlipayHK values | Widen checks; no provider activation or payment action |
| Broad adoption policy named `admin only` permits authenticated actors without an administrator-role predicate | Replace this observed policy with staff/admin SELECT/UPDATE/DELETE policies |
| Older audit function copies restricted adopter/internal values; 19 audit triggers absent | Install redacted audit definition and missing trigger coverage; never rewrite historical audit rows |
| Two animal admin RPCs used by existing routes are absent | Restore atomic mutation/audit functions; explicitly revoke browser/PUBLIC execution and retain service-role execution |
| Production-only `animals.source_url` and unique index | Preserve both, including values; synthetic canonical-ID/source-URL retention is asserted |
| Sponsorship function comments, existing effective grants | Preserve; do not overwrite merely to match a hash |

The prerequisite checks reviewed function bodies, changed columns, named constraints, indexes, triggers and the replaced policies before executing DDL. An unexpected definition aborts; it must be inspected, not bypassed. It is a new additive migration with its own manifest hash. It does not mark any old version applied or replay the historical migration ledger.

## Executed verification

- `scripts/rehearse-baseline-parity.ts` rebuilt only `hkscda_baseline_parity_20260913` on dedicated local port 56322, with schema-only platform bootstrap and all 63 baseline files. It refuses an existing target unless `--replace-owned-comparison` is explicit. Production/customer data are not copied.
- `scripts/rehearse-production-baseline.ts` uses rollback-only transactions. It proves rejection of unreviewed function drift; the full 100-file source chain (63 + 37); and the prerequisite plus all 36 frozen migrations on the observed production-shaped relation schema. The relation comparison excludes physical column order, while separately checking every named column in the four changed tables.
- The final modeled schema contains all 288 accepted application objects. Remaining differences are reviewed comment hashes, the preserved production-only source column/index, and physical column order. Unexpected differences fail the script. A synthetic animal's exact canonical ID and source URL survive the chain.
- The prerequisite was also applied only to the existing disposable candidate stack. Full acceptance then passed **2343 tests, 1 intentional unrelated skip, 0 failures, 7620 assertions across 391 files**. Typecheck passed. See `parity-verification.json` for log hashes.
- The prior 99-entry CLI replay/no-op and browser/recovery reports remain historical evidence for the unchanged feature chain. This follow-up ran a SQL transaction rehearsal of all 100 files, not a new 100-entry CLI ledger/no-op or a new browser/recovery run. The dedicated candidate database still has its earlier 99 ledger rows; the local prerequisite was applied explicitly for acceptance.

## Release boundary

Apply the prerequisite before the 36 feature migrations, only after the existing release approval, backup and coordinated cutover requirements. Use an executor that records each newly applied migration exactly once. Recheck production drift immediately before release. Do not use `db push --include-all`, replay 63 baseline files, or manufacture a one-to-one mapping for the 33 historical remote entries.

This is a bounded public/private schema comparison, not a production clone or exhaustive platform audit. Extension-owned objects, storage policies/objects, ownership/default ACL equivalence, external provider state and production data validity are not established by these fingerprints. The historical ledger is deliberately unchanged. Missing photo sources, the original internship form and live provider gates remain as recorded in `final-acceptance.md`.