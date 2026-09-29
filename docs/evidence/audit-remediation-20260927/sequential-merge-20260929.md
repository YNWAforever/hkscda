# Sequential merge checkpoint — 2026-09-29

## #134 merged and deployed

- Reviewed PR head: `758fc9ac5f6423379a9cd87318d969e6e940ee63`.
- Merge/main/production SHA: `f61276f7a7560035ef7da8259eabb9149c82edca`.
- Post-merge CI run `36502210175`: completed SUCCESS, all five jobs green. Pre-merge run `36298813929`: all five jobs green and no failed steps.
- Local `bun test --isolate` with explicit `SUPABASE_LOCAL_URL=http://127.0.0.1:52321`: exit 0, 2787 pass, 83 skip, 0 fail. Initial default-55321 run failed six tests on the older local schema and was not counted as passing.
- Separate `bun run typecheck`: exit 0. Remote verify also ran lint and build successfully.
- Vercel production deployment `dpl_HudUFvLgLzewSFFycgBWvN1KHY8W`: READY at the merge SHA. Read-only alias GET `/`, `/donate`, `/adoption/instructions`: all HTTP 200.
- Both Turnstile and both Upstash variable names exist in Production. Provider transactions and complete CAPTCHA success: not-run.
- SEC-01 is partially deployed; later challenge normalization/readiness work remains separate. No production migration was needed for #134.

## #135 standalone rehearsal and repair

Production read-only catalog confirms `checkout_policy`, `checkout_method_approval`, `checkout_admission` and `admit_new_checkout(uuid,text,text,text,integer)` are absent. Required pre-existing payment config/admin/audit columns are present with expected types. PR base is now main.

A new disposable database `audit_pr135_20260929` in local container `supabase_db_hkscda-audit-integration-fresh` received the saved live public/private schema only, with no production rows. Initial restores failed for missing public citext/pg_trgm extension objects; adding those observed prerequisites made the restore succeed. Only #135's migration was then applied with `psql -X -1 -v ON_ERROR_STOP=1`, exit 0.

The actual service role reproduced SQLSTATE 42501 instead of P5101: row-locking SELECT needs write privileges that are deliberately withheld from application credentials. The existing test had called admission as the fixture owner. The regression now SET LOCAL ROLE service_role for every admission, including lock races and retries. Red: 0 pass/1 fail, expected P5101 but received 42501. Green after repair: 1 pass/21 assertions, exit 0, local 57322 fixture.

The undeployed migration now makes this fixed-search-path function SECURITY DEFINER, retaining service-only EXECUTE and the direct policy-write revocations. No extra application table grants are added. The CI `test:db` command now includes this regression on its existing loopback stack.

The corrected exact migration was replayed afresh on the standalone live-schema clone: exit 0. Transactional SQL assertions passed: RLS on all three new tables; no anon/authenticated access; service-only RPC grants; direct service policy writes denied; policy initially disabled; service admission returns P5101 and creates zero admission rows. Assertions rolled back.

Local verification of repaired #135:

- `bun test --isolate` with explicit local RLS 52321 and checkout DB 57322: exit 0, 2799 pass, 83 skip, 0 fail, 8542 assertions.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0, 52 warnings, zero errors.
- `bun run build` with fixture config: exit 0; generated route tree unchanged.
- New-head remote CI: pending push/run; older head's green checks do not validate this fix.

## Exact next production boundary

Review file: `supabase/migrations/20260927120000_checkout_policy_gate.sql`.
SHA256: `eddfba73603c199811c628584f4b0f30347ced0e18916b04c70bc69d4fb7d22c`.

Proposed scope after independent production migration approval: apply only this reviewed SQL atomically through the migration API, then read back signatures, RLS, effective grants and the disabled policy. Do not run db push or relabel historical ledger versions. Recheck the live object-absence preconditions immediately before application. A partial/pre-existing object is a stop condition.

It creates three new tables and three RPCs, with checkout disabled and no approved methods. It does not enable payments, mutate existing payment/donation facts, change webhooks, send notifications or perform refunds. Existing flows use the current app until the separate PR merge.

Rollback: before commit, any SQL failure rolls back the transaction. After deployment, revert application code through a reviewed PR and retain these additive objects disabled; do not drop admission/audit history. A code rollback removes the new admission enforcement and therefore needs assessment before use. No destructive down migration is proposed. Production backup/PITR readiness remains an operator gate.

#135 is code-complete/schema-ready only for the tested isolated scope, not deployed or operationally enabled. Production DDL approval is not implied by the user's main-merge approval. #136 also replaces this RPC and must preserve the corrected security mode before its own merge. #136-#179 remain unmerged.
