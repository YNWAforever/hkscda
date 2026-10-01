# Task1 harness fix round1 — scoped re-review pending

BASE `7c5caf0ac9a7b2e4f8de96eacbf30b410631fbdd`; isolated branch `codex/audit-r01-payment-columns-20261001`. This fixes the reviewed clone-harness defects only. Payment SQL/ACL source is unchanged; its real JWT actor RED and authorization gate remain. No Task1 completion or production-readiness claim.

## Reproduced and fixed

Pure in-memory metadata probes call the actual helper; their SQL stub returns only synthetic catalog records and cannot execute SQL or make network requests. Watched initial RED:5pass/5fail/33assertions, exit1. It reproduced accepted CTAS/http_head and direct/transitive/opaque external trigger paths. The final guard suite is12pass/0fail/45assertions, exit0.

- CREATE TABLE now requires a qualified column-definition form and reviewed inert suffixes; CTAS and typed-table forms fail even for SELECT1.
- Direct network classification covers HTTP/HTTP_* including HEAD and webhook entrypoints independently of collected bodies. Supabase lists HEAD among the HTTP wrappers and documents its webhook trigger mechanism. [HTTP documentation](https://supabase.com/docs/guides/database/extensions/http), [webhook documentation](https://supabase.com/docs/guides/database/webhooks).
- Fixture function metadata is read across schemas. Direct unknown/network entrypoints, missing qualified dependencies, dynamic SQL and unreviewed opaque implementations fail closed; readable safe external SQL helpers are inspected and remain usable.
- The sole reviewed external C prerequisite is the existing extensions.gen_random_uuid implementation. Exact pgcrypto1.3 membership, library $libdir/pgcrypto, symbol pg_random_uuid, owner postgres/supabase_admin, zero arguments and UUID return are required. Same-name wrong-library metadata fails. PostgreSQL documents this pgcrypto function as delegating to the core UUID generator. [pgcrypto documentation](https://www.postgresql.org/docs/17/pgcrypto.html#PGCRYPTO-RANDOM-DATA-FUNCS).

Three conservative modern smoke failures were preserved separately. They identified the UUID extension alias and the template's supabase_admin owner; no guard was bypassed, no unsafe SQL executed, and each clone cleaned up with both original hashes unchanged. A separate pure UUID prerequisite regression watched10pass/1fail/41assertions before the exact verified exception.

## Expanded fidelity, new hashes

Catalog now includes qualified column collation identity and sequence datatype/start/increment/min/max/cache/cycle/ownership definitions. Bigint values are decimal strings. Hosted current sequence values are not exported. Fresh local variants changed a synthetic text column to collationC and a synthetic sequence's increment/cache/cycle; both differences were detected on both clones.

| Fresh source | New projection hash | Zero application tables |
| --- | --- | --- |
| Hosted public/private | 33b97d3a27da5629e8196a9241f78400682bb9c053a7adbd49f0c4c7ec55b959 |158 |
| Modern synthetic source |50bbc03d22ed2a419087aa56027e7be5a4c10c61cbf71662aa59398d317c4a63 |162 |

Retained managed Auth/Storage hash is now `2ecaca60ec0ee761ab184ce109a10b39f8d3f0d286eb9d2c5809495409bc964c`. Prior hashes/receipts remain historical, not overwritten: the new projection facets explain these revised hashes. Both smokes prove exact parity, fixture-path safety, variant detection, original template/modern source preservation and normal new-clone cleanup. No originals, cluster roles or schedules changed; no raw dump/function body/default/constraint expressions committed.

## Commands and exits

| Command | Exit/output |
| --- | --- |
| bun test supabase/rls-tests/helpers/productionSchemaClone.test.ts | final0;12pass/0fail/45assertions |
| bun run typecheck |0; tsc --noEmit |
| bun node_modules/eslint/bin/eslint.js supabase/rls-tests/helpers/productionSchemaClone.ts supabase/rls-tests/helpers/productionSchemaClone.test.ts |0; empty output |
| bun run .superpowers/sdd/r01-forward-schema-plan-20261001/probe-task-1-fix1.ts |0; modern+hosted receipts all preservation/variant/safety checks true |

The local smoke recipe uses the documented capture/create/guard/snapshot/close API and only these inert variant statements in the newly owned database:

```sql
CREATE TABLE public.r01_fidelity_probe(value text);
CREATE SEQUENCE public.r01_fidelity_sequence
  START 7 INCREMENT 3 MINVALUE 1 MAXVALUE 999 CACHE 4 CYCLE
  OWNED BY public.r01_fidelity_probe.value;
-- Snapshot, then compare the columns/sequences facets after:
ALTER TABLE public.r01_fidelity_probe ALTER COLUMN value TYPE text COLLATE "C";
ALTER SEQUENCE public.r01_fidelity_sequence INCREMENT 5 CACHE 8 NO CYCLE;
```

`task-1-fix1-verification.json` binds amended functional files to exact Git blobs and canonical hashes. Full suite/build/repository lint were not redundantly repeated; earlier receipts preserve their tested source meaning. Independent scoped re-review and exact-head CI remain external. No push/PR/merge or production/provider mutation occurred.
