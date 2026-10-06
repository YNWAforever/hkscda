/** Real missing-target/unchanged legacy RED in uniquely owned zero-data clones. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureProductionSchema,
  createProductionClone,
  assertSafeFixtureTables,
  hash,
  snapshot,
  localSourceState,
} from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  names,
  fixtureScope,
  dependencies,
  functionsQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
} from "./task-10-profile";
const root = resolve(import.meta.dir, "../../../.."),
  mode = process.argv[2];
if (
  !["missing", "legacy", "direct", "truncate"].includes(mode) ||
  process.env.R01_ADMIN_ATOMIC_ALLOW_LOCAL_FIXTURES !== "1"
)
  throw Error("Own Task10 RED opt-in required");
const out = resolve(
  root,
  ".superpowers/sdd/r01-forward-schema-plan-20261001/task-10-red-" + mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
const paths = [
  "docs/evidence/audit-remediation-20260927/r01-forward/task-10-red.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-10-profile.ts",
  "src/lib/admin/atomicForward.database.test.ts",
  "src/lib/admin/accessFence.database.test.ts",
  "supabase/migrations/20261002111418_r01_admin_access_atomic_forward.sql",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  ...dependencies.map(([f]) => "supabase/migrations/" + f),
  "supabase/migrations/20260925110000_admin_user_access_atomicity.sql",
  "supabase/migrations/20260925133500_atomic_admin_invite_activation.sql",
];
const bindings: Record<string, unknown> = {};
for (const [i, p] of paths.entries()) {
  const s = await readFile(resolve(root, p));
  const archive = "s" + i + ".source";
  bindings[p] = {
    rawSha256: hash(s.toString()),
    canonicalSha256: hash(s.toString().replaceAll("\r\n", "\n")),
    archive,
  };
  await copyFile(resolve(root, p), resolve(out, archive));
}
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern);
const cap = await captureProductionSchema(),
  c = await createProductionClone(cap),
  db = c.sql;
const receipt: Record<string, unknown> = {
  out,
  mode,
  at: new Date().toISOString(),
  bindings,
  clone: c.name,
  schemaParity: true,
  zeroApplicationTables: c.tableCount,
  sourceBase: "efeb25631cef34cff13f3820229d4462323efbf3",
  task1Applied: false,
  task8Applied: false,
};
const extra = async () => ({
  functions: await db.unsafe(functionsQuery),
  auth: await db.unsafe(authQuery),
  native: await db.unsafe(nativeQuery),
  indexes: await db.unsafe(indexDetailsQuery),
});
try {
  await assertSafeFixtureTables(db, fixtureScope);
  receipt.fullScannerPassed = true;
  for (const [f, h] of dependencies) {
    const s = await readFile(resolve(root, "supabase/migrations/" + f), "utf8");
    if (hash(s) !== h) throw Error("Dependency bytes differ " + f);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(s);
    });
  }
  if (mode === "legacy") {
    for (const name of names) {
      const file =
        name === "activate_admin_invite_with_audit"
          ? "20260925133500_atomic_admin_invite_activation.sql"
          : "20260925110000_admin_user_access_atomicity.sql";
      const s = (await readFile(resolve(root, "supabase/migrations/" + file), "utf8")).replaceAll(
        "\r\n",
        "\n",
      );
      const m = s.match(
        new RegExp("create or replace function public\\." + name + "\\([\\s\\S]*?\\$\\$;", "i"),
      );
      if (!m) throw Error("Exact legacy absent");
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(m[0]);
      });
    }
  }
  if (mode === "truncate") {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(
        await readFile(
          "supabase/migrations/20261002111418_r01_admin_access_atomic_forward.sql",
          "utf8",
        ),
      );
    });
  }
  const before = hash(await snapshot(db)),
    beforeExtra = hash(await extra());
  receipt.completeBefore = await extra();
  const args = [
    "bun",
    "test",
    "--timeout",
    "15000",
    ["direct", "truncate"].includes(mode)
      ? "src/lib/admin/accessFence.database.test.ts"
      : "src/lib/admin/atomicForward.database.test.ts",
  ];
  if (mode === "truncate") args.push("--test-name-pattern", "TRUNCATE");
  const p = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env, R01_ADMIN_ATOMIC_TEST_DATABASE_URL: c.url },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  await writeFile(resolve(out, "tests.log"), stdout + stderr);
  receipt.testCommand = args;
  receipt.testExit = exit;
  receipt.testSummary = (stdout + stderr)
    .split("\n")
    .filter((s) => /^ \d+ (pass|fail|skip|expect)/.test(s));
  receipt.catalogPreserved = before === hash(await snapshot(db));
  receipt.completeMetadataPreserved = beforeExtra === hash(await extra());
  receipt.expectedRed = exit === 1;
  if (exit !== 1) throw Error("Actual expected RED absent");
  console.log(stdout + stderr);
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
      testExit: receipt.testExit,
      expectedRed: receipt.expectedRed,
      error: receipt.error,
      normalDrop: true,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
    }),
  );
}
