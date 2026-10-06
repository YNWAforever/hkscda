/** Separate, authorized Task 3 dependency: fix two trigger record shapes. */
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  snapshot,
  hash,
  localSourceState,
  type Catalog,
} from "./productionSchemaClone";
type Entry = Record<string, unknown>;
const preserved = (c: Catalog) => ({
  ...c,
  functions: ((c.functions ?? []) as Entry[]).map((f) =>
    f.schema === "public" && f.name === "enforce_current_animal_preference"
      ? { ...f, bodyMd5: "explicit reviewed delta" }
      : f,
  ),
});
async function run() {
  if (process.env.R01_ANIMAL_PREFERENCE_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit animal preference opt-in required");
  const mode = process.argv[2],
    green = mode?.startsWith("green"),
    modern = mode?.endsWith("modern");
  if (!["red", "green", "green-modern"].includes(mode))
    throw new Error("Use red, green or green-modern");
  const root = resolve(import.meta.dir, "../../.."),
    output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001"),
    file = basename(process.argv[3] ?? "");
  if (green && !/^\d{14}_r01_animal_preference_record_fields\.sql$/.test(file))
    throw new Error("Only focused shared trigger migration allowed");
  const paths = [
    "supabase/rls-tests/animalPreferenceCompatibility.rls.test.ts",
    "supabase/rls-tests/helpers/runR01AnimalPreferenceForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
  ];
  if (green) paths.push("supabase/migrations/" + file);
  const blobs = async () =>
      Object.fromEntries(
        await Promise.all(
          paths.map(async (p) => {
            const s = await readFile(resolve(root, p), "utf8");
            return [p, { sha256: hash(s), canonicalSha256: hash(s.replaceAll("\r\n", "\n")) }];
          }),
        ),
      ),
    frozen = await blobs();
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    testedExecutableBlobs: frozen,
    productionActions: "read-only catalog/schema; no rows or actor RPC",
    environment: green
      ? "new guarded empty clone52322; actual synthetic animals/parents/preferences rolled back"
      : "new guarded empty clone52322; no animals rows or generated expression evaluation",
  };
  const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    modernBefore = await localSourceState(modernUrl),
    capture = modern ? await captureModernLocalSchema() : await captureProductionSchema(),
    clone = await createProductionClone(capture);
  receipt.sourceCatalogHash = hash(capture.catalog);
  receipt.clone = clone.name;
  receipt.schemaParity = true;
  receipt.zeroApplicationTables = clone.tableCount;
  try {
    const db = clone.sql;
    await assertSafeFixtureTables(db, [
      "sponsorship_preference",
      "adoption_application_animal_preference",
    ]);
    const before = await snapshot(db);
    const [ledger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    const f = ((before.functions ?? []) as Entry[]).find(
      (x) => x.schema === "public" && x.name === "enforce_current_animal_preference",
    );
    if (f?.bodyMd5 !== "5d9512de7da0c787523292316c6603e7")
      throw new Error("Exact reviewed bad trigger prestate required");
    receipt.beforeFunction = f;
    if (green) {
      const text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
      if (
        /\b(?:net|cron|supabase_functions)\s*\.|\b(?:http\w*|dblink\w*|set_config|pg_notify|pg_terminate_backend|pg_cancel_backend)\s*\(/i.test(
          text,
        )
      )
        throw new Error("Out-of-scope migration primitive");
      const apply = () =>
        db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx.unsafe(text);
        });
      await apply();
      const first = await snapshot(db);
      await apply();
      if (
        hash(preserved(before)) !== hash(preserved(first)) ||
        hash(first) !== hash(await snapshot(db))
      )
        throw new Error("Unexpected catalog/config/ACL/trigger drift or replay drift");
      receipt.afterFunction = ((first.functions ?? []) as Entry[]).find(
        (x) => x.schema === "public" && x.name === "enforce_current_animal_preference",
      );
      const rejected = [];
      for (const [label, mutation] of [
        [
          "unexpected body",
          "create or replace function public.enforce_current_animal_preference() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin return new; end $$",
        ],
        [
          "public execute",
          "grant execute on function public.enforce_current_animal_preference() to public",
        ],
        [
          "wrong config",
          "alter function public.enforce_current_animal_preference() set search_path=pg_temp,public",
        ],
        [
          "disabled attachment",
          "alter table public.sponsorship_preference disable trigger enforce_current_sponsorship_animal",
        ],
        [
          "missing both attachments",
          "drop trigger enforce_current_sponsorship_animal on public.sponsorship_preference;drop trigger enforce_current_adoption_animal on public.adoption_application_animal_preference",
        ],
      ]) {
        let code = "success";
        try {
          await db.begin(async (tx) => {
            await tx.unsafe(mutation);
            await tx`set local role postgres`;
            await tx.unsafe(text);
          });
        } catch (e) {
          code = (e as { errno?: string }).errno ?? "unexpected";
        }
        const rolledBack = hash(await snapshot(db)) === hash(first);
        if (code !== "55000" || !rolledBack)
          throw new Error("Negative preflight " + label + " " + code);
        rejected.push({ case: label, sqlState: code, preserved: rolledBack });
      }
      receipt.migration = {
        file,
        sha256: hash(text),
        firstApply: 0,
        secondApply: 0,
        onlyReviewedFunctionBodyChanged: true,
        allOtherCatalogPreserved: true,
        ownerAclConfigTriggersPreserved: true,
        rejected,
      };
      await assertSafeFixtureTables(db, [
        "sponsorship_preference",
        "adoption_application_animal_preference",
      ]);
    }
    const args = [
        "bun",
        "test",
        "supabase/rls-tests/animalPreferenceCompatibility.rls.test.ts",
        "--timeout",
        "30000",
      ],
      p = Bun.spawn(args, {
        cwd: root,
        env: { ...process.env, R01_ANIMAL_PREFERENCE_TEST_DATABASE_URL: clone.url },
        stdout: "pipe",
        stderr: "pipe",
      });
    const [out, err, exit] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
        p.exited,
      ]),
      log = out + err;
    await writeFile(resolve(output, `task-3-preference-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|expect\(\) calls)\s*$/gm);
    if (!green && exit !== 0 && log.match(/Received: "42703"/g)?.length === 2)
      receipt.watchedRed = true;
    else if (!green) throw new Error("Both actual record-shape RED failures required");
    if (green && exit !== 0) throw new Error("Shared trigger DB regressions failed");
    const [after] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    if (after.hash !== ledger.hash) throw new Error("Ledger changed");
    for (const t of ["sponsorship_preference", "adoption_application_animal_preference"]) {
      const [r] = await db.unsafe(`select count(*)::int count from public.${t}`);
      if (r.count !== 0) throw new Error("Rejected preference left rows");
    }
    receipt.rowsLedgerPreserved = true;
    receipt.result = green ? "GREEN" : "watched RED";
    process.exitCode = green ? 0 : 1;
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
      resolve(output, `task-3-preference-${mode}-db.json`),
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
