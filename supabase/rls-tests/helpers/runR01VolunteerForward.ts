/** Task8 rehearsal: new owned clones only, no legacy DML replay. */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  localSourceState,
  snapshot,
  hash,
} from "./productionSchemaClone";

const root = resolve(import.meta.dir, "../../..");
const mode = process.argv[2];
if (process.env.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES !== "1" || !["red", "red-actors"].includes(mode))
  throw new Error("Explicit Task8 owned RED opt-in required");
const out = resolve(
  root,
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-red-receipts",
  mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
const paths = [
  "src/lib/volunteers/atomicForward.database.test.ts",
  "supabase/rls-tests/helpers/runR01VolunteerForward.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "supabase/migrations/20260925104051_volunteer_public_registration_idempotency.sql",
  "supabase/migrations/20260913062837_volunteer_versioned_policy.sql",
  "supabase/migrations/20260905144848_public_supporter_identity_claims.sql",
];
const blobs = async () =>
  Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => {
        const s = await readFile(resolve(root, p));
        return [
          p,
          {
            sha256: hash(s.toString("utf8")),
            canonicalSha256: hash(s.toString("utf8").replaceAll("\r\n", "\n")),
          },
        ];
      }),
    ),
  );
const frozen = await blobs();
await writeFile(resolve(out, ".gitattributes"), "* -text\n", { flag: "wx" });
for (const [i, p] of paths.entries())
  await copyFile(resolve(root, p), resolve(out, `s${i.toString().padStart(3, "0")}.source`));
const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modernUrl);
const capture =
  mode === "red-actors" ? await captureModernLocalSchema() : await captureProductionSchema();
const clone = await createProductionClone(capture),
  db = clone.sql;
const receipt: Record<string, unknown> = {
  mode,
  startedAt: new Date().toISOString(),
  sourceCommit: (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim(),
  clone: clone.name,
  sourceCatalogHash: hash(capture.catalog),
  schemaParity: true,
  zeroApplicationTables: clone.tableCount,
  managedPrerequisitesHash: clone.prerequisites,
  testedExecutableBlobs: frozen,
  archivedExecutableSources: Object.fromEntries(
    paths.map((p, i) => [p, `s${i.toString().padStart(3, "0")}.source`]),
  ),
  dependencyGate: "root explicit d040 CI36960650129 attempt1 allfiveSUCCESS 2026-10-02T03:56:36Z",
  task1Applied: false,
  dependencySqlApplied: false,
  productionActions: "schema-only capture, no production rows or actor commands",
};
const rows = async () => {
  const result = [];
  for (const t of await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') union all select 'auth.users' order by 1`) {
    const [r] = await db.unsafe(
      `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${t.name} t`,
    );
    result.push([t.name, r]);
  }
  return hash(result);
};
const extra = async () => ({
  auth: await db`select c.relacl::text acl,(select jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns from pg_class c where c.oid='auth.users'::regclass`,
  defaults:
    await db`select to_jsonb(d) value from pg_default_acl d order by d.defaclrole,d.defaclnamespace,d.defaclobjtype`,
  native:
    await db`select to_jsonb(t) trigger,(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid) dependencies from pg_trigger t where t.tgisinternal order by t.oid`,
  ledger:
    await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`,
});
try {
  await assertSafeFixtureTables(db, [
    "auth.users",
    "admin_user",
    "supporter",
    "volunteer_activity",
    "volunteer_registration",
    "supporter_consent_intent",
    "audit_log",
  ]);
  const [auth] =
    await db`select has_any_column_privilege('service_role','auth.users','SELECT') sel,has_any_column_privilege('service_role','auth.users','UPDATE') upd`;
  if (auth.sel || auth.upd)
    throw new Error("Effective Auth privilege fidelity mismatch; no calibration authorized");
  receipt.authEffectiveAccess = auth;
  receipt.targetProfiles =
    await db`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) allargs,p.pronargdefaults defaults,pg_get_expr(p.proargdefaults,0) default_expression,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer,md5(p.prosrc) body,md5(pg_get_functiondef(p.oid)) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('create_volunteer_registration_idempotent','clone_volunteer_activity_with_audit','create_volunteer_registration','set_updated_at','record_public_consent_intents') order by n.nspname,p.proname`;
  await writeFile(
    resolve(out, "catalog-before.json"),
    JSON.stringify(await snapshot(db), null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    resolve(
      root,
      ".superpowers/sdd/r01-forward-schema-plan-20261001",
      `task-8-${mode}-${Date.now()}-schema.source`,
    ),
    capture.schema,
    { flag: "wx" },
  );
  const beforeCatalog = hash(await snapshot(db)),
    beforeRows = await rows(),
    beforeExtra = hash(await extra());
  const child = Bun.spawn(
    [
      "bun",
      "test",
      "src/lib/volunteers/atomicForward.database.test.ts",
      "--timeout",
      "30000",
      "--test-name-pattern",
      mode === "red" ? "missing-target" : "clone actor rejects",
    ],
    {
      cwd: root,
      env: { ...process.env, R01_VOLUNTEER_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const log = stdout + stderr;
  await writeFile(resolve(out, "test.log"), log, { flag: "wx" });
  receipt.testExit = exit;
  receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
  receipt.catalogPreserved = beforeCatalog === hash(await snapshot(db));
  receipt.rowsPreserved = beforeRows === (await rows());
  receipt.completeAuthDefaultNativeLedgerPreserved = beforeExtra === hash(await extra());
  const expected = mode === "red" ? "42883" : 'Expected: "42501"';
  if (exit === 0 || !log.includes(expected))
    throw new Error("Expected actual Task8 domain RED absent; inspect setup separately");
  receipt.result = "actual RED " + expected;
  process.exitCode = 1;
} catch (e) {
  receipt.error = {
    name: (e as Error).name,
    message: (e as Error).message,
    errno: (e as { errno?: string }).errno,
  };
  throw e;
} finally {
  await clone.close();
  receipt.templatePreserved = clone.templatePreserved;
  receipt.modernPreserved = modernBefore === (await localSourceState(modernUrl));
  receipt.frozenInputsPreserved = hash(frozen) === hash(await blobs());
  receipt.cleanup = "normal owned clone DROP";
  receipt.completedAt = new Date().toISOString();
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", {
    flag: "wx",
  });
  if (
    [
      "catalogPreserved",
      "rowsPreserved",
      "completeAuthDefaultNativeLedgerPreserved",
      "templatePreserved",
      "modernPreserved",
      "frozenInputsPreserved",
    ].some((k) => receipt[k] === false)
  ) {
    process.exitCode = 1;
    console.error("Task8 declared preservation failed; receipt written");
  }
  console.log(
    JSON.stringify({
      mode,
      out,
      exit: receipt.testExit,
      result: receipt.result,
      error: receipt.error,
      catalogPreserved: receipt.catalogPreserved,
      rowsPreserved: receipt.rowsPreserved,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
    }),
  );
}
