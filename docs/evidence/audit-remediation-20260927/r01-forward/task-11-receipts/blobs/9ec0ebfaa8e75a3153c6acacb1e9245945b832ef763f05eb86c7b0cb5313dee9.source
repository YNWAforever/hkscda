/** Own actual catalog capture; no writes to either source or cluster roles. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { captureProductionSchema, captureModernLocalSchema, createProductionClone, assertSafeFixtureTables, snapshot, hash, localSourceState } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import { fixtureScope, dependencies, functionsQuery, authQuery, nativeQuery, indexDetailsQuery, shapesQuery } from "./task-11-profile";
import { targetDefinitions } from "./task-11-targets";
const root = resolve(import.meta.dir, "../../../.."), mode = process.argv[2], out = resolve(process.argv[3] ?? "");
if (!["hosted", "modern"].includes(mode) || process.env.R01_FINANCE_CALLBACK_ALLOW_LOCAL_FIXTURES !== "1" || !out.startsWith(resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001/task-11-capture-"))) throw Error("Exact own profile opt-in/mode/output required");
const paths = ["docs/evidence/audit-remediation-20260927/r01-forward/task-11-capture.ts", "docs/evidence/audit-remediation-20260927/r01-forward/task-11-profile.ts", "docs/evidence/audit-remediation-20260927/r01-forward/task-11-targets.ts", "docs/evidence/audit-remediation-20260927/r01-forward/task-10-profile.ts", "docs/evidence/audit-remediation-20260927/r01-forward/task-9-profile.ts", "supabase/rls-tests/helpers/productionSchemaClone.ts", ...dependencies.map(([f]) => "supabase/migrations/" + f), ...["20260925143941_guarded_provider_denial.sql", "20260925144915_guarded_provider_refund.sql", "20260926082239_atomic_receipt_void_audit.sql", "20260926083940_atomic_manual_receipt_issue_audit.sql"].map(f => "supabase/migrations/" + f)];
await mkdir(out, { recursive: true });
const bindings: Record<string, unknown> = {};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
for (const [i, p] of paths.entries()) {
  const b = await readFile(resolve(root, p));
  const proc = Bun.spawn(["git", "hash-object", "--no-filters", resolve(root, p)], { stdout: "pipe", stderr: "pipe" });
  const [blob, err, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0 || err) throw Error("Git binding failed " + p);
  bindings[p] = { rawBytes: b.length, rawSha256: sha(b), canonicalSha256: hash(b.toString().replaceAll("\r\n", "\n")), rawGitBlob: blob.trim(), archive: "s" + i + ".source" };
  await copyFile(resolve(root, p), resolve(out, "s" + i + ".source"));
}
const requiredFinalFlags = ["schemaParity", "fullScannerPassed", "dependenciesBound", "catalogPreserved", "normalDrop", "templatePreserved", "modernPreserved", "frozenInputsPreserved"];
const receipt: Record<string, unknown> = { receiptType: "capture", mode, out, at: new Date().toISOString(), sourceBase: "d45b849d300f76700efcf5450a9b426e32cc372f", sourceTree: "aeb6c4e396969a5296483ddf2525c90894bd440a", bindings, fixtureScope, dependencies, requiredFinalFlags, error: null, failedFinalFlags: [], task1Applied: false, task8Applied: false, productionApplied: false, deployed: false, operationallyEnabled: false };
let c: Awaited<ReturnType<typeof createProductionClone>> | undefined;
let modernBefore: string | undefined;
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres";
try {
  modernBefore = await localSourceState(modern);
  receipt.stage = "capture";
  const cap = mode === "hosted" ? await captureProductionSchema() : await captureModernLocalSchema();
  receipt.sourceCatalogHash = hash(cap.catalog); receipt.sourceCatalog = cap.catalog;
  c = await createProductionClone(cap); receipt.clone = c.name; receipt.schemaParity = true; receipt.zeroApplicationTables = c.tableCount;
  const db = c.sql;
  receipt.stage = "scanner";
  await assertSafeFixtureTables(db, fixtureScope); receipt.fullScannerPassed = true;
  receipt.stage = "accepted-dependency-composition";
  for (const [f, h] of dependencies) {
    const b = await readFile(resolve(root, "supabase/migrations", f));
    if (sha(b) !== h) throw Error("Accepted source dependency bytes differ " + f);
    await db.begin(async tx => { await tx`set local role postgres`; await tx.unsafe(b.toString()); });
  }
  receipt.dependenciesBound = true;
  await assertSafeFixtureTables(db, fixtureScope);
  receipt.stage = "metadata";
  const before = await snapshot(db);
  receipt.catalog = before;
  receipt.functions = await db.unsafe(functionsQuery);
  receipt.auth = (await db.unsafe(authQuery))[0].value;
  receipt.native = (await db.unsafe(nativeQuery))[0].value;
  receipt.indexes = (await db.unsafe(indexDetailsQuery))[0].value;
  receipt.shapes = (await db.unsafe(shapesQuery))[0].value;
  const rollback = new Error("Task11 tuple renderer rollback");
  const definitions = await targetDefinitions(root);
  for (const version of ["old", "next"] as const) {
    try {
      await db.begin(async tx => {
        await tx`set local role postgres`;
        for (const definition of definitions) await tx.unsafe(definition[version]);
        receipt[version + "Targets"] = (await tx.unsafe(functionsQuery)).filter(f => definitions.some(d => f.schema === "public" && f.name === d.name));
        if ((receipt[version + "Targets"] as unknown[]).length !== 5) throw Error("Exact five rendered target cardinality required");
        throw rollback;
      });
    } catch (e) { if (e !== rollback) throw e; }
  }
  receipt.catalogPreserved = hash(before) === hash(await snapshot(db));
} catch (e) { receipt.error = String(e); }
finally {
  if (c) {
    try { await c.close(); receipt.normalDrop = true; } catch (e) { receipt.normalDrop = false; receipt.error = [receipt.error, String(e)].filter(Boolean).join("; "); }
    receipt.templatePreserved = c.templatePreserved;
  }
  if (modernBefore) {
    try { receipt.modernPreserved = modernBefore === await localSourceState(modern); } catch (e) { receipt.modernPreserved = false; receipt.error = [receipt.error, String(e)].filter(Boolean).join("; "); }
  }
  receipt.frozenInputsPreserved = true;
  for (const [p, entry] of Object.entries(bindings)) if (sha(await readFile(resolve(root, p))) !== (entry as { rawSha256: string }).rawSha256) receipt.frozenInputsPreserved = false;
  receipt.failedFinalFlags = requiredFinalFlags.filter(flag => receipt[flag] !== true);
  receipt.eligible = !receipt.error && !(receipt.failedFinalFlags as string[]).length;
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ out, mode, stage: receipt.stage, eligible: receipt.eligible, error: receipt.error, failedFinalFlags: receipt.failedFinalFlags }));
  process.exitCode = receipt.eligible ? 0 : 1;
}
