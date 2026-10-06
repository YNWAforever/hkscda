/** Real SQL admission regression; safe metadata deviations in a new owned clone. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  snapshot,
  hash,
  localSourceState,
} from "./productionSchemaClone";
import { fixtureScope } from "../../../docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile";
const root = resolve(import.meta.dir, "../../.."),
  migration = "supabase/migrations/20261006163243_r01_volunteer_atomic_forward.sql";
if (process.env.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Owned Task8 admission RED required");
const out = resolve(
  root,
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-shape-receipts/red-" + Date.now(),
);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, ".gitattributes"), "* -text\n");
const files = [
  migration,
  "supabase/rls-tests/helpers/runR01VolunteerShapeRed.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile.ts",
];
const blobs = async () =>
  Object.fromEntries(
    await Promise.all(files.map(async (p) => [p, hash(await readFile(resolve(root, p), "utf8"))])),
  );
const frozen = await blobs();
for (const [i, p] of files.entries())
  await copyFile(resolve(root, p), resolve(out, `s${String(i).padStart(3, "0")}.source`));
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern),
  capture = await captureModernLocalSchema(),
  clone = await createProductionClone(capture),
  db = clone.sql;
const source = await readFile(resolve(root, migration), "utf8"),
  forced = Error("Task8 admission fixture rollback");
const receipt: Record<string, unknown> = {
  out,
  sourceCommit: (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim(),
  at: new Date().toISOString(),
  clone: clone.name,
  schemaParity: true,
  zeroApplicationTables: clone.tableCount,
  frozenInputs: frozen,
  fixtureScope,
};
const cases = [
  [
    "rewrite rule",
    "create rule task8_admission_probe as on insert to public.volunteer_activity do also select 1",
  ],
  [
    "descendant inheritance",
    "create table public.task8_admission_child () inherits (public.volunteer_activity)",
  ],
  [
    "ancestor inheritance",
    "create table public.task8_admission_parent ();alter table public.volunteer_activity inherit public.task8_admission_parent",
  ],
  ["unlogged persistence", "alter table public.audit_log set unlogged"],
] as const;
try {
  await assertSafeFixtureTables(db, fixtureScope);
  const baseline = hash(await snapshot(db));
  try {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(source);
      throw forced;
    });
  } catch (e) {
    if (e !== forced) throw e;
  }
  receipt.baselineAccepted = true;
  receipt.baselineRollbackPreserved = baseline === hash(await snapshot(db));
  const results = [];
  receipt.results = results;
  for (const [name, setup] of cases) {
    let setupReached = false,
      code = "success";
    try {
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(setup);
        setupReached = true;
        await tx.unsafe(source);
        throw forced;
      });
    } catch (e) {
      if (e !== forced) code = (e as { errno?: string }).errno ?? "unexpected";
    }
    const preserved = baseline === hash(await snapshot(db));
    results.push({ name, setup, setupReached, expected: "55000", actual: code, preserved });
    if (!setupReached || !preserved) throw Error("Shape regression setup/rollback failure " + name);
  }
  receipt.results = results;
  const misses = results.filter((r) => r.actual === "success");
  receipt.missedRefusals = misses.map((r) => r.name);
  if (misses.length < 1) throw Error("Actual missing relation admission guard RED absent");
  receipt.result = "actual watched RED: expected55000, receivedsuccess";
  process.exitCode = 1;
} catch (e) {
  receipt.error = { message: (e as Error).message, errno: (e as { errno?: string }).errno };
  process.exitCode = 1;
} finally {
  await clone.close();
  receipt.templatePreserved = clone.templatePreserved;
  receipt.modernPreserved = modernBefore === (await localSourceState(modern));
  receipt.frozenInputsPreserved = hash(frozen) === hash(await blobs());
  receipt.cleanup = "normal owned clone DROP";
  receipt.completedAt = new Date().toISOString();
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      out,
      result: receipt.result,
      results: receipt.results,
      error: receipt.error,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
    }),
  );
}
