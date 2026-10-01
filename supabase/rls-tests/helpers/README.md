# Guarded R01 schema-only clone harness

This test-only module has no import-time effects. It is shared by the scoped R01 tasks. Production access is limited to authenticated public/private schema export and read-only catalog metadata; no production rows are copied. Credentials and raw dumps stay in memory and are never printed or saved.

## API

```ts
import {
  captureProductionSchema,
  createProductionClone,
  assertSafeFixtureTables,
  snapshot,
  hash,
} from "./productionSchemaClone";

const capture = await captureProductionSchema();
const clone = await createProductionClone(capture);
try {
  await assertSafeFixtureTables(clone.sql, ["public.donation", "auth.users"]);
  // All task fixture/migration writes use clone.sql or clone.url here.
  const catalog = await snapshot(clone.sql);
  // Persist only approved sanitized metadata, facet counts and hashes.
  console.log({ catalogHash: hash(catalog), tables: clone.tableCount });
} finally {
  await clone.close();
}
```

- `captureProductionSchema()` uses pinned Supabase CLI2.118.0 and its existing stored authentication for the reviewed project. Catalog reads bracket the export; drift aborts. It returns an in-memory schema string and normalized catalog.
- `captureModernLocalSchema()` reads the declared fresh synthetic source at loopback57322, with the same capture/parity rules.
- `createProductionClone(capture)` creates a uniquely named `r01_clone_<32 hex>` database, OWNER postgres, from the declared synthetic template at loopback52322. It returns `{sql,url,name,catalog,tableCount,prerequisites,templateBefore,templatePreserved,close}`. The original template is never reset or modified.
- `assertCloneUrl(url)` requires that exact local host/port/name/credential shape and rejects additional URL options. This validates the intended connection boundary; only `createProductionClone` establishes creation ownership and parity.
- `schemaStatements(schema)` parses the dump, rejects data/global/role/schedule invocations and unsafe DDL expression evaluation, and allows stored function/trigger definitions without invoking them. CREATE TABLE must be a qualified column definition with only reviewed inert suffixes; CTAS and typed-table forms are refused even for SELECT1. HTTP/HTTP_* (including HEAD), net, webhook, cron, dblink and reviewed file/notification primitives are blocked where expressions can execute. Only the reviewed citext/pg_trgm1.6 extension prerequisites are created locally; other extension requirements fail closed.
- `assertSafeFixtureTables(sql,tables)` accepts qualified public/private/auth/storage table names (unqualified names mean public). It reads executable function definitions across schemas and independently classifies direct trigger entrypoints, then checks transitive trigger/default/check paths. Unknown entrypoints/dependencies, dynamic EXECUTE and unreviewed opaque implementations fail closed. Core pg_catalog builtins retain trust except explicit unsafe primitives. The sole reviewed external C prerequisite is extensions.gen_random_uuid: actual pgcrypto1.3 membership, pg_random_uuid symbol, $libdir/pgcrypto library, postgres/supabase_admin owner, zero args and UUID return must all match; a same-name impostor is refused. Definitions stay in memory. Tasks must call the guard for every directly or indirectly mutated fixture table; it is not a general proof that an arbitrary actor RPC is safe to invoke. Review that RPC's full call path before adding it.
- `snapshot(sql)` returns the full normalized public/private catalog projection. Function/view bodies are hashed. Definitions/defaults in the returned in-memory catalog can still contain private configuration; do not print or commit the entire object blindly.
- `localSourceState(url)` accepts only the two declared original synthetic sources; under a read-only transaction it hashes their public/private catalog, retained Auth/Storage metadata, all non-system table/materialized-view row aggregates (including synthetic ledger), and sequence state. It never exposes raw rows.
- `close()` closes owned connections, waits briefly for their normal disconnect, and drops only the exact newly created database. Active external sessions cause refusal; no FORCE, session termination, engine restart or cluster role alteration. It verifies the original template state hash afterward.

## Fidelity and its scope

Restore compares normalized schemas/owners/full effective ACLs including grant options; relations/RLS/options; every column/type/default and qualified collation identity; sequence datatype/start/increment/min/max/cache/cycle/ownership definitions; function identity argument names/types/returns/config/body hash/owner/ACL; constraints; indexes; noninternal triggers; policies; all public/private and database-wide default ACLs; types/enums; views; extension owners/versions/members; database owner and relevant role attributes/memberships. Sequence bigint properties use decimal strings to preserve exact values through JSON; hosted current sequence values are excluded because capture is schema-only. Names replace unstable object OIDs. Catalog deparsing pins an empty search_path.

Role attributes cover anon, authenticated, service_role, postgres and supabase_admin. Membership projection covers membership **into anon/authenticated/service_role**, including inherited/admin/set options; it is not a complete cluster membership inventory. Any mismatch aborts without changing cluster roles. Effective column permission checks in domain regressions must include inherited paths.

Auth/Storage definitions, ACLs, FKs, triggers, indexes and policies from the synthetic template are compared before/after public/private replacement. This proves retained local prerequisites; it does not claim hosted Auth/Storage equality. Schema-specific and global default ACLs are separately compared with hosted metadata. Application tables must be empty before synthetic fixtures. Original synthetic migration ledgers are retained and hash-checked; they are never replaced with fabricated production-applied versions and do not establish deployment readiness.

## Task1 runner

From the isolated worktree in PowerShell:

```powershell
$env:R01_FORWARD_ALLOW_LOCAL_FIXTURES = '1'
bun run supabase/rls-tests/helpers/runR01Forward.ts red
bun run supabase/rls-tests/helpers/runR01Forward.ts red-modern
bun run supabase/rls-tests/helpers/runR01Forward.ts actor-red-modern
bun run supabase/rls-tests/helpers/runR01Forward.ts green 20261001101333_r01_payment_idempotency_forward.sql
bun run supabase/rls-tests/helpers/runR01Forward.ts green-modern 20261001101333_r01_payment_idempotency_forward.sql
```

RED modes intentionally exit1 on the watched regression. GREEN modes require the exact focused migration filename, apply it twice only in the newly owned clone, verify negative preflight rollback and old-row/catalog preservation, run real SQL roles/concurrency/transaction tests, and clean up. Later tasks should reuse the API with their own focused runner rather than expanding Task1's migration allowlist. Opt-in tests accept only `R01_FORWARD_TEST_DATABASE_URL=clone.url` and remain skipped in the ordinary full suite.

Receipts/logs are written into the ignored task scratch directory. Copy only reviewed sanitized receipts to committed evidence, preserving failed attempts separately. No production application, provider call or release authority is supplied by this harness.
