/** Test-only own-scope guard: real generated expression, no migrations. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertSafeFixtureTables,
  captureModernLocalSchema,
  captureProductionSchema,
  createProductionClone,
  hash,
  localSourceState,
  snapshot,
} from "./productionSchemaClone";
async function run() {
  if (process.env.R01_CORE_SCOPE_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit core-scope fixture opt-in required");
  const mode = process.argv[2];
  if (!["hosted", "modern"].includes(mode)) throw new Error("Use hosted or modern");
  const root = resolve(import.meta.dir, "../../.."),
    output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const paths = [
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.test.ts",
    "supabase/rls-tests/helpers/runR01CoreScopeGuard.ts",
  ];
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [path, hash(await readFile(resolve(root, path), "utf8"))]),
      ),
    );
  const frozen = await blobs(),
    modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    modernBefore = await localSourceState(modernUrl);
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    testedExecutableBlobs: frozen,
    productionActions: "schema/catalog reads only; zero production rows/actor RPC",
    migrationsApplied: false,
  };
  const capture =
      mode === "modern" ? await captureModernLocalSchema() : await captureProductionSchema(),
    clone = await createProductionClone(capture);
  receipt.clone = clone.name;
  receipt.zeroApplicationTables = clone.tableCount;
  receipt.sourceCatalogHash = hash(capture.catalog);
  try {
    const db = clone.sql,
      before = await snapshot(db);
    const functions = before.functions as Record<string, unknown>[];
    const reviewed = {
      "private.normalize_public_animal_age": "1f85086f172d61fff31de8d854f32a55",
      "private.is_valid_animal_public_profile": "8dcbee84f0c4a120e7420fdf37c51af0",
      "public.set_animal_catalog_membership_defaults":
        mode === "modern" ? "fa013ae528d796d1cdee6f769d16abeb" : "16d251076045243facecbe0088b5422c",
      "public.log_animal_mutation": "264525288c36bf724df4dc72dcafba82",
    };
    for (const [name, expected] of Object.entries(reviewed))
      if (functions.find((f) => f.schema + "." + f.name === name)?.bodyMd5 !== expected)
        throw new Error("Unreviewed animal path " + name);
    receipt.manualPathMetadata = functions.filter(
      (f) =>
        Object.keys(reviewed).includes(f.schema + "." + f.name) ||
        f.schema + "." + f.name === "private.is_valid_animal_public_profile",
    );
    const [auth] = await db`select md5(pg_get_functiondef('auth.uid()'::regprocedure)) hash`;
    if (auth.hash !== "5dd851706ecb5893606782fd9e2cbf83")
      throw new Error("Unreviewed managed local Auth dependency");
    receipt.managedAuthUidHash = auth.hash;
    await assertSafeFixtureTables(db, ["animals", "audit_log"]);
    const sentinel = new Error("rollback synthetic animal");
    let generated: unknown;
    try {
      await db.begin(async (tx) => {
        await tx`set local role service_role`;
        const [r] =
          await tx`insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible) values(${randomUUID()}::uuid,'cat','Synthetic guard animal','female','2 歲','available','published',true,true) returning public_age_band`;
        generated = r.public_age_band;
        if (generated !== "adult") throw new Error("Generated age semantics changed");
        throw sentinel;
      });
    } catch (e) {
      if (e !== sentinel) throw e;
    }
    const [r] =
      await db`select (select count(*) from public.animals)::int animals,(select count(*) from public.audit_log)::int audit`;
    if (r.animals || r.audit || hash(before) !== hash(await snapshot(db)))
      throw new Error("Fixture/catalog rollback failed");
    receipt.guardPassed = true;
    receipt.actualGeneratedAge = generated;
    receipt.rowsCatalogLedgerPreserved = true;
    receipt.result = "GREEN";
  } finally {
    await clone.close();
    receipt.originalSources = {
      templateBeforeHash: clone.templateBefore,
      templatePreserved: clone.templatePreserved,
      modernBeforeHash: modernBefore,
      modernPreserved: (await localSourceState(modernUrl)) === modernBefore,
    };
    receipt.testedExecutableBlobsPreserved = hash(await blobs()) === hash(frozen);
    receipt.cleanup = "exact owned clone dropped normally; no force/session termination";
    receipt.completedAt = new Date().toISOString();
    await writeFile(
      resolve(output, `task-3-guard-${mode}-db.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  }
  if (
    !(receipt.originalSources as { modernPreserved: boolean }).modernPreserved ||
    !receipt.testedExecutableBlobsPreserved
  )
    throw new Error("Original source/executable bytes changed");
}
if (import.meta.main) await run();
