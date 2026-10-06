/** Frozen Task7 composition, exact accepted dependencies and owned clone only. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
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
import type { Catalog } from "./productionSchemaClone";
import { checkReleaseSchema } from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";
import { randomUUID } from "node:crypto";
const root = resolve(import.meta.dir, "../../.."),
  mode = process.argv[2];
if (
  process.env.R01_CMS_ALLOW_LOCAL_FIXTURES !== "1" ||
  !["hosted", "modern", "hosted-smoke", "modern-smoke"].includes(mode)
)
  throw new Error("Explicit Task7 owned GREEN opt-in required");
const file = "20261002011249_r01_cms_atomic_forward.sql";
const deps = [
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
  [
    "20261001193722_r01_animal_draft_archive_forward.sql",
    "2e63db57af4071932da88d7fee29d66b0f8c5fb37e7a29428380b872450fe4ca",
  ],
  [
    "20261001213914_r01_crm_atomic_forward.sql",
    "2b1282a33bd5f6aa67c42af56ee45404fd97ff21e75ea9f3228b4c49d7a4cdd0",
  ],
];
const paths = [
  "supabase/migrations/" + file,
  "src/lib/content/atomicForward.database.test.ts",
  "src/lib/content/atomicForward.http.test.ts",
  "src/lib/content/atomicForward.estate.http.test.ts",
  "src/lib/knowledge/atomicKnowledgeForward.database.test.ts",
  "src/lib/knowledge/atomicKnowledgeForward.http.test.ts",
  "src/lib/knowledge/http.ts",
  "src/lib/knowledge/service.ts",
  "src/lib/knowledge/repository.server.ts",
  "src/lib/adoptionInformation/http.ts",
  "src/lib/adoptionInformation/repository.server.ts",
  "src/lib/content/http.server.ts",
  "supabase/rls-tests/helpers/runR01CmsForward.ts",
  "supabase/rls-tests/helpers/runR01CmsGreen.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-7-profile.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-7-generate.ts",
  "src/lib/content/repository.server.ts",
  "src/lib/adoptionInstructions/repository.server.ts",
  "src/lib/operations/releaseSchema.ts",
  "src/lib/operations/releaseManifest.ts",
  ...deps.map(([f]) => "supabase/migrations/" + f),
  "supabase/migrations/20260925053245_cms_promotion_atomicity.sql",
  "supabase/migrations/20260925103900_atomic_admin_content_audit.sql",
  "supabase/migrations/20260927120500_estate_versioned_commands.sql",
  "supabase/migrations/20260926150000_guard_published_document_slots.sql",
];
const blobs = async () =>
  Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => {
        const s = await readFile(resolve(root, p), "utf8");
        const git = Bun.spawn(["git", "hash-object", "--no-filters", p], {
          cwd: root,
          stdout: "pipe",
        });
        return [
          p,
          {
            sha256: hash(s),
            canonicalSha256: hash(s.replaceAll("\r\n", "\n")),
            gitBlob: (await new Response(git.stdout).text()).trim(),
          },
        ];
      }),
    ),
  );
const frozen = await blobs();
const out = resolve(
  root,
  "docs/evidence/audit-remediation-20260927/r01-forward/task-7-green-receipts",
  mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, ".gitattributes"), "* -text\n", { flag: "wx" });
for (const [i, p] of paths.entries())
  await copyFile(resolve(root, p), resolve(out, `s${i.toString().padStart(3, "0")}.source`));
const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modernUrl);
const capture = mode.startsWith("modern")
    ? await captureModernLocalSchema()
    : await captureProductionSchema(),
  clone = await createProductionClone(capture),
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
  schemaParity: true,
  sourceCatalogHash: hash(capture.catalog),
  zeroApplicationTables: clone.tableCount,
  managedPrerequisitesHash: clone.prerequisites,
  testedExecutableBlobs: frozen,
  archivedExecutableSources: Object.fromEntries(
    paths.map((p, i) => [p, `s${i.toString().padStart(3, "0")}.source`]),
  ),
  task1Applied: false,
  dependencyGate: "root explicit5cd CI36947861601 attempt1 allfiveSUCCESS 2026-10-02T01:00:21Z",
  productionActions: "schema/catalog only; no rows/actor commands/mutations",
};
const rowState = async () => {
  const rows = [];
  for (const t of await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') union all select 'auth.users' order by 1`) {
    const [r] = await db.unsafe(
      `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${t.name} t`,
    );
    rows.push([t.name, r]);
  }
  return hash(rows);
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
async function manifest(c: Catalog) {
  const entries = (k: string) => (c[k] ?? []) as Record<string, unknown>[];
  return checkReleaseSchema(
    {
      async load() {
        return {
          tables: entries("relations")
            .filter((e) => ["r", "p"].includes(String(e.kind)))
            .map((e) => ({
              schema: String(e.schema),
              name: String(e.name),
              rls: Boolean(e.rls),
              columns: Object.fromEntries(
                entries("columns")
                  .filter((x) => x.schema === e.schema && x.table === e.name)
                  .map((x) => [String(x.name), String(x.type)]),
              ),
              grants: Object.fromEntries(
                ["anon", "authenticated", "service_role"].map((role) => [
                  role,
                  ((e.acl ?? []) as { grantee: string; privilege: string }[])
                    .filter((a) => a.grantee === role)
                    .map((a) => a.privilege),
                ]),
              ),
            })),
          functions: entries("functions").map((e) => ({
            schema: String(e.schema),
            name: String(e.name),
            arguments: String(e.args),
            returns: String(e.result),
            executeRoles: ((e.acl ?? []) as { grantee: string; privilege: string }[])
              .filter((a) => a.privilege === "EXECUTE")
              .map((a) => a.grantee),
          })),
          migrationVersions: [],
        };
      },
    },
    releaseManifest,
  );
}
function unaffected(c: Catalog) {
  return Object.fromEntries(
    Object.entries(c).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.filter(
            (e: Record<string, unknown>) =>
              !(
                k === "functions" &&
                e.schema === "public" &&
                [
                  "cms_promotion_command",
                  "mutate_admin_content_with_audit",
                  "mutate_dog_friendly_estate_with_audit",
                ].includes(String(e.name))
              ) &&
              !(
                k === "relations" && e.name === "recipient_notification_draft_delivery_target_idx"
              ) &&
              !(
                k === "columns" && e.table === "recipient_notification_draft_delivery_target_idx"
              ) &&
              !(
                k === "indexes" &&
                e.definition ===
                  "CREATE UNIQUE INDEX recipient_notification_draft_delivery_target_idx ON public.recipient_notification_draft USING btree (story_update_id, channel, recipient_contact)"
              ),
          )
        : v,
    ]),
  );
}
try {
  await assertSafeFixtureTables(db, [
    "auth.users",
    "admin_user",
    "content_item",
    "story_update",
    "social_copy_variant",
    "recipient_notification_draft",
    "adoption_fees",
    "dog_friendly_estates",
    "board_member",
    "knowledge_posts",
    "document_assets",
    "audit_log",
  ]);
  const applied = [];
  receipt.initialGapCount = (await manifest(capture.catalog)).issues.length;
  for (const [name, expected] of deps) {
    const source = await readFile(resolve(root, "supabase/migrations", name), "utf8");
    if (hash(source) !== expected) throw new Error("Accepted dependency bytes differ: " + name);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(source);
    });
    applied.push({
      name,
      sha256: expected,
      gapCount: (await manifest(await snapshot(db))).issues.length,
    });
  }
  receipt.dependencies = applied;
  receipt.beforeGapCount = (await manifest(await snapshot(db))).issues.length;
  if (mode.startsWith("hosted") && receipt.beforeGapCount !== 22)
    throw new Error("Task7 conditional gap baseline differs");
  const actor = randomUUID();
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
    await tx`insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(${actor}::uuid,'synthetic.preserved','task7',${actor},'{}'::jsonb)`;
  });
  const before = await snapshot(db),
    beforeRows = await rowState(),
    beforeExtra = hash(await extra()),
    text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
  receipt.beforeRowsHash = beforeRows;
  receipt.beforeCompleteAuthDefaultNativeLedgerHash = beforeExtra;
  const forced = new Error("Task7 baseline acceptance forced rollback");
  let accepted = false;
  try {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(text);
      const [p] =
        await tx`select to_regprocedure('public.cms_promotion_command(uuid,jsonb)') promotion,to_regprocedure('public.mutate_admin_content_with_audit(uuid,text,text,uuid,jsonb)') content`;
      if (!p.promotion || !p.content)
        throw new Error("Baseline cannot silently omit either target");
      accepted = true;
      throw forced;
    });
  } catch (e) {
    if (e !== forced) throw e;
  }
  receipt.baselineAcceptedBeforeNegatives = accepted;
  receipt.baselineRollbackPreserved =
    hash(before) === hash(await snapshot(db)) &&
    beforeRows === (await rowState()) &&
    beforeExtra === hash(await extra());
  if (!accepted || !receipt.baselineRollbackPreserved)
    throw new Error("Task7 meaningful baseline acceptance required");
  // Refusal cases are added only from exact captured contracts, after baseline.
  const refusals: { name: string; setup: string }[] = [];
  for (const helper of [
    "enforce_published_knowledge_document_assets",
    "protect_published_document_references",
    "protect_published_annual_report_asset",
  ]) {
    const [exists] = await db`select to_regprocedure(${"private." + helper + "()"}) oid`;
    if (exists.oid) {
      for (const [facet, setup] of [
        [
          "owner",
          `set local role supabase_admin; alter function private.${helper}() owner to supabase_admin; set local role postgres`,
        ],
        ["ACL", `grant execute on function private.${helper}() to dashboard_user`],
        ["config", `alter function private.${helper}() set search_path='pg_catalog'`],
      ])
        refusals.push({ name: helper + " " + facet, setup });
    }
  }
  for (const f of [
    "mutate_dog_friendly_estate_with_audit(uuid,text,uuid,integer,jsonb)",
    "bump_dog_friendly_estate_version()",
    "bump_adoption_fee_version()",
    "set_updated_at()",
  ])
    for (const [name, setup] of [
      [
        "owner",
        `set local role supabase_admin; alter function public.${f} owner to supabase_admin; set local role postgres`,
      ],
      ["ACL", `grant execute on function public.${f} to dashboard_user`],
      ["grant option", `grant execute on function public.${f} to service_role with grant option`],
    ])
      refusals.push({ name: f + " " + name, setup });
  refusals.push(
    {
      name: "document asset owner",
      setup:
        "set local role supabase_admin; alter table public.document_assets owner to supabase_admin; set local role postgres",
    },
    {
      name: "document asset RLS",
      setup: "alter table public.document_assets disable row level security",
    },
    {
      name: "document asset column ACL",
      setup: "grant update(is_published) on public.document_assets to authenticated",
    },
    {
      name: "document asset default",
      setup: "alter table public.document_assets alter column is_published set default true",
    },
    {
      name: "table owner",
      setup:
        "set local role supabase_admin; alter table public.board_member owner to supabase_admin; set local role postgres",
    },
    { name: "RLS", setup: "alter table public.knowledge_posts disable row level security" },
    {
      name: "unknown index",
      setup: "create index task7_unknown_idx on public.recipient_notification_draft(body)",
    },
    {
      name: "version trigger disabled",
      setup:
        "alter table public.dog_friendly_estates disable trigger bump_dog_friendly_estate_version",
    },
    {
      name: "creator public unknown recipient",
      setup:
        "drop function if exists public.cms_promotion_command(uuid,jsonb); alter default privileges for role postgres in schema public grant execute on functions to dashboard_user",
    },
    {
      name: "creator public grant option",
      setup:
        "drop function if exists public.cms_promotion_command(uuid,jsonb); alter default privileges for role postgres in schema public grant execute on functions to service_role with grant option",
    },
    {
      name: "creator global unexpected recipient",
      setup:
        "drop function if exists public.cms_promotion_command(uuid,jsonb); alter default privileges for role postgres grant execute on functions to anon",
    },
    {
      name: "effective Auth service column",
      setup: "grant select(banned_until) on auth.users to service_role",
    },
  );
  const indexName = "public.recipient_notification_draft_delivery_target_idx";
  refusals.push(
    {
      name: "delivery index wrong shape",
      setup: `drop index if exists ${indexName}; create unique index recipient_notification_draft_delivery_target_idx on public.recipient_notification_draft(story_update_id,channel)`,
    },
    {
      name: "delivery index lookalike extra",
      setup:
        "create index recipient_notification_draft_delivery_target_idx_evil on public.recipient_notification_draft(body)",
    },
    {
      name: "estate argument default",
      setup:
        "do $drift$ begin execute replace(pg_get_functiondef('public.mutate_dog_friendly_estate_with_audit(uuid,text,uuid,integer,jsonb)'::regprocedure),'p_payload jsonb)', 'p_payload jsonb DEFAULT ''{}''::jsonb)'); end $drift$",
    },
    {
      name: "estate version helper language/config",
      setup:
        "alter function public.bump_dog_friendly_estate_version() set search_path='pg_catalog'",
    },
    {
      name: "managed Auth column UPDATE",
      setup:
        "set local role supabase_admin; grant update(banned_until) on auth.users to service_role; set local role postgres",
    },
  );
  refusals.push({
    name: "delivery index unready exact owned row",
    setup: `
    create unique index if not exists recipient_notification_draft_delivery_target_idx on public.recipient_notification_draft(story_update_id,channel,recipient_contact);
    set local role supabase_admin;
    do $fixture$ declare table_oid oid; index_oid oid; changed integer; begin
      if current_database()<>'${clone.name}' or current_database() !~ '^r01_clone_[a-f0-9]{32}$'
        or (select datdba from pg_database where datname=current_database())<>'postgres'::regrole then raise exception 'Owned clone fixture identity mismatch'; end if;
      table_oid:='public.recipient_notification_draft'::regclass;
      if (select relowner from pg_class where oid=table_oid)<>'postgres'::regrole then raise exception 'Owned table fixture owner mismatch'; end if;
      index_oid:='${indexName}'::regclass;
      if (select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid where i.indexrelid=index_oid and i.indrelid=table_oid and c.relowner='postgres'::regrole and i.indisready and i.indisvalid and i.indisunique)<>1 then raise exception 'Owned index fixture identity mismatch'; end if;
      update pg_index set indisready=false where indexrelid=index_oid and indrelid=table_oid and indisready;
      get diagnostics changed=row_count;
      if changed<>1 then raise exception 'Owned index fixture must change exactly one row'; end if;
    end $fixture$;
    set local role postgres;`,
  });
  const duplicateContent = randomUUID(),
    duplicateUpdate = randomUUID();
  refusals.push({
    name: "existing duplicate nonnull delivery keys",
    setup: `drop index if exists ${indexName}; insert into public.content_item(id,slug,type,title,summary) values('${duplicateContent}','synthetic-${duplicateContent}','rescue_story','Synthetic story','Synthetic summary'); insert into public.story_update(id,content_item_id,kind,title,occurred_at) values('${duplicateUpdate}','${duplicateContent}','general','Synthetic update',now()); insert into public.recipient_notification_draft(content_item_id,story_update_id,channel,recipient_name,recipient_contact,subject,body,status) values('${duplicateContent}','${duplicateUpdate}','email','Synthetic recipient','duplicate@example.invalid','Synthetic','Synthetic','draft'),('${duplicateContent}','${duplicateUpdate}','email','Synthetic recipient','duplicate@example.invalid','Synthetic','Synthetic','draft')`,
  });
  for (const [name, signature, legacy] of [
    ["cms_promotion_command", "uuid,jsonb", "20260925053245_cms_promotion_atomicity.sql"],
    [
      "mutate_admin_content_with_audit",
      "uuid,text,text,uuid,jsonb",
      "20260925103900_atomic_admin_content_audit.sql",
    ],
  ]) {
    const oldSource = await readFile(resolve(root, "supabase/migrations", legacy), "utf8");
    const known = oldSource.slice(oldSource.indexOf("create or replace function public." + name));
    if (!known.startsWith("create or replace function"))
      throw new Error("Known target fixture extraction failed");
    for (const [facet, drift] of [
      [
        "owner",
        `set local role supabase_admin; alter function public.${name}(${signature}) owner to supabase_admin; set local role postgres`,
      ],
      ["ACL", `grant execute on function public.${name}(${signature}) to dashboard_user`],
      [
        "grant option",
        `grant execute on function public.${name}(${signature}) to service_role with grant option`,
      ],
      [
        "argument default",
        `do $drift$ begin execute replace(pg_get_functiondef('public.${name}(${signature})'::regprocedure),'${name === "cms_promotion_command" ? "p_command" : "p_payload"} jsonb)', '${name === "cms_promotion_command" ? "p_command" : "p_payload"} jsonb DEFAULT ''{}''::jsonb)'); end $drift$`,
      ],
    ])
      refusals.push({ name: name + " " + facet, setup: known + "\n" + drift });
  }
  for (const relation of [
    "admin_user",
    "social_copy_variant",
    "recipient_notification_draft",
    "knowledge_posts",
  ]) {
    const native = await db.unsafe(
      `select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint where c.contype='f' and c.conrelid='public.${relation}'::regclass and t.tgrelid=c.conrelid order by c.conname,t.tgtype limit 1`,
    );
    if (!native[0]) throw new Error("Native fixture prerequisite missing " + relation);
    refusals.push({
      name: "native RI disabled " + relation,
      setup: `set local role supabase_admin; alter table public.${relation} disable trigger "${native[0].tgname}"; set local role postgres`,
    });
  }
  if (!mode.endsWith("smoke")) {
    const results = [];
    for (const { name, setup } of refusals) {
      let code = "success",
        stage = "fixture";
      try {
        await db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx.unsafe(setup);
          stage = "guard";
          await tx.unsafe(text);
          throw forced;
        });
      } catch (e) {
        code = e === forced ? "success" : ((e as { errno?: string }).errno ?? "unexpected");
      }
      const preserved =
        hash(before) === hash(await snapshot(db)) &&
        beforeRows === (await rowState()) &&
        beforeExtra === hash(await extra());
      results.push({ name, code, stage, fullRollbackPreserved: preserved });
      receipt.refusals = results;
      if (code !== "55000" || !preserved)
        throw new Error("Task7 concrete refusal failed: " + name + " " + code);
    }
    receipt.refusals = results;
  }
  const apply = () =>
    db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(text);
    });
  await apply();
  receipt.applyCount = 1;
  const first = await snapshot(db);
  await apply();
  receipt.applyCount = 2;
  receipt.secondApplyIdempotent = hash(first) === hash(await snapshot(db));
  receipt.rowsPreservedAfterApply = beforeRows === (await rowState());
  receipt.completeAuthDefaultNativeLedgerPreservedAfterApply = beforeExtra === hash(await extra());
  receipt.unaffectedCatalogPreserved = hash(unaffected(before)) === hash(unaffected(first));
  receipt.afterGapCount = (await manifest(first)).issues.length;
  if (
    !receipt.secondApplyIdempotent ||
    !receipt.rowsPreservedAfterApply ||
    !receipt.completeAuthDefaultNativeLedgerPreservedAfterApply ||
    !receipt.unaffectedCatalogPreserved ||
    (mode.startsWith("hosted") && receipt.afterGapCount !== 20)
  )
    throw new Error("Task7 apply preservation/conditional gaps differ");
  const child = Bun.spawn(
    [
      "bun",
      "test",
      "src/lib/content/atomicForward.database.test.ts",
      "src/lib/content/atomicForward.http.test.ts",
      "src/lib/content/atomicForward.estate.http.test.ts",
      "src/lib/knowledge/atomicKnowledgeForward.database.test.ts",
      "src/lib/knowledge/atomicKnowledgeForward.http.test.ts",
      "src/lib/adoptionInformation/http.ts",
      "src/lib/adoptionInformation/repository.server.ts",
      "src/lib/content/http.server.ts",
      "--timeout",
      "30000",
    ],
    {
      cwd: root,
      env: { ...process.env, R01_CMS_TEST_DATABASE_URL: clone.url },
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
  receipt.catalogPreservedAfterTests = hash(first) === hash(await snapshot(db));
  receipt.rowsPreservedAfterTests = beforeRows === (await rowState());
  receipt.completeAuthDefaultNativeLedgerPreservedAfterTests = beforeExtra === hash(await extra());
  if (
    exit ||
    !receipt.catalogPreservedAfterTests ||
    !receipt.rowsPreservedAfterTests ||
    !receipt.completeAuthDefaultNativeLedgerPreservedAfterTests
  )
    throw new Error("Task7 behavior/preservation failure");
  receipt.result = "GREEN owned synthetic rehearsal";
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
  console.log(
    JSON.stringify({
      mode,
      out,
      result: receipt.result,
      error: receipt.error,
      testExit: receipt.testExit,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
      frozenInputsPreserved: receipt.frozenInputsPreserved,
    }),
  );
}
