/** Task 4: hosted schema reads and an individually owned, synthetic local clone. */
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  localSourceState,
  snapshot,
  hash,
  type Catalog,
} from "./productionSchemaClone";
import {
  checkReleaseSchema,
  type CatalogSnapshot,
} from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";
import { seedInternship } from "../../../src/lib/internships/uploadIntent.testSupport";

async function run() {
  if (process.env.R01_INTERNSHIP_ALLOW_LOCAL_FIXTURES !== "1" || process.argv[2] !== "red")
    throw new Error("Explicit Task4 RED opt-in required");
  const root = resolve(import.meta.dir, "../../..");
  const output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const paths = [
    "src/lib/internships/uploadIntent.database.test.ts",
    "supabase/rls-tests/helpers/runR01InternshipForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
  ];
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => [p, hash(await readFile(resolve(root, p), "utf8"))]),
      ),
    );
  const frozen = await blobs();
  const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres";
  const modernBefore = await localSourceState(modernUrl);
  const capture = await captureProductionSchema();
  const clone = await createProductionClone(capture);
  const receipt: Record<string, unknown> = {
    mode: "red",
    startedAt: new Date().toISOString(),
    sourceCatalogHash: hash(capture.catalog),
    zeroApplicationTables: clone.tableCount,
    schemaParity: true,
    testedExecutableBlobs: frozen,
    productionActions: "schema/catalog only; no data read or actor calls",
  };
  try {
    const p = Bun.spawn(
      ["bun", "test", "src/lib/internships/uploadIntent.database.test.ts", "--timeout", "30000"],
      {
        cwd: root,
        env: { ...process.env, R01_INTERNSHIP_TEST_DATABASE_URL: clone.url },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    const log = stdout + stderr;
    await writeFile(resolve(output, "task-4-red-db.log"), log);
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (
      exit === 0 ||
      !log.includes("42P01") ||
      !log.includes("internship_attachment_upload_intent")
    )
      throw new Error("Expected actual missing-target RED absent");
    receipt.result = "watched RED: missing internship intent relation";
    process.exitCode = 1;
  } finally {
    await clone.close();
    receipt.templateBeforeHash = clone.templateBefore;
    receipt.templatePreserved = clone.templatePreserved;
    receipt.modernBeforeHash = modernBefore;
    receipt.modernPreserved = (await localSourceState(modernUrl)) === modernBefore;
    receipt.testedExecutableBlobsPreserved = hash(await blobs()) === hash(frozen);
    receipt.cleanup = "only newly owned clone normally dropped";
    receipt.completedAt = new Date().toISOString();
    await writeFile(resolve(output, "task-4-red-db.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  }
  if (
    !receipt.modernPreserved ||
    !receipt.templatePreserved ||
    !receipt.testedExecutableBlobsPreserved
  )
    throw new Error("Source or frozen inputs changed");
}
type Entry = Record<string, unknown>;
const table = "internship_attachment_upload_intent";
const fixtureTables = [
  "auth.users",
  "storage.objects",
  "storage.buckets",
  "internship_intake_version",
  "internship_intake_draft",
  "internship_intake_preview",
  "internship_application",
  "internship_attachment",
  "internship_event",
  "internship_command_result",
  "audit_log",
  "admin_user",
];
const entries = (c: Catalog, k: string) => (c[k] ?? []) as Entry[];
const target = (e: Entry) =>
  e.schema === "public" &&
  (e.table === table ||
    [table + "_pkey", table + "_cleanup_idx"].includes(String(e.table)) ||
    e.name === table ||
    e.name === "_" + table ||
    String(e.name).startsWith(table + "_") ||
    [
      "mark_internship_attachment_uploaded",
      "claim_expired_internship_attachment_uploads",
      "internship_attachment_uploaded",
    ].includes(String(e.name)));
const unaffected = (c: Catalog) =>
  Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.filter((e) => !target(e)) : v]),
  );
async function manifest(c: Catalog) {
  const tables: CatalogSnapshot["tables"] = entries(c, "relations")
    .filter((e) => e.kind === "r" || e.kind === "p")
    .map((e) => ({
      schema: String(e.schema),
      name: String(e.name),
      rls: e.rls === true,
      columns: Object.fromEntries(
        entries(c, "columns")
          .filter((x) => x.schema === e.schema && x.table === e.name)
          .map((x) => [String(x.name), String(x.type)]),
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
  const funcs: CatalogSnapshot["functions"] = entries(c, "functions").map((e) => ({
    schema: String(e.schema),
    name: String(e.name),
    arguments: String(e.args),
    returns: String(e.result),
    executeRoles: ((e.acl ?? []) as Entry[])
      .filter((a) => a.privilege === "EXECUTE")
      .map((a) => String(a.grantee)),
  }));
  return checkReleaseSchema(
    { load: async () => ({ tables, functions: funcs, migrationVersions: [] }) },
    releaseManifest,
  );
}
const dependencies = [
  [
    "20261001134252_r01_adoption_upload_forward.sql",
    "ca4879d9c93d413941ccc5a13c17d4eba1f70b293169665583e4b23973d1a5f3",
  ],
  [
    "20261001154743_r01_animal_preference_record_fields.sql",
    "28a93d8679a222f89d193af055285c24e86df06f227a7c527df26829957e9867",
  ],
  [
    "20261001150925_r01_sponsorship_submission_forward.sql",
    "ca11bb5f0ce73523c7f5734e4d032307665c2357f0fecaf15f8fc593394f857c",
  ],
];
async function runGreen() {
  if (process.env.R01_INTERNSHIP_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit Task4 fixture opt-in required");
  const mode = process.argv[2];
  if (!["green", "green-modern"].includes(mode)) throw new Error("Task4 GREEN mode required");
  const modern = mode.endsWith("modern"),
    file = basename(process.argv[3] ?? "");
  if (!/^\d{14}_r01_internship_upload_forward\.sql$/.test(file))
    throw new Error("Only Task4 migration allowed");
  const root = resolve(import.meta.dir, "../../.."),
    output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const paths = [
    "src/lib/internships/uploadIntent.database.test.ts",
    "src/lib/internships/uploadIntent.testSupport.ts",
    "src/lib/internships/attachments.server.ts",
    "src/lib/internships/uploadCleanup.server.ts",
    "src/lib/volunteers/policy/booking.repository.server.ts",
    "src/lib/donations/supabase.server.ts",
    "src/lib/admin/session.server.ts",
    "src/lib/supabase.server.ts",
    "src/lib/http/boundedFormData.server.ts",
    "src/lib/operations/releaseSchema.ts",
    "src/lib/operations/releaseManifest.ts",
    "docs/evidence/audit-remediation-20260927/migration-manifest.csv",
    ".superpowers/sdd/r01-forward-schema-plan-20261001/run-task-4-gates.py",
    "package.json",
    "bun.lock",
    "supabase/rls-tests/helpers/runR01InternshipForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-4-reviewed-paths.json",
    ...dependencies.map(([f]) => "supabase/migrations/" + f),
    "supabase/migrations/" + file,
  ];
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => {
          const t = await readFile(resolve(root, p), "utf8");
          return [p, { sha256: hash(t), canonicalSha256: hash(t.replaceAll("\r\n", "\n")) }];
        }),
      ),
    );
  const frozen = await blobs();
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    sourceCommit: (
      await new Response(
        Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
      ).text()
    ).trim(),
    testedExecutableBlobs: frozen,
    productionActions: "catalog/schema reads only; no production data or actor RPC",
    environment:
      "owned zero-data clone52322; template52322/source57322 readonly; SQL actor and inert Auth/Storage DI only",
    upstreamCiHold: "controller released after PR186 attempt2 and PR187 allfiveSUCCESS",
  };
  const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    modernBefore = await localSourceState(modernUrl);
  const capture = modern ? await captureModernLocalSchema() : await captureProductionSchema();
  receipt.sourceCatalogHash = hash(capture.catalog);
  const clone = await createProductionClone(capture);
  receipt.clone = clone.name;
  receipt.schemaParity = true;
  receipt.zeroApplicationTables = clone.tableCount;
  receipt.managedPrerequisitesHash = clone.prerequisites;
  try {
    const db = clone.sql;
    await assertSafeFixtureTables(db, fixtureTables);
    const review = JSON.parse(
      await readFile(
        resolve(
          root,
          "docs/evidence/audit-remediation-20260927/r01-forward/task-4-reviewed-paths.json",
        ),
        "utf8",
      ),
    ) as { profiles: Record<string, { name: string; hash: string }[]> };
    const reviewed = review.profiles[modern ? "modern" : "hosted"];
    for (const f of reviewed) {
      const [actual] =
        await db`select md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=${f.name}`;
      if (!actual || actual.hash !== f.hash)
        throw new Error("Unreviewed actor/managed path: " + f.name);
    }
    receipt.reviewedFunctions = reviewed;
    const rowState = async () => {
      const facts = [];
      for (const t of [...fixtureTables, "payment", "donation", "message"]) {
        const qualified = t.includes(".") ? t : "public." + t;
        const [r] = await db.unsafe(
          `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${qualified} t`,
        );
        facts.push([t, r]);
      }
      return hash(facts);
    };
    const [ledger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    const initial = await manifest(capture.catalog);
    receipt.manifestBefore = {
      requirements: releaseManifest.length,
      issues: initial.issues.length,
    };
    if (!modern && initial.issues.length !== 44)
      throw new Error("Hosted catalog issue baseline drift");
    const applied = [];
    for (const [dependency, wanted] of dependencies) {
      const text = await readFile(resolve(root, "supabase/migrations", dependency), "utf8");
      if (hash(text) !== wanted) throw new Error("Accepted dependency bytes differ");
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
      applied.push({
        file: dependency,
        sha256: wanted,
        issues: (await manifest(await snapshot(db))).issues.length,
      });
    }
    receipt.dependencies = applied;
    receipt.task1Applied = false;
    const prior = await manifest(await snapshot(db));
    receipt.manifestBeforeTask4 = {
      requirements: releaseManifest.length,
      issues: prior.issues.length,
    };
    if (!modern && prior.issues.length !== 33)
      throw new Error("Dependencies must leave33 gaps before Task4");
    await seedInternship(db);
    const before = await snapshot(db),
      facts = await rowState(),
      text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
    if (
      /\b(?:ALTER\s+(?:ROLE|DATABASE|SYSTEM|DEFAULT)|DROP\s+(?:SCHEMA|TABLE)|net\.|http_|dblink|cron\.)/i.test(
        text,
      )
    )
      throw new Error("Out-of-scope Task4 migration");
    const apply = () =>
      db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
    await apply();
    const first = await snapshot(db);
    if (hash(unaffected(before)) !== hash(unaffected(first)))
      throw new Error("Unrelated catalog changed");
    if (modern && hash(before) !== hash(first))
      throw new Error("Existing modern good objects changed");
    await db.unsafe(
      "create temporary table internship_attachment_upload_intent(marker text);insert into pg_temp.internship_attachment_upload_intent values('synthetic shadow');set search_path=pg_temp,public",
    );
    await apply();
    if (hash(await snapshot(db)) !== hash(first) || (await rowState()) !== facts)
      throw new Error("Replay catalog/data drift");
    if (
      (await db.unsafe("select marker from pg_temp.internship_attachment_upload_intent"))[0]
        .marker !== "synthetic shadow"
    )
      throw new Error("Temp shadow changed");
    await db.unsafe("drop table pg_temp.internship_attachment_upload_intent;set search_path=''");
    const profile = async () =>
      db`select relkind,relpersistence,relhasrules,(select count(*)::int from pg_rewrite where ev_class=c.oid) rules from pg_class c where oid='public.internship_attachment_upload_intent'::regclass`;
    const firstProfile = hash(await profile());
    const rejected = [];
    const accepted = new Error("unexpected acceptance rollback");
    for (const [label, mutation] of [
      ["client grant", "grant select on public.internship_attachment_upload_intent to anon"],
      [
        "client column grant",
        "grant select(storage_path) on public.internship_attachment_upload_intent to authenticated",
      ],
      [
        "owner ACL drift",
        "revoke select on public.internship_attachment_upload_intent from postgres",
      ],
      [
        "service grant option",
        "grant update on public.internship_attachment_upload_intent to service_role with grant option",
      ],
      [
        "missing service right",
        "revoke delete on public.internship_attachment_upload_intent from service_role",
      ],
      [
        "disabled RLS",
        "alter table public.internship_attachment_upload_intent disable row level security",
      ],
      [
        "unexpected policy",
        "create policy r01_unknown on public.internship_attachment_upload_intent using(true)",
      ],
      [
        "wrong default",
        "alter table public.internship_attachment_upload_intent alter column created_at set default now()",
      ],
      [
        "wrong index",
        "drop index public.internship_attachment_upload_intent_cleanup_idx;create index internship_attachment_upload_intent_cleanup_idx on public.internship_attachment_upload_intent(expires_at)",
      ],
      [
        "disabled trigger",
        "alter table public.internship_attachment disable trigger internship_attachment_uploaded",
      ],
      [
        "wrong trigger args",
        "drop trigger internship_attachment_uploaded on public.internship_attachment;create trigger internship_attachment_uploaded after insert on public.internship_attachment for each row execute function public.mark_internship_attachment_uploaded('unexpected')",
      ],
      [
        "wrong function body",
        "create or replace function public.mark_internship_attachment_uploaded() returns trigger language plpgsql set search_path='' as $$ begin return new; end $$",
      ],
      [
        "definer drift",
        "alter function public.mark_internship_attachment_uploaded() security definer",
      ],
      [
        "config drift",
        "alter function public.claim_expired_internship_attachment_uploads(timestamptz,integer) set search_path=public,pg_temp",
      ],
      [
        "public execute",
        "grant execute on function public.claim_expired_internship_attachment_uploads(timestamptz,integer) to public",
      ],
      [
        "unexpected overload",
        "create function public.claim_expired_internship_attachment_uploads(text) returns text language sql as $$ select $1 $$",
      ],
      [
        "insert rewrite rule",
        "create rule r01_suppress_intent as on insert to public.internship_attachment_upload_intent do instead nothing",
      ],
      ["unlogged relation", "alter table public.internship_attachment_upload_intent set unlogged"],
    ]) {
      let code = "success";
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(mutation);
          await tx`set local role postgres`;
          await tx.unsafe(text);
          throw accepted;
        });
      } catch (e) {
        code = e === accepted ? "success" : ((e as { errno?: string }).errno ?? "unexpected");
      }
      const preserved =
        hash(await snapshot(db)) === hash(first) &&
        hash(await profile()) === firstProfile &&
        (await rowState()) === facts;
      rejected.push({ case: label, sqlState: code, preserved });
      if (code !== "55000" || !preserved) {
        receipt.preflightResults = rejected;
        throw new Error("Unknown-profile refusal failed: " + label + " " + code);
      }
    }
    receipt.preflightResults = rejected;
    const final = await manifest(first);
    receipt.manifestAfter = { requirements: releaseManifest.length, issues: final.issues.length };
    if (!modern && final.issues.length !== 30)
      throw new Error("Expected scoped cumulative gaps44->30");
    receipt.migration = {
      file,
      sha256: hash(text),
      firstApply: 0,
      secondApply: 0,
      unrelatedCatalogPreserved: true,
      modernAllCatalogPreserved: modern,
      preexistingRowsPreserved: true,
      tempShadowPreserved: true,
      relationProfileHash: firstProfile,
    };
    await assertSafeFixtureTables(db, [...fixtureTables, table]);
    const args = [
      "bun",
      "test",
      "src/lib/internships/uploadIntent.database.test.ts",
      "--timeout",
      "30000",
    ];
    const p = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, R01_INTERNSHIP_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    const log = stdout + stderr;
    await writeFile(resolve(output, `task-4-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (exit !== 0) throw new Error("Task4 actual DB/service tests failed");
    const [afterLedger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    if (afterLedger.hash !== ledger.hash) throw new Error("Synthetic ledger changed");
    receipt.ledgerPreserved = true;
    if ((await rowState()) !== facts) throw new Error("Tests changed preexisting facts");
    receipt.preexistingSyntheticFactsPreservedAfterTests = true;
    receipt.result = "GREEN";
  } finally {
    await clone.close();
    receipt.originalSources = {
      templateBeforeHash: clone.templateBefore,
      templatePreserved: clone.templatePreserved,
      modernBeforeHash: modernBefore,
      modernPreserved: (await localSourceState(modernUrl)) === modernBefore,
    };
    receipt.cleanup = "only exact owned clone normally dropped; no force/session termination";
    receipt.completedAt = new Date().toISOString();
    receipt.testedExecutableBlobsPreserved = hash(await blobs()) === hash(frozen);
    await writeFile(
      resolve(output, `task-4-${mode}-db.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  }
  if (
    !(receipt.originalSources as { modernPreserved: boolean }).modernPreserved ||
    !receipt.testedExecutableBlobsPreserved
  )
    throw new Error("Original source or frozen input drift");
}
if (import.meta.main) {
  if (process.argv[2] === "red") await run();
  else await runGreen();
}
