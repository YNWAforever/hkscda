# T24 · production-schema-only local bridge rehearsal, 2026-09-29 HKT

## Scope and source

Remote main and production alias were read-only verified at f8d5e5d5840d1775efb7d7f4ae2768f6557096b5. PRs #134–#179 remained draft; all 46 reported five successful GitHub checks at their own heads. The combined local app source is 72d0fda625791d974cd1fcd3d565360766b93bd8 and has not run remote same-SHA CI.

The live Supabase project iihqjzilgawhfdhdevam had 79 migration rows ending 20260914164558. No production DDL, migration, data write, reset, payment, email, preview or main merge was performed. Supabase CLI schema-only dumps of public, private and storage definitions were saved only under ignored node_modules/.audit-remediation-live-baseline. No production rows were exported or committed.

The CLI dry-run unexpectedly printed a short-lived CLI login credential. It was not copied into code, logs or documentation and was not reused. A read-only pg_roles check later showed cli_login_postgres valid-until 2026-09-28 16:32:34 UTC and expired=true at 16:53:04 UTC. CLI connection setup created or refreshed this temporary login role; this side effect is recorded here.

## Reproducible isolated commands and results

- bunx supabase db dump --project-ref iihqjzilgawhfdhdevam --schema private,public --file [ignored local path]: exit 0, schema definitions only. A separate public,storage dump supplied six live storage policy definitions.
- bunx supabase start --workdir node_modules/.audit-live-schema-20260929 with only database service: exit 0. Status returned linked_project=null and DB_URL on 127.0.0.1:61322. Migrations and seed were disabled. The two resets of this explicitly verified local stack used --local --no-seed and exited 0; no other stack was reset.
- The first local restore exposed missing public citext/pg_trgm extensions and private helper functions. After adding the observed extensions and including private, the restore succeeded. A second local reset removed bootstrap default grants before restore: without this correction the clone inflated anon/authenticated ACLs. Corrected private+public psql restore with ON_ERROR_STOP=1 exited 0; animals ACL and anon INSERT/EXECUTE counts matched direct live read-only catalog (22 tables and 91 public functions).
- Before migration, the local clone reproduced the live 145-requirement checker result: incompatible, 139 required issues (28 missing tables, 86 missing functions, 25 missing columns). The schema-only export omits the internal migration ledger, so an empty zero-row VIEW was created only on the local clone for the checker. No migration version was inserted or represented as applied.
- All 61 files newer than the live maximum version were checked against migration-manifest.csv SHA-256 and applied individually to the isolated clone with psql -v ON_ERROR_STOP=1 -1. Applied 61/61, zero failures. The per-file logs are ignored local artifacts. This was direct SQL rehearsal, not supabase db push or a production migration.
- After those 61 files, bun scripts/check-release-schema.ts against 127.0.0.1:61322 exited 0: compatible, 145 requirements, zero issues. The zero-row local view means latestMigration is null in that checker output; live ledger count/version were verified separately.
- The six storage.objects policies present in live pg_policies were copied from the schema-only dump to the isolated clone; all six CREATE POLICY statements exited 0. Their fingerprint then matched the 170-file fresh-install stack.

## Full local catalog comparison

The corrected live-schema-plus-61 clone was compared with the existing unlinked 170-file fresh-install database on 127.0.0.1:52322. Fingerprints covered public/private/storage tables, columns, functions, constraints, indexes, policies, triggers, views and schema ACLs. The remaining 74 raw differences comprise one live-only animals.source_url column, its live-only index, and 72 function entries. Of those function entries, 46 definitions differed only in comments/formatting under an approximate normalized hash; normalized definition differences were zero. Twenty-eight function ACL records differed. Effective public/private role-grant comparison found no grants present only in the bridge; 48 EXECUTE grants present only in fresh install were on 16 private functions. Public table/function effective grant counts matched exactly. Per-column effective grants differed only for four service_role privileges on the live-only source_url column. The comparison found no remaining table-core, constraint, policy or trigger differences in its selected schemas.

The normalized source comparison is triage evidence, not a parser-level semantic proof. The schema-only dump contains no production rows, storage objects or Auth identities. It does not prove a data-bearing upgrade, lock/backfill cost, backup/restore, exact 79-versus-source ledger reconciliation, old-app compatibility after migration, or provider/role/browser UAT.

## Release decision

NO-GO remains. The source repository still has 51 historical versions absent from the live ledger and the live ledger has 21 versions absent from source before the latest live version. Do not fabricate ledger rows or run a blind db push. A reviewed migration path, data-bearing sanitized rehearsal, backup/restore boundary, same-SHA remote CI, private candidate with real roles and provider sandbox, policy/content approvals, and compatible rollback must precede main merges. Existing webhook intake and reconciliation must continue while new checkout stays disabled.
