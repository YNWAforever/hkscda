# T01 / R01 Supabase grants and RLS catalog recheck, 2026-09-28 HKT

Scope: local-only integrated app source 72d0fda625791d974cd1fcd3d565360766b93bd8, synthetic 170-migration Postgres on 127.0.0.1:52322, and read-only catalog metadata from production Supabase project iihqjzilgawhfdhdevam. No application rows, PII, storage objects, SQL mutation, migration ledger edits, provider operations or emails were used.

The invoked Supabase skill required a current documentation check. The direct changelog.md fetch was unsupported by the web reader; the official [breaking-change changelog](https://supabase.com/changelog?types=breaking-change) and [Data API security guide](https://supabase.com/docs/guides/api/securing-your-api) were consulted instead. They distinguish grants from RLS and explain the move toward explicit Data API grants. This scan checks actual current catalog privileges; it does not prove that every historical migration declares its grants explicitly under future default settings.

## Read-only results

| Check | Synthetic 52322 | Production metadata |
|---|---|---|
| Public ordinary/partitioned tables with RLS off and any SELECT, INSERT, UPDATE or DELETE grant to anon or authenticated | 0 rows; Bun catalog script exit 0 | 0 rows; Supabase execute_sql succeeded |
| Public SECURITY DEFINER functions with EXECUTE granted to anon or authenticated | One: volunteer_policy_contact_tasks(), returns trigger | Same one function and trigger return |
| Direct anon invocation of that trigger function | Corrected Bun read-only transaction harness exit 0; invocation rejected: trigger functions can only be called as triggers | Not attempted |
| volunteer_activity | Not part of this targeted live-policy check | RLS enabled; anon UPDATE grant present, authenticated UPDATE grant absent; pg_policies lists SELECT policies only and no UPDATE policy; anon/authenticated lack CREATE on public |

The first local direct-call harness attempt returned ERR_POSTGRES_UNSAFE_TRANSACTION because it used Bun's standalone unsafe transaction commands. The corrected harness used db.begin with SET TRANSACTION READ ONLY and SET LOCAL ROLE anon; its direct call was rejected by PostgreSQL. This is an execution-harness correction, not a passing first attempt.

The one trigger's default EXECUTE grant is unnecessary surface worth reviewing during the migration bridge, but this evidence does not show a direct-call data bypass or justify an unreviewed production grant change. Existing triggers, role checks and RLS must be preserved. No code or schema was changed for this finding.

## Remaining gate

The 145-item live comparison still reports 139 required schema issues and the 79-version ledger still diverges. This narrow scan does not evaluate every policy predicate, every forbidden grant, storage buckets/policies, function bodies, active role sessions, or PostgREST exposure settings. Before promotion, review those catalogs and run direct API/private-file checks with actual role identities. Rehearse the source migrations under the candidate project's explicit Data API grant settings. R01 and the release remain NO-GO.
