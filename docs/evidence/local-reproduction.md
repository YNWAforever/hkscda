# Reproducing the isolated completion checks

Code candidate `1b9265fd6d570c72af3eb8c670e96d58c1007cd2`; work from this isolated checkout. The original main checkout was not changed.

## Local stack identity

The verified source runtime is `supabase/.temp/completion-local`; its copied config project_id is `hkscda-completion-20260905`, API55321/DB55322. The restore runtime is `supabase/.temp/completion-restore`, project_id `hkscda-completion-restore-20260905`, API55621/DB55622. Both contain exact copies of repository migrations. These ignored directories are retained; do not point the verification scripts at production or another person's local project.

To recreate absent runtime directories, copy repository supabase/config.toml and all migrations into the corresponding runtime's supabase subdirectory, set those exact project IDs and port ranges, and verify the names/ports are unused before starting. No production .env file is needed.

Start/restart each chosen project explicitly:

```powershell
bunx supabase start --workdir supabase/.temp/completion-local --exclude studio,realtime,edge-runtime,logflare,vector,supavisor,imgproxy
```

Redirect startup output to its ignored start.raw.log because the CLI prints generated local credentials. Capture `supabase status --workdir <runtime> -o json` into memory and append a compact JSON object as the final line of that ignored log. The local acceptance scripts verify its exact API URL and read the key in memory; do not paste that JSON into evidence or chat. The restore project uses its own runtime path and556xx ports.

## Executed commands

- `bun --no-env-file test --isolate`: final1981pass46skip0fail while the local source stack was running. The40opt-in cases and6hooks behind skips executed separately.
- CRM: exact CRM_TEST_DATABASE_URL loopback55322 and CRM_TEST_ALLOW_LOCAL_FIXTURES=1, then manualGift.database.test.ts and publicIdentity.database.test.ts. Actual17/4passed.
- CMS: exact CMS_LIFECYCLE_TEST_DATABASE_URL loopback55322 and CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES=1; media suite additionally receives local API/service key from private status. Actual19passed.
- RLS: moneyPii.rls.test.ts with SUPABASE_LOCAL_URL55321 and matching local anon/service keys supplied only in the child environment.38passed.
- Reconciliation: follow `cms-wave1/reconciliation-commands.md`; explicit local-maintenance/apply path and integration opt-in only.1orphan deleted/7objects protected.
- Authenticated browser: existing CMS publishing verifier and CRM authenticated verifier against isolated app55430. They disclose exact-origin CSP and Chromium local-network permission setup. No production headers or API results are replaced; CMS recorded failure injections exercise recovery.
- Admin benchmark: `COMPLETION_LOCAL_BENCHMARK=1 bun --no-env-file scripts/verify-admin-local.ts` with the real local app55430 running. It creates and cleans uniquely marked fixtures at1k/10k/50k; run exclusively against the local stack.14/15proposed latency targets met.
- Restore: `COMPLETION_LOCAL_RESTORE=1 bun --no-env-file scripts/verify-local-restore.ts`, only after both exact disposable projects are ready and other fixtures are cleaned. It clears/restores data only in the556xx target after Docker name/port/local-socket checks. Synthetic Auth/Storage backup artifacts remain ignored.74table counts and52migration versions matched afterward.

Use clean allowlisted child environments as in the retained test launchers; never inherit provider keys or unrelated database URLs. Run database/Storage fixture suites serially. Whole-project typecheck, lint and build results are in the release-candidate text artifacts.

Both disposable projects were stopped after verification with their local data retained. Restart is possible using the explicit workdir commands above. Unrelated running projects were not stopped, reset or migrated.
