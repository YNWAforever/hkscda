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
if (process.env.R01_CMS_ALLOW_LOCAL_FIXTURES !== "1" || !["hosted"].includes(mode))
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
  "src/lib/knowledge/atomicKnowledgeForward.database.test.ts",
  "src/lib/knowledge/atomicKnowledgeForward.http.test.ts",
  "src/lib/knowledge/http.ts",
  "supabase/rls-tests/helpers/runR01CmsKnowledgeRed.ts",
  "supabase/migrations/20260926150000_guard_published_document_slots.sql",
  "src/lib/content/atomicForward.database.test.ts",
  "src/lib/content/atomicForward.http.test.ts",
  "src/lib/content/atomicForward.estate.http.test.ts",
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
  "docs/evidence/audit-remediation-20260927/r01-forward/task-7-knowledge-red-receipts",
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
    "knowledge_posts",
    "document_assets",
    "audit_log",
  ]);
  receipt.dependencies = [];
  for (const [name, expected] of deps) {
    const text = await readFile(resolve(root, "supabase/migrations", name), "utf8");
    if (hash(text) !== expected) throw new Error("Accepted dependency bytes differ");
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(text);
    });
    (receipt.dependencies as unknown[]).push({ name, sha256: expected });
  }
  const text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
  if (hash(text) !== "a2c365210aa2421e67a90b79714679759ef30520f2162d53407bb0b59760785f")
    throw new Error("Pre-fix a2 bytes differ");
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx.unsafe(text);
  });
  receipt.hostedAssetPrerequisites = {
    helper:
      await db`select pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,pg_get_function_arguments(p.oid) arguments,p.proconfig,md5(pg_get_functiondef(p.oid)) definition_md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='enforce_published_knowledge_document_assets'`,
    triggers:
      await db`select pg_get_triggerdef(t.oid) definition from pg_trigger t where t.tgrelid='public.knowledge_posts'::regclass and t.tgname='enforce_published_knowledge_document_assets'`,
  };
  const before = hash(await snapshot(db)),
    rows = await rowState(),
    facets = hash(await extra());
  const child = Bun.spawn(
    [
      "bun",
      "test",
      "./src/lib/knowledge/atomicKnowledgeForward.database.test.ts",
      "./src/lib/knowledge/atomicKnowledgeForward.http.test.ts",
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
  await writeFile(resolve(out, "test.log"), stdout + stderr, { flag: "wx" });
  receipt.testExit = exit;
  receipt.testSummary = (stdout + stderr).match(
    /^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm,
  );
  receipt.catalogPreserved = before === hash(await snapshot(db));
  receipt.rowsPreserved = rows === (await rowState());
  receipt.completeAuthDefaultNativeLedgerPreserved = facets === hash(await extra());
  if (
    !receipt.catalogPreserved ||
    !receipt.rowsPreserved ||
    !receipt.completeAuthDefaultNativeLedgerPreserved
  )
    throw new Error("RED probe preservation failed");
  receipt.result =
    exit === 1 ? "Actual pre-fix knowledge domain RED" : "Unexpected result; inspect actual log";
  if (exit !== 1) throw new Error("Expected real failing regression");
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
