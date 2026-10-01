/** Task 5: hosted schema reads and an individually owned, synthetic local clone. */
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
import { seedAnimal } from "../../../src/lib/animals/draftIntent.testSupport";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";

async function run() {
  if (
    process.env.R01_ANIMAL_DRAFT_ALLOW_LOCAL_FIXTURES !== "1" ||
    !["red", "red-actor"].includes(process.argv[2])
  )
    throw new Error("Explicit Task5 RED opt-in required");
  const root = resolve(import.meta.dir, "../../..");
  const output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const paths = [
    "src/lib/animals/draftIntent.database.test.ts",
    "src/lib/animals/draftIntent.testSupport.ts",
    "supabase/rls-tests/helpers/runR01AnimalDraftForward.ts",
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
  const actorRed = process.argv[2] === "red-actor";
  const capture = actorRed ? await captureModernLocalSchema() : await captureProductionSchema();
  const clone = await createProductionClone(capture);
  const receipt: Record<string, unknown> = {
    mode: process.argv[2],
    startedAt: new Date().toISOString(),
    sourceCatalogHash: hash(capture.catalog),
    archiveProfile: (capture.catalog.functions as Record<string, unknown>[]).filter(
      (f) => f.name === "set_animal_archived_with_audit",
    ),
    zeroApplicationTables: clone.tableCount,
    schemaParity: true,
    testedExecutableBlobs: frozen,
    productionActions: "schema/catalog only; no data read or actor calls",
  };
  try {
    const p = Bun.spawn(
      [
        "bun",
        "test",
        "src/lib/animals/draftIntent.database.test.ts",
        "--timeout",
        "30000",
        ...(actorRed
          ? ["--test-name-pattern", "archive rejects"]
          : ["--test-name-pattern", "missing-target"]),
      ],
      {
        cwd: root,
        env: { ...process.env, R01_ANIMAL_DRAFT_TEST_DATABASE_URL: clone.url },
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
    await writeFile(resolve(output, `task-5-${process.argv[2]}-db.log`), log);
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (
      exit === 0 ||
      !(actorRed
        ? log.includes('Expected: "42501"')
        : log.includes("42P01") && log.includes("animal_draft_image_upload_intent"))
    )
      throw new Error("Expected actual Task5 RED absent");
    receipt.result = actorRed
      ? "watched RED: known legacy archive accepts unauthorized actor"
      : "watched RED: missing animal draft intent relation";
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
    await writeFile(
      resolve(output, `task-5-${process.argv[2]}-db.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
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
const table = "animal_draft_image_upload_intent";
const fixtureTables = [
  "auth.users",
  "admin_user",
  "animals",
  "animal_draft",
  "animal_profile_internal",
  "animal_match",
  "sponsorship_preference",
  "adoption_followup",
  "adoption_application_animal_preference",
  "supporter",
  "sponsorship_pledge",
  "supporter_consent_intent",
  "coordinator_status",
  "adoption_applications",
  "adoption_case",
  "audit_log",
];
const entries = (c: Catalog, k: string) => (c[k] ?? []) as Entry[];
const target = (e: Entry) =>
  (e.schema === "public" &&
    (e.table === table ||
      [table + "_pkey", "animal_draft_image_upload_cleanup_idx"].includes(String(e.table)) ||
      e.name === table ||
      e.name === "_" + table ||
      String(e.name).startsWith("animal_draft_image_upload_") ||
      [
        "reserve_animal_draft_image_upload",
        "mark_animal_draft_image_attached",
        "claim_expired_animal_draft_image_uploads",
        "set_animal_archived_with_audit",
        "animal_draft_image_attached",
      ].includes(String(e.name)))) ||
  (e.schema === "private" && e.name === "require_animal_archive_actor");
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
  [
    "20261001175310_r01_internship_upload_forward.sql",
    "e64124a1a1d0609b77dae4f41ff82d9166fd857f5d22a6934d761af8f80d4f41",
  ],
];
async function runGreen() {
  if (process.env.R01_ANIMAL_DRAFT_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit Task5 fixture opt-in required");
  const mode = process.argv[2];
  if (!["green", "green-modern"].includes(mode)) throw new Error("Task5 GREEN mode required");
  const modern = mode.includes("modern"),
    file = basename(process.argv[3] ?? "");
  if (!/^\d{14}_r01_animal_draft_archive_forward\.sql$/.test(file))
    throw new Error("Only Task5 migration allowed");
  const root = resolve(import.meta.dir, "../../.."),
    output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const paths = [
    "src/lib/animals/draftIntent.database.test.ts",
    "src/lib/animals/draftIntent.testSupport.ts",
    "src/lib/animals/draftUpload.server.ts",
    "src/lib/animals/draftUploadCleanup.server.ts",
    "src/lib/animals/photoUpload.http.server.ts",
    "src/lib/animals/photoUpload.ts",
    "src/lib/admin/session.server.ts",
    "src/lib/donations/supabase.server.ts",
    "src/lib/supabase.server.ts",
    "src/lib/http/publicJson.server.ts",
    "src/lib/operations/releaseSchema.ts",
    "src/lib/operations/releaseManifest.ts",
    "docs/evidence/audit-remediation-20260927/migration-manifest.csv",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-5-gates.py",
    "package.json",
    "bun.lock",
    "supabase/rls-tests/helpers/runR01AnimalDraftForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-5-reviewed-paths.json",
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
    upstreamCiHold: "controller released PR188 exact490 CI36913123561 attempt1 allfiveSUCCESS",
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
          "docs/evidence/audit-remediation-20260927/r01-forward/task-5-reviewed-paths.json",
        ),
        "utf8",
      ),
    ) as { profiles: Record<string, { name: string; hash: string }[]> };
    const reviewed = review.profiles[modern ? "modern" : "hosted"];
    for (const f of reviewed) {
      const [actual] =
        await db`select md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=${f.name}`;
      if (!actual || actual.hash !== f.hash) throw new Error("Unreviewed fixture path: " + f.name);
    }
    receipt.reviewedFunctions = reviewed;
    const [authProfile] =
      await db`select has_table_privilege('service_role','auth.users','SELECT') serviceSelect,has_table_privilege('service_role','auth.users','UPDATE') serviceUpdate,relacl::text acl from pg_class where oid='auth.users'::regclass`;
    if (authProfile.serviceselect !== false || authProfile.serviceupdate !== false)
      throw new Error(
        "Managed Auth privilege profile differs from hosted; calibration not authorized",
      );
    receipt.authPrivilegeProfile = authProfile;
    let preservedTables: string[] | undefined;
    const rowState = async () => {
      const facts = [];
      const allTables =
        await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') order by 1`;
      preservedTables ??= allTables.map((r: { name: string }) => r.name);
      for (const t of preservedTables!) {
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
    receipt.manifestBeforeTask5 = {
      requirements: releaseManifest.length,
      issues: prior.issues.length,
    };
    if (!modern && prior.issues.length !== 30)
      throw new Error("Dependencies must leave30 gaps before Task5");
    await seedAnimal(db);
    const before = await snapshot(db),
      facts = await rowState(),
      text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
    if (
      /\b(?:ALTER\s+(?:ROLE|DATABASE|SYSTEM|DEFAULT)|DROP\s+(?:SCHEMA|TABLE)|net\.|http_|dblink|cron\.)/i.test(
        text,
      )
    )
      throw new Error("Out-of-scope Task5 migration");
    const apply = () =>
      db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
    // Direct pg_trigger/pg_depend rows are needed: the shared public snapshot
    // intentionally omits internal RI enforcement and referenced-side actions.
    const foreignKeyProfile = async () =>
      db`select c.conname,to_jsonb(t) trigger,(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid) dependencies from pg_constraint c join pg_trigger t on t.tgconstraint=c.oid where c.conrelid='public.animal_draft'::regclass and c.contype='f' order by c.conname,t.tgname`;
    const beforeForeignKeys = hash(await foreignKeyProfile());
    await apply();
    const first = await snapshot(db);
    const firstForeignKeys = await foreignKeyProfile();
    if (firstForeignKeys.length !== 8 || hash(firstForeignKeys) !== beforeForeignKeys)
      throw new Error("Target FK trigger profile changed");
    receipt.foreignKeyTriggers = firstForeignKeys;
    if (hash(unaffected(before)) !== hash(unaffected(first)))
      throw new Error("Unrelated catalog changed");
    if (modern) {
      const keep = (c: Catalog) =>
        Object.fromEntries(
          Object.entries(c).map(([k, v]) => [
            k,
            Array.isArray(v)
              ? v.filter(
                  (e) =>
                    !(
                      k === "functions" &&
                      ["require_animal_archive_actor", "set_animal_archived_with_audit"].includes(
                        String(e.name),
                      )
                    ),
                )
              : v,
          ]),
        );
      if (hash(keep(before)) !== hash(keep(first)))
        throw new Error("Existing good modern media or unrelated objects changed");
      receipt.modernKnownArchiveBodyDelta = true;
    }
    await db.unsafe(
      "create temporary table animal_draft_image_upload_intent(marker text);insert into pg_temp.animal_draft_image_upload_intent values('synthetic shadow');set search_path=pg_temp,public",
    );
    await apply();
    if (hash(await snapshot(db)) !== hash(first) || (await rowState()) !== facts)
      throw new Error("Replay catalog/data drift");
    if (
      (await db.unsafe("select marker from pg_temp.animal_draft_image_upload_intent"))[0].marker !==
      "synthetic shadow"
    )
      throw new Error("Temp shadow changed");
    await db.unsafe("drop table pg_temp.animal_draft_image_upload_intent;set search_path=''");
    const profile = async () => ({
      relation:
        await db`select relkind,relpersistence,relhasrules,(select count(*)::int from pg_rewrite where ev_class=c.oid) rules from pg_class c where oid='public.animal_draft_image_upload_intent'::regclass`,
      foreignKeyTriggers: await foreignKeyProfile(),
      intentRows:
        await db`select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from public.animal_draft_image_upload_intent t`,
    });
    const firstProfile = hash(await profile());
    if (hash(await foreignKeyProfile()) !== hash(firstForeignKeys))
      throw new Error("Replay changed target FK triggers");
    const disabledForeignKeys = firstForeignKeys
      .filter((row: { trigger: { tgtype: number } }) => [5, 9].includes(row.trigger.tgtype))
      .map(
        (row: {
          conname: string;
          trigger: { tgname: string; tgtype: number; tgrelid: number };
        }) => [
          `disabled ${row.conname} ${row.trigger.tgtype === 5 ? "intent check" : "referenced action"}`,
          `do $drift$ declare t record; begin select tgrelid,tgname into strict t from pg_catalog.pg_trigger where tgconstraint=(select oid from pg_catalog.pg_constraint where conrelid='public.animal_draft'::regclass and conname='${row.conname}') and tgtype=${row.trigger.tgtype}; execute pg_catalog.format('alter table %s disable trigger %I',t.tgrelid::regclass,t.tgname); end $drift$`,
        ],
      );
    const rejected = [];
    const accepted = new Error("unexpected acceptance rollback");
    for (const [label, mutation] of [
      ["client grant", "grant select on public.animal_draft_image_upload_intent to anon"],
      [
        "client column grant",
        "grant select(storage_path) on public.animal_draft_image_upload_intent to authenticated",
      ],
      ["owner ACL drift", "revoke select on public.animal_draft_image_upload_intent from postgres"],
      [
        "service grant option",
        "grant update on public.animal_draft_image_upload_intent to service_role with grant option",
      ],
      [
        "missing service right",
        "revoke delete on public.animal_draft_image_upload_intent from service_role",
      ],
      [
        "disabled RLS",
        "alter table public.animal_draft_image_upload_intent disable row level security",
      ],
      [
        "unexpected policy",
        "create policy r01_unknown on public.animal_draft_image_upload_intent using(true)",
      ],
      [
        "wrong default",
        "alter table public.animal_draft_image_upload_intent alter column created_at set default now()",
      ],
      [
        "wrong index",
        "drop index public.animal_draft_image_upload_cleanup_idx;create index animal_draft_image_upload_cleanup_idx on public.animal_draft_image_upload_intent(expires_at)",
      ],
      [
        "disabled trigger",
        "alter table public.animal_draft disable trigger animal_draft_image_attached",
      ],
      [
        "wrong trigger args",
        "drop trigger animal_draft_image_attached on public.animal_draft;create trigger animal_draft_image_attached after insert on public.animal_draft for each row execute function public.mark_animal_draft_image_attached('unexpected')",
      ],
      [
        "wrong function body",
        "create or replace function public.mark_animal_draft_image_attached() returns trigger language plpgsql set search_path='' as $$ begin return new; end $$",
      ],
      [
        "definer drift",
        "alter function public.mark_animal_draft_image_attached() security definer",
      ],
      [
        "config drift",
        "alter function public.claim_expired_animal_draft_image_uploads(timestamptz,integer) set search_path=public,pg_temp",
      ],
      [
        "public execute",
        "grant execute on function public.claim_expired_animal_draft_image_uploads(timestamptz,integer) to public",
      ],
      [
        "unexpected overload",
        "create function public.claim_expired_animal_draft_image_uploads(text) returns text language sql as $$ select $1 $$",
      ],
      [
        "insert rewrite rule",
        "create rule r01_suppress_intent as on insert to public.animal_draft_image_upload_intent do instead nothing",
      ],
      ["unlogged relation", "alter table public.animal_draft_image_upload_intent set unlogged"],
      [
        "wrong column type",
        "alter table public.animal_draft_image_upload_intent alter column expires_at type timestamp without time zone using expires_at at time zone 'UTC'",
      ],
      [
        "wrong collation",
        'alter table public.animal_draft_image_upload_intent alter column storage_path type text collate pg_catalog."C"',
      ],
      [
        "extra FK",
        "alter table public.animal_draft_image_upload_intent add constraint r01_unknown_fk foreign key(animal_id) references public.animals(id)",
      ],
      [
        "not validated constraint",
        "alter table public.animal_draft_image_upload_intent drop constraint animal_draft_image_upload_expiry;alter table public.animal_draft_image_upload_intent add constraint animal_draft_image_upload_expiry check(expires_at>created_at) not valid",
      ],
      ["wrong owner", "alter table public.animal_draft_image_upload_intent owner to service_role"],
      [
        "forced RLS",
        "alter table public.animal_draft_image_upload_intent force row level security",
      ],
      [
        "unknown archive body",
        "create or replace function public.set_animal_archived_with_audit(p_actor_user_id uuid,p_animal_id uuid,p_archived boolean) returns jsonb language plpgsql security invoker set search_path='' as $$begin return '{}'::jsonb;end$$",
      ],
      [
        "helper client execute",
        "grant execute on function private.require_animal_archive_actor(uuid) to authenticated",
      ],
      [
        "helper grant option",
        "grant execute on function private.require_animal_archive_actor(uuid) to service_role with grant option",
      ],
      [
        "helper wrong owner",
        "alter function private.require_animal_archive_actor(uuid) owner to service_role",
      ],
      [
        "helper invoker drift",
        "alter function private.require_animal_archive_actor(uuid) security invoker",
      ],
      [
        "helper wrong config",
        "alter function private.require_animal_archive_actor(uuid) set search_path=public,pg_temp",
      ],
      [
        "helper wrong body",
        "create or replace function private.require_animal_archive_actor(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$begin return;end$$",
      ],
      [
        "helper overload",
        "create function private.require_animal_archive_actor(text) returns void language plpgsql security definer set search_path='' as $$begin return;end$$",
      ],
      ...disabledForeignKeys,
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
    if (!modern && final.issues.length !== 25)
      throw new Error("Expected scoped cumulative gaps44->25");
    receipt.migration = {
      file,
      sha256: hash(text),
      firstApply: 0,
      secondApply: 0,
      unrelatedCatalogPreserved: true,
      modernGoodMediaCatalogPreserved: modern,
      knownArchiveBodyHardened: true,
      preexistingRowsPreserved: true,
      tempShadowPreserved: true,
      relationProfileHash: firstProfile,
    };
    await assertSafeFixtureTables(db, [...fixtureTables, table]);
    const args = [
      "bun",
      "test",
      "src/lib/animals/draftIntent.database.test.ts",
      "--timeout",
      "30000",
      ...(process.argv[4] ? ["--test-name-pattern", process.argv[4]] : []),
    ];
    const p = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, R01_ANIMAL_DRAFT_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeout = setTimeout(() => {
      receipt.ownedTestChildTimeout = true;
      p.kill();
    }, 120000);
    const consume = async (stream: ReadableStream<Uint8Array>) => {
      let text = "";
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = decoder.decode(value, { stream: true });
        text += part;
        process.stderr.write(part);
      }
      return text + decoder.decode();
    };
    const [stdout, stderr, exit] = await Promise.all([
      consume(p.stdout as ReadableStream<Uint8Array>),
      consume(p.stderr as ReadableStream<Uint8Array>),
      p.exited,
    ]);
    clearTimeout(timeout);
    const log = stdout + stderr;
    await writeFile(resolve(output, `task-5-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (exit !== 0) throw new Error("Task5 actual DB/service tests failed");
    const [afterLedger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    if (afterLedger.hash !== ledger.hash) throw new Error("Synthetic ledger changed");
    receipt.ledgerPreserved = true;
    if ((await rowState()) !== facts) throw new Error("Tests changed preexisting facts");
    if (hash(await snapshot(db)) !== hash(first) || hash(await profile()) !== firstProfile)
      throw new Error("Actor tests changed catalog or direct prerequisite profile");
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
      resolve(output, `task-5-${mode}-db.json`),
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
  if (["red", "red-actor"].includes(process.argv[2])) await run();
  else await runGreen();
}
