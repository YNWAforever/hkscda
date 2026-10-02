import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  hash,
  snapshot,
  localSourceState,
} from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  tables,
  fixtureScope,
  dependencies,
  functionsQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
} from "./task-9-profile";
const root = resolve(import.meta.dir, "../../../..");
const mode = process.argv[2];
if (
  !["hosted", "modern"].includes(mode) ||
  process.env.R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES !== "1"
)
  throw Error("Own Task9 catalog capture opt-in");
const out = resolve(
  root,
  ".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-capture-" + mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
const paths = [
  "docs/evidence/audit-remediation-20260927/r01-forward/task-9-capture.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-9-profile.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  ...dependencies.map(([p]) => "supabase/migrations/" + p),
];
const bindings: Record<string, unknown> = {};
for (const [i, p] of paths.entries()) {
  const b = await readFile(resolve(root, p));
  bindings[p] = {
    sha256: hash(b.toString()),
    canonicalSha256: hash(b.toString().replaceAll("\r\n", "\n")),
    archive: "s" + i + ".source",
  };
  await copyFile(resolve(root, p), resolve(out, "s" + i + ".source"));
}
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern);
const cap = mode === "hosted" ? await captureProductionSchema() : await captureModernLocalSchema(),
  c = await createProductionClone(cap),
  db = c.sql;
const receipt: Record<string, unknown> = {
  mode,
  out,
  at: new Date().toISOString(),
  bindings,
  clone: c.name,
  schemaParity: true,
  zeroApplicationTables: c.tableCount,
  sourceCatalogHash: hash(cap.catalog),
  fixtureScope,
  task1Applied: false,
  task8Applied: false,
};
try {
  await assertSafeFixtureTables(db, fixtureScope);
  receipt.scanner = "unchanged5352 fullscope PASS";
  for (const [f, h] of dependencies) {
    const s = await readFile(resolve(root, "supabase/migrations", f), "utf8");
    if (hash(s) !== h) throw Error("Accepted dependency bytes differ " + f);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(s);
    });
  }
  receipt.dependencies = dependencies;
  const catalog = await snapshot(db);
  receipt.catalog = catalog;
  receipt.functions = await db.unsafe(functionsQuery);
  receipt.auth = (await db.unsafe(authQuery))[0].value;
  receipt.native = (await db.unsafe(nativeQuery))[0].value;
  receipt.indexes = (await db.unsafe(indexDetailsQuery))[0].value;
  const profiles = [];
  for (const name of tables) {
    const profile = Object.fromEntries(
      ["relations", "columns", "constraints", "indexes", "triggers", "policies"].map((k) => [
        k,
        ((catalog[k] ?? []) as Record<string, unknown>[]).filter(
          (x) => x.schema === "public" && (x.table ?? x.name) === name,
        ),
      ]),
    );
    const [shape] =
      await db`select jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_rewrite r where r.ev_class=c.oid)) value from pg_class c where c.oid=${"public." + name}::regclass`;
    Object.assign(profile, { shape: shape.value });
    const [d] = await db`select md5(${profile}::jsonb::text) md5`;
    profiles.push({ name, md5: d.md5, profile });
  }
  receipt.profiles = profiles;
  receipt.catalogPreserved = hash(catalog) === hash(await snapshot(db));
} catch (e) {
  receipt.error = String(e);
  process.exitCode = 1;
} finally {
  await c.close();
  receipt.normalDrop = true;
  receipt.templatePreserved = c.templatePreserved;
  receipt.modernPreserved = modernBefore === (await localSourceState(modern));
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      out,
      mode,
      error: receipt.error,
      scanner: receipt.scanner,
      catalogPreserved: receipt.catalogPreserved,
      normalDrop: receipt.normalDrop,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
      functions: receipt.functions,
    }),
  );
}
