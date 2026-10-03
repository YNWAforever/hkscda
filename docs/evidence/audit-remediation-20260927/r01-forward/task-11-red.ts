/** Failure-first Task11 proof; production read-only capture, new local clone only. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  captureProductionSchema, createProductionClone, assertSafeFixtureTables,
  hash, snapshot, localSourceState,
} from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import { authQuery } from "./task-9-profile";

const root = resolve(import.meta.dir, "../../../..");
const mode = process.argv[2], out = resolve(process.argv[3] ?? "");
if (!["missing", "legacy"].includes(mode) || !out.startsWith(resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001/task-11-")) || process.env.R01_FINANCE_CALLBACK_ALLOW_LOCAL_FIXTURES !== "1") throw Error("Exact Task11 local opt-in and owned output required");
const legacy = [
  "20260925143941_guarded_provider_denial.sql",
  "20260925144915_guarded_provider_refund.sql",
  "20260926082239_atomic_receipt_void_audit.sql",
  "20260926083940_atomic_manual_receipt_issue_audit.sql",
];
const paths = [
  "docs/evidence/audit-remediation-20260927/r01-forward/task-11-red.ts",
  "src/lib/donations/financeCallbackForward.database.test.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-9-profile.ts",
  ...legacy.map(p => "supabase/migrations/" + p),
  "supabase/migrations/20260913081521_sponsorship_partial_refunds.sql",
  "supabase/migrations/20260623160506_phase_2_donations_mvp.sql",
  "src/lib/donations/reconcile.server.ts",
];
const fixtureScope = ["auth.users", "admin_user", "supporter", "donation", "payment", "receipt", "receipt_sequence", "audit_log", "supporter_consent_intent", "donation_delivery_job"];
const names = ["fail_pending_provider_payment", "refund_provider_payment_atomically", "void_receipt_with_audit", "void_donation_receipts_with_audit", "issue_receipt_with_audit"];
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const receipt: Record<string, unknown> = {
  mode, out, at: new Date().toISOString(), sourceBase: "d45b849d300f76700efcf5450a9b426e32cc372f",
  sourceTree: "aeb6c4e396969a5296483ddf2525c90894bd440a", fixtureScope,
  task1Applied: false, task8Applied: false, productionApplied: false, deployed: false,
  operationallyEnabled: false, error: null, failedFinalFlags: [],
};
await mkdir(out, { recursive: true });
const bindings: Record<string, unknown> = {};
for (const [i, p] of paths.entries()) {
  const b = await readFile(resolve(root, p));
  const proc = Bun.spawn(["git", "hash-object", "--no-filters", resolve(root, p)], { stdout: "pipe", stderr: "pipe" });
  const [blob, err, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0 || err) throw Error("Git source binding failed " + p);
  bindings[p] = { rawBytes: b.length, rawSha256: sha(b), canonicalSha256: hash(b.toString().replaceAll("\r\n", "\n")), rawGitBlob: blob.trim(), archive: "s" + i + ".source" };
  await copyFile(resolve(root, p), resolve(out, "s" + i + ".source"));
}
receipt.bindings = bindings;
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres";
let modernBefore: string | undefined;
let c: Awaited<ReturnType<typeof createProductionClone>> | undefined;
try {
  modernBefore = await localSourceState(modern);
  const cap = await captureProductionSchema();
  receipt.sourceCatalogHash = hash(cap.catalog);
  receipt.productionBefore = cap.catalog;
  c = await createProductionClone(cap);
  const db = c.sql;
  receipt.clone = c.name; receipt.schemaParity = true; receipt.zeroApplicationTables = c.tableCount;
  receipt.auth = (await db.unsafe(authQuery))[0].value;
  receipt.functionsBefore = await db.unsafe(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) allargs,p.pronargdefaults defaults,pg_get_expr(p.proargdefaults,0) default_expression,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer,md5(p.prosrc) body,md5(pg_get_functiondef(p.oid)) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private','auth') and (p.proname in (${[...names, "issue_receipt", "next_receipt_no", "lock_admin_user_mutation", "require_active_admin_user", "uid"].map(n => "'" + n + "'").join(",")}) or p.oid in(select tgfoid from pg_trigger where tgrelid in (${fixtureScope.map(n => "'" + (n.includes(".") ? n : "public." + n) + "'::regclass").join(",")}) and not tgisinternal)) order by n.nspname,p.proname,args`);
  receipt.stage = "full-scanner";
  await assertSafeFixtureTables(db, fixtureScope);
  receipt.fullScannerPassed = true;
  if (mode === "legacy") {
    for (const file of legacy) {
      const sql = await readFile(resolve(root, "supabase/migrations", file), "utf8");
      await db.begin(async tx => { await tx`set local role postgres`; await tx.unsafe(sql); });
    }
    receipt.legacyInstalled = true;
    await assertSafeFixtureTables(db, fixtureScope);
  }
  const before = hash(await snapshot(db));
  receipt.preTestCatalog = await snapshot(db);
  receipt.stage = "database-test";
  const args = ["bun", "test", "--timeout", "15000", "src/lib/donations/financeCallbackForward.database.test.ts", "--test-name-pattern", mode === "missing" ? "resolves current API signature" : "finance actor cannot"];
  const proc = Bun.spawn(args, { cwd: root, env: { ...process.env, R01_FINANCE_CALLBACK_TEST_DATABASE_URL: c.url }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  await writeFile(resolve(out, "tests.stdout.log"), stdout);
  await writeFile(resolve(out, "tests.stderr.log"), stderr);
  receipt.testCommand = args; receipt.testExit = exit;
  receipt.testSummary = (stdout + stderr).split("\n").filter(s => /^ \d+ (pass|fail|skip|expect)/.test(s));
  receipt.expectedRed = exit === 1;
  receipt.catalogPreserved = before === hash(await snapshot(db));
  receipt.zeroRowsAfter = await db.unsafe(`select ${fixtureScope.map(n => `(select count(*) from ${n.includes(".") ? n : "public." + n})::text "${n}"`).join(",")}`);
  if (exit !== 1) throw Error("Expected actual RED absent");
  console.log(stdout + stderr);
} catch (e) {
  receipt.error = String(e);
} finally {
  if (c) {
    try { await c.close(); receipt.normalDrop = true; } catch (e) { receipt.normalDrop = false; receipt.error = [receipt.error, String(e)].filter(Boolean).join("; "); }
    receipt.templatePreserved = c.templatePreserved;
  }
  if (modernBefore) {
    try { receipt.modernPreserved = modernBefore === await localSourceState(modern); } catch (e) { receipt.modernPreserved = false; receipt.error = [receipt.error, String(e)].filter(Boolean).join("; "); }
  }
  for (const [p, entry] of Object.entries(bindings)) {
    const b = await readFile(resolve(root, p));
    if (sha(b) !== (entry as { rawSha256: string }).rawSha256) (receipt.failedFinalFlags as string[]).push("changedInput:" + p);
  }
  const required = ["schemaParity", "fullScannerPassed", "expectedRed", "catalogPreserved", "normalDrop", "templatePreserved", "modernPreserved"];
  for (const flag of required) if (receipt[flag] !== true) (receipt.failedFinalFlags as string[]).push(flag);
  receipt.qualifiedExpectedRed = !receipt.error && !(receipt.failedFinalFlags as string[]).length;
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ out, stage: receipt.stage, testExit: receipt.testExit, expectedRed: receipt.expectedRed, qualifiedExpectedRed: receipt.qualifiedExpectedRed, error: receipt.error, failedFinalFlags: receipt.failedFinalFlags }));
  process.exitCode = receipt.qualifiedExpectedRed ? 0 : 1;
}
