/** Explicit Task 2 runner: schema reads and newly owned, empty local clones only. */
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
import {
  checkReleaseSchema,
  type CatalogSnapshot,
} from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";

type Entry = Record<string, unknown>;
const entries = (catalog: Catalog, facet: string) => (catalog[facet] ?? []) as Entry[];
const intentRelations = [
  "adoption_upload_intent",
  "adoption_upload_intent_pkey",
  "adoption_upload_intent_status_token_hash_key",
  "adoption_upload_intent_cleanup_idx",
];
const targetRelation = (e: Entry) =>
  e.schema === "public" && intentRelations.includes(String(e.name));
function unaffected(catalog: Catalog): unknown {
  return Object.fromEntries(
    Object.entries(catalog).map(([facet, value]) => [
      facet,
      Array.isArray(value)
        ? value.filter(
            (e: Entry) =>
              !(
                targetRelation(e) ||
                (e.schema === "public" &&
                  (intentRelations.includes(String(e.table)) ||
                    e.name === "_adoption_upload_intent" ||
                    (facet === "functions" && e.name === "cleanup_expired_adoption_application") ||
                    (facet === "columns" &&
                      e.table === "public_status_token" &&
                      e.name === "submission_fingerprint") ||
                    (facet === "constraints" &&
                      e.table === "public_status_token" &&
                      e.name === "public_status_token_submission_fingerprint_format")))
              ),
          )
        : value,
    ]),
  );
}
async function manifest(catalog: Catalog) {
  const tables: CatalogSnapshot["tables"] = entries(catalog, "relations")
    .filter((e) => e.kind === "r" || e.kind === "p")
    .map((e) => ({
      schema: String(e.schema),
      name: String(e.name),
      rls: e.rls === true,
      columns: Object.fromEntries(
        entries(catalog, "columns")
          .filter((c) => c.schema === e.schema && c.table === e.name)
          .map((c) => [String(c.name), String(c.type)]),
      ),
      grants: Object.fromEntries(
        ["anon", "authenticated", "service_role"].map((role) => [
          role,
          ((e.acl ?? []) as Entry[])
            .filter((a) => a.grantee === role)
            .map((a) => String(a.privilege)),
        ]),
      ),
    }));
  const functions: CatalogSnapshot["functions"] = entries(catalog, "functions").map((e) => ({
    schema: String(e.schema),
    name: String(e.name),
    arguments: String(e.args),
    returns: String(e.result),
    executeRoles: ((e.acl ?? []) as Entry[])
      .filter((a) => a.privilege === "EXECUTE")
      .map((a) => String(a.grantee)),
  }));
  return checkReleaseSchema(
    { load: async () => ({ tables, functions, migrationVersions: [] }) },
    releaseManifest,
  );
}

async function run() {
  if (process.env.R01_ADOPTION_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit Task 2 fixture opt-in required");
  const mode = process.argv[2];
  if (!["red", "green", "green-modern"].includes(mode))
    throw new Error("Use red, green or green-modern");
  const modern = mode.endsWith("modern"),
    green = mode.startsWith("green");
  const root = resolve(import.meta.dir, "../../..");
  const output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const testedPaths = [
    "src/lib/publicAdoption/uploadIntent.database.test.ts",
    "supabase/rls-tests/helpers/runR01AdoptionForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
  ];
  if (green) testedPaths.push("supabase/migrations/" + basename(process.argv[3] ?? ""));
  const sourceBlobs = async () =>
    Object.fromEntries(
      await Promise.all(
        testedPaths.map(async (path) => {
          const text = await readFile(resolve(root, path), "utf8");
          return [
            path,
            { sha256: hash(text), canonicalSha256: hash(text.replaceAll("\r\n", "\n")) },
          ];
        }),
      ),
    );
  const testedBlobs = await sourceBlobs();
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    productionActions: "schema/catalog reads only; zero production rows/mutations/RPC invocations",
    environment:
      "new guarded empty clone at52322; managed synthetic Auth/Storage retained; no Storage calls",
  };
  receipt.testedExecutableBlobs = testedBlobs;
  const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres";
  const modernBefore = await localSourceState(modernUrl);
  const capture = modern ? await captureModernLocalSchema() : await captureProductionSchema();
  receipt.sourceCatalogHash = hash(capture.catalog);
  receipt.counts = Object.fromEntries(
    Object.entries(capture.catalog).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
  );
  const clone = await createProductionClone(capture);
  Object.assign(receipt, {
    clone: clone.name,
    schemaParity: true,
    zeroApplicationTables: clone.tableCount,
    managedPrerequisitesHash: clone.prerequisites,
  });
  try {
    const db = clone.sql;
    const reviewedTables = [
      "adoption_applications",
      "adoption_case",
      "public_status_token",
      "adoption_application_detail",
      "adoption_application_photo",
      "adoption_application_animal_preference",
      "adoption_application_visit_preference",
      "adoption_intake_item",
      "coordinator_status",
      "audit_log",
    ];
    await assertSafeFixtureTables(db, reviewedTables);
    // Complete source call-path review is bound to exact known trigger hashes.
    const reviewedFunctions: Record<string, string> = {
      "public.log_animal_mutation": "264525288c36bf724df4dc72dcafba82",
      "public.set_updated_at": "4d6804d5850641a33867814c9e76a714",
      "private.bump_adoption_case_bulk_row_version": "4360bcbf3bdaa28be558e276bf60ea6c",
      "public.enforce_current_animal_preference": "5d9512de7da0c787523292316c6603e7",
    };
    const triggerPaths = await db.unsafe(
      "select distinct n.nspname||'.'||p.proname name,md5(pg_get_functiondef(p.oid)) hash from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where not t.tgisinternal and c.relnamespace='public'::regnamespace and c.relname in (" +
        reviewedTables.map((t) => "'" + t + "'").join(",") +
        ")",
    );
    for (const t of triggerPaths)
      if (reviewedFunctions[t.name] !== t.hash)
        throw new Error("Unreviewed actual fixture trigger body; no invocation: " + t.name);
    const fkPaths =
      await db`select conrelid::regclass::text child,confdeltype from pg_constraint where contype='f' and confrelid='public.adoption_applications'::regclass`;
    for (const f of fkPaths)
      if (!reviewedTables.includes(String(f.child).replace(/^public\./, "")))
        throw new Error("Unreviewed parent FK child");
    receipt.reviewedTriggerPaths = triggerPaths.map((t: { name: string; hash: string }) => ({
      ...t,
      catalog: entries(capture.catalog, "functions").find(
        (f) => f.schema + "." + f.name === t.name,
      ),
    }));
    receipt.reviewedFkChildren = fkPaths;
    const legacyId = randomUUID();
    await db`insert into public.public_status_token(id,token_hash,entity_type,entity_id,expires_at) values(${legacyId}::uuid,${hash(legacyId)},'adoption_application',${randomUUID()}::uuid,clock_timestamp()+interval '1 day')`;
    const facts = async () => {
      const [r] =
        await db`select to_jsonb(t)-'submission_fingerprint' facts from public.public_status_token t where id=${legacyId}::uuid`;
      const [ledger] =
        await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
      return hash([r.facts, ledger.hash]);
    };
    const before = await snapshot(db),
      beforeFacts = await facts();
    const initial = await manifest(before);
    receipt.manifestBefore = {
      requirements: releaseManifest.length,
      issues: initial.issues.length,
    };
    if (!modern && initial.issues.length !== 44)
      throw new Error("Hosted baseline is no longer 44; review drift");
    if (green) {
      const file = basename(process.argv[3] ?? "");
      if (!/^\d{14}_r01_adoption_upload_forward\.sql$/.test(file))
        throw new Error("Only Task 2 focused migration allowed");
      const text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
      if (
        /\b(?:ALTER\s+(?:ROLE|DATABASE|SYSTEM|DEFAULT)|DROP\s+(?:SCHEMA|TABLE)|net\.|http_|dblink|cron\.)/i.test(
          text,
        )
      )
        throw new Error("Out-of-scope migration primitive");
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
      const first = await snapshot(db);
      if (hash(unaffected(before)) !== hash(unaffected(first))) {
        const old = unaffected(before) as Record<string, unknown>;
        const next = unaffected(first) as Record<string, unknown>;
        const facets = Object.keys(old).filter((key) => hash(old[key]) !== hash(next[key]));
        receipt.unexpectedDrift = facets.map((key) => ({
          facet: key,
          added: ((next[key] ?? []) as Entry[])
            .filter((e) => !((old[key] ?? []) as Entry[]).some((p) => hash(e) === hash(p)))
            .map((e) => ({ schema: e.schema, name: e.name, table: e.table, hash: hash(e) })),
          removed: ((old[key] ?? []) as Entry[])
            .filter((e) => !((next[key] ?? []) as Entry[]).some((p) => hash(e) === hash(p)))
            .map((e) => ({ schema: e.schema, name: e.name, table: e.table, hash: hash(e) })),
        }));
        throw new Error("Unrelated catalog drift: " + facets.join(","));
      }
      if (modern && hash(before) !== hash(first))
        throw new Error("Modern existing good definitions changed");
      const firstFacts = await facts();
      await db.unsafe(
        "create temporary table adoption_upload_intent(application_id uuid,marker text);insert into pg_temp.adoption_upload_intent values(null,'synthetic shadow');set search_path=pg_temp,public",
      );
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
      if (
        hash(await snapshot(db)) !== hash(first) ||
        (await facts()) !== firstFacts ||
        firstFacts !== beforeFacts
      )
        throw new Error("Second-apply catalog/row/ledger drift");
      const [shadow] = await db.unsafe("select marker from pg_temp.adoption_upload_intent");
      if (shadow.marker !== "synthetic shadow") throw new Error("Temporary shadow was touched");
      await db.unsafe("drop table pg_temp.adoption_upload_intent;set search_path=''");
      const negatives = [
        [
          "wrong-fingerprint-type",
          "alter table public.public_status_token drop constraint public_status_token_submission_fingerprint_format;alter table public.public_status_token alter column submission_fingerprint type integer using null",
          "55000",
        ],
        [
          "wrong-fingerprint-check",
          "alter table public.public_status_token drop constraint public_status_token_submission_fingerprint_format;alter table public.public_status_token add constraint public_status_token_submission_fingerprint_format check(true)",
          "55000",
        ],
        [
          "wrong-intent-index",
          "drop index public.adoption_upload_intent_cleanup_idx;create index adoption_upload_intent_cleanup_idx on public.adoption_upload_intent(expires_at)",
          "55000",
        ],
        [
          "public-cleanup-execute",
          "grant execute on function public.cleanup_expired_adoption_application(uuid) to public",
          "55000",
        ],
        [
          "extra-client-intent-grantee",
          "grant select on public.adoption_upload_intent to anon",
          "55000",
        ],
        [
          "intent-service-grant-option",
          "grant select on public.adoption_upload_intent to service_role with grant option",
          "55000",
        ],
        [
          "incomplete-intent-privilege-profile",
          "revoke update on public.adoption_upload_intent from service_role",
          "55000",
        ],
      ];
      const rejected = [];
      for (const [label, mutation, wanted] of negatives) {
        let code = "success";
        try {
          await db.begin(async (tx) => {
            await tx.unsafe(mutation);
            await tx`set local role postgres`;
            await tx.unsafe(text);
          });
        } catch (error) {
          code = (error as { errno?: string }).errno ?? "unexpected";
        }
        const preserved =
          hash(await snapshot(db)) === hash(first) && (await facts()) === beforeFacts;
        if (code !== wanted || !preserved)
          throw new Error("Negative preflight failure " + label + " " + code);
        rejected.push({ case: label, sqlState: code, preserved });
      }
      await assertSafeFixtureTables(db, [...reviewedTables, "adoption_upload_intent"]);
      const final = await manifest(first);
      if (!modern && final.issues.length !== 41)
        throw new Error("Expected isolated 44 to 41 requirements gap reduction");
      receipt.manifestAfter = { requirements: releaseManifest.length, issues: final.issues.length };
      receipt.migration = {
        file,
        sha256: hash(text),
        canonicalSha256: hash(text.replaceAll("\r\n", "\n")),
        firstApply: 0,
        secondApply: 0,
        metadataPreserved: true,
        legacyRowsLedgerPreserved: true,
        tempShadowPreserved: true,
        modernAllCatalogPreserved: modern,
        rejected,
      };
    }
    const args = [
      "bun",
      "test",
      "src/lib/publicAdoption/uploadIntent.database.test.ts",
      "--timeout",
      "30000",
    ];
    if (!green) args.push("--test-name-pattern", "current caller");
    const p = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, R01_ADOPTION_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    const log = stdout + stderr;
    await writeFile(resolve(output, `task-2-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (!green && exit !== 0 && log.includes("42P01")) receipt.watchedRed = true;
    else if (!green) throw new Error("Expected missing-relation RED was not observed");
    if (green && exit !== 0) throw new Error("Focused DB regressions failed");
    if ((await facts()) !== beforeFacts) throw new Error("Tests changed legacy rows/ledger");
    receipt.result = green ? "GREEN" : "watched RED";
    process.exitCode = green ? 0 : 1;
  } finally {
    await clone.close();
    const modernPreserved = (await localSourceState(modernUrl)) === modernBefore;
    receipt.originalSources = {
      templateBeforeHash: clone.templateBefore,
      templatePreserved: clone.templatePreserved,
      modernBeforeHash: modernBefore,
      modernPreserved,
    };
    receipt.cleanup = "exact owned clone dropped normally; no FORCE/session termination";
    receipt.completedAt = new Date().toISOString();
    receipt.testedExecutableBlobsPreserved = hash(await sourceBlobs()) === hash(testedBlobs);
    await writeFile(
      resolve(output, `task-2-${mode}-db.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  }
  if (!(receipt.originalSources as { modernPreserved: boolean }).modernPreserved)
    throw new Error("Original modern synthetic source changed");
  if (!receipt.testedExecutableBlobsPreserved)
    throw new Error("Executable source changed during rehearsal");
}
if (import.meta.main) await run();
