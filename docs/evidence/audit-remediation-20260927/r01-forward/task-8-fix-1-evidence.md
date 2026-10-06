# Task8 fix round 1 — partial-installation overload admission

FIX_BASE: `3a0f22d976e8e9a8206156bba980ff3fa77bbce0`. Source repair: `960e275f754fb0d7904ddc27afeeafbf52358088`. Independent review identified that two total target tuples could be a recognized RPC plus a same-name overload while the other RPC was absent. The old non-STRICT selection checked only the first recognized tuple and created a third target.

## Actual watched RED, then minimal repair

`R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01VolunteerOverload.ts red`, native1, against unchanged FIX_BASE SQL. Raw: `task-8-fix-1-receipts/red-1791309225782/receipt.json`. Both partial directions reached setup with two actual tuples, were accepted instead of55000, then retained three targets inside the transaction. Existing synthetic activity/audit facts, catalog/rows/Auth/default/native/ledger/sequence/relation shape all rolled back completely; source stacks and frozen files were preserved.

The generator and regenerated same SQL filename now reject more than one tuple per target name and iterate through every captured tuple, validating its full recognized old/new signature/metadata before any function creation. Mutation selection is safe after those cardinality and complete validation guards. The generator also rejects duplicate or unknown target names in its measured input profiles. RPC body/argument/owner/ACL contracts and all profile/native/provider boundaries are unchanged; no engine predicate or profile union was added.

Regeneration used the same measured hosted/modern capture inputs: `capture-hosted-1791306675442/profile.json` and `capture-modern-1791306723722/profile.json`. New migration SHA256: `af8c834d95d38502d428dca95903e10d22cc57ed8df922f0a53cdb78d857ae9b`.

## Actual GREEN and covering profiles

`R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01VolunteerOverload.ts green`, native0. Final raw: `green-1791309558162/receipt.json`; both directions require and receive55000, reach the exact two-tuple setup and roll back completely. After-target count is not queried in an aborted transaction; the outside-transaction complete state hash proves rollback. The intermediate GREEN1791309383024 remains retained.

Atomic runner was invoked with `R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES=1`, `R01_VOLUNTEER_FIX_ROUND=1`, exact migration env path and modes `hosted`/`modern`. Each native0: 19 passed, 0 failed, 56 assertions; 14 actual55000 refusals. The two new probes seed recognized tuples using the same migration, remove the opposite target and install an unnamed same-name UUID overload within the transaction; setup count and full tuple capture prove these are the formerly missed two-row cases. Existing 12 negatives remain, and every setup is now explicitly reached before the actual admission call.

Final raw directories: `hosted-1791309475398/` and `modern-1791309532983/`, with receipt/test log/source archives. All rollback/two-apply/target-only/helper/rows/extra/source/template/modern/frozen flags pass. Good modern registration full tuple remains identical. Unchanged `atomicForward.database.test.ts` provides the 19 behavioral cases on both owned profiles. Only PG170006 was rehearsed; PG170011 cold exact-head CI, hosted JWT/PostgREST and disclosed future-policy UAT remain NOT_RUN.

## Scoped native checks and artifact preservation

`bun --no-env-file run typecheck`: native0,45.10s. `bun --no-env-file run lint`: native0,53.06s,0errors/52 baseline warnings. OS-only/no feature DB opt-ins/unavailable59999 placeholders. Raw: `checks-1791309560550415200/`. Full unit suite/build were not repeated in this controller-scoped fix round; the earlier four gates remain historical evidence at19e8b1ad, not current fix-gate claims.

The initial checks artifact assertion compared the original CRLF working manifest with its LF Git blob and failed; an empty AssertionError string made that ad hoc wrapper return0. Its missing artifact-preservation flag is not accepted as proof. Native typecheck/lint0 and frozen source hashes are independent. Strict audit `artifact-audit-1791309885468560200/`, native0, compares original and current committed ZIP/manifest bytes directly, raw local hashes across both fix audit observations, and every checked source binding against repair commit960e275f. All pass; neither representation changed. No artifact normalization or original evidence edits occurred.

New immutable `task-8-fix-1-raw-receipts.zip`: 69 files/21,598,619 raw bytes; 1,096,191 ZIP bytes. SHA256 `7d2f53db03634a25efab093b17961a25fd17c00fcd7d29ea5f0f09891053a0ae`. Every member is byte-equal to its retained original, with per-entry byte/SHA256 manifest. The original407-file ZIP and manifest are unchanged. Full source diff remains visible; only raw duplicate directories are ignored and ZIPs excluded from textual diff.

Self-review: the actual bypass is closed before mutation, every tuple is examined, both old missed states have watched RED/GREEN, both full owned profiles and14 negatives preserve metadata/data, unchanged RPC bodies and current-policy fence are retained, and original evidence remains immutable. Scoped controller re-review is required; the original review is not bypassed. No provider/profile widening, shared DB/role/reset, production mutation, push or activation was performed.

## Reviewed fix — full controller gates at67143d23

Independent fix1 spec/quality review approved the scoped repair. At frozen67143d23, all four native gates and harness exit0: typecheck83.78s; full units124.88s,4604pass654skip0fail12539assertions; lint62.88s,0errors/52baselinewarnings; build136.13s. Exact OS-only/Bun --no-env-file/59999 placeholders/no fixture or DB/provider opt-ins. Both then-current source DB raw hashes and all18 executable input hashes preserved; skipped DB tests are not acceptance. New immutable26-file controller ZIP/manifest/summary retains raw logs and bindings; all previous476 raw paths and both prior archives/manifests remain byte-exact. See task-8-controller-gates-20261007-evidence.md. Only170006 locally rehearsed; actual cold exact-head170011 CI and external/future-policy UAT remain NOT_RUN. Earlier failures and historical gate qualifications remain intact.
