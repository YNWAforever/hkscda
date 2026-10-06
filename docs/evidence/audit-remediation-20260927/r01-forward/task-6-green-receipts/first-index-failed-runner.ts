/** Task 6 preparation: schema-only reads and individually owned synthetic clones. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
import { randomUUID } from "node:crypto";
import { checkReleaseSchema } from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";
import type { Catalog } from "./productionSchemaClone";
async function red() {
  if (process.env.R01_CRM_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit Task6 clone opt-in required");
  const mode = process.argv[2];
  if (!["red", "red-actor", "red-defects"].includes(mode)) throw new Error("Task6 RED only");
  const root = resolve(import.meta.dir, "../../.."),
    out = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001"),
    archive = resolve(
      root,
      "docs/evidence/audit-remediation-20260927/r01-forward/task-6-red-receipts",
    );
  await mkdir(archive, { recursive: true });
  const paths = [
    "src/lib/crm/atomicForward.database.test.ts",
    "supabase/rls-tests/helpers/runR01CrmForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "supabase/migrations/20260925103937_atomic_crm_supporter_audit.sql",
    "supabase/migrations/20260927110000_crm_supporter_edit_version.sql",
  ];
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => [p, hash(await readFile(resolve(root, p), "utf8"))]),
      ),
    );
  const frozen = await blobs();
  const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    modernBefore = await localSourceState(modern);
  const capture =
    mode === "red" ? await captureProductionSchema() : await captureModernLocalSchema();
  const clone = await createProductionClone(capture),
    receipt: Record<string, unknown> = {
      mode,
      sourceCommit: (
        await new Response(
          Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
        ).text()
      ).trim(),
      startedAt: new Date().toISOString(),
      clone: clone.name,
      schemaParity: true,
      zeroApplicationTables: clone.tableCount,
      sourceCatalogHash: hash(capture.catalog),
      managedPrerequisitesHash: clone.prerequisites,
      testedExecutableBlobs: frozen,
      productionActions: "schema/catalog only; no data read or actor commands",
      task1Applied: false,
      dependentSqlApplied: false,
    };
  try {
    await assertSafeFixtureTables(clone.sql, [
      "auth.users",
      "admin_user",
      "supporter",
      "supporter_role",
      "consent",
      "audit_log",
    ]);
    const [auth] =
      await clone.sql`select has_any_column_privilege('service_role','auth.users','SELECT') sel,has_any_column_privilege('service_role','auth.users','UPDATE') upd`;
    if (auth.sel || auth.upd)
      throw new Error("Managed Auth effective privilege mismatch; no calibration authorized");
    receipt.authEffectiveAccess = auth;
    receipt.targetProfiles =
      await clone.sql`select n.nspname schema,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer,md5(p.prosrc) sourceMd5,md5(pg_get_functiondef(p.oid)) definitionMd5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('mutate_crm_supporter_with_audit','replace_supporter_roles_atomic','append_crm_consents_with_audit','mutate_crm_supporter_if_version_with_audit','bump_supporter_edit_version','bump_supporter_edit_version_from_role') order by n.nspname,p.proname`;
    const before = hash(await snapshot(clone.sql));
    const child = Bun.spawn(
      [
        "bun",
        "test",
        "src/lib/crm/atomicForward.database.test.ts",
        "--timeout",
        "30000",
        "--test-name-pattern",
        mode === "red"
          ? "missing-target"
          : mode === "red-defects"
            ? "legacy defect"
            : "versioned actor",
      ],
      {
        cwd: root,
        env: { ...process.env, R01_CRM_TEST_DATABASE_URL: clone.url },
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
    await writeFile(resolve(archive, `task-6-${mode}.log`), log);
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    receipt.catalogPreserved = before === hash(await snapshot(clone.sql));
    if (exit === 0 || !(mode === "red" ? log.includes("42883") : log.includes('Expected: "42501"')))
      throw new Error("Actual expected Task6 RED absent");
    receipt.result =
      mode === "red"
        ? "actual missing atomic functions 42883"
        : "actual versioned wrapper accepts banned Auth actor";
    process.exitCode = 1;
  } finally {
    await clone.close();
    receipt.templatePreserved = clone.templatePreserved;
    receipt.modernPreserved = (await localSourceState(modern)) === modernBefore;
    receipt.frozenInputsPreserved = hash(await blobs()) === hash(frozen);
    receipt.cleanup = "normal owned clone drop only";
    receipt.completedAt = new Date().toISOString();
    await writeFile(
      resolve(archive, `task-6-${mode}.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  }
}
async function green() {
  const mode = process.argv[2];
  if (process.env.R01_CRM_ALLOW_LOCAL_FIXTURES !== "1" || !["green", "green-modern"].includes(mode))
    throw new Error("Task6 GREEN opt-in required");
  const root = resolve(import.meta.dir, "../../.."),
    out = resolve(
      root,
      "docs/evidence/audit-remediation-20260927/r01-forward/task-6-green-receipts",
    ),
    file = "20261001213914_r01_crm_atomic_forward.sql";
  await mkdir(out, { recursive: true });
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
  ];
  const paths = [
    "src/lib/crm/atomicForward.database.test.ts",
    "supabase/rls-tests/helpers/runR01CrmForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "src/lib/crm/service.ts",
    "src/lib/crm/repository.server.ts",
    "src/lib/crm/http.server.ts",
    "src/lib/crm/consent.ts",
    "src/lib/crm/schemas.ts",
    "src/lib/crm/types.ts",
    "src/lib/admin/session.server.ts",
    "src/lib/donations/supabase.server.ts",
    "src/lib/operations/releaseSchema.ts",
    "src/lib/operations/releaseManifest.ts",
    "docs/evidence/audit-remediation-20260927/migration-manifest.csv",
    "supabase/migrations/" + file,
    ...deps.map(([f]) => "supabase/migrations/" + f),
    "supabase/migrations/20260925103937_atomic_crm_supporter_audit.sql",
    "supabase/migrations/20260927110000_crm_supporter_edit_version.sql",
  ];
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => {
          const text = await readFile(resolve(root, p), "utf8");
          return [p, { sha256: hash(text), canonicalSha256: hash(text.replaceAll("\r\n", "\n")) }];
        }),
      ),
    );
  const frozen = await blobs(),
    modern = mode === "green-modern",
    modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    modernBefore = await localSourceState(modernUrl),
    capture = modern ? await captureModernLocalSchema() : await captureProductionSchema(),
    clone = await createProductionClone(capture);
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    sourceCommit: (
      await new Response(
        Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
      ).text()
    ).trim(),
    testedExecutableBlobs: frozen,
    clone: clone.name,
    schemaParity: true,
    zeroApplicationTables: clone.tableCount,
    sourceCatalogHash: hash(capture.catalog),
    managedPrerequisitesHash: clone.prerequisites,
    productionActions: "schema/catalog read only; no production actor calls or data",
    dependencyGate: "controller released PR189 exact592 CI36928397189 allfiveSUCCESS",
    task1Applied: false,
  };
  const db = clone.sql;
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
      await db`select to_jsonb(t) trigger,(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid) dependencies from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint where c.conrelid in ('public.supporter'::regclass,'public.supporter_role'::regclass,'public.consent'::regclass,'public.admin_user'::regclass) order by t.oid`,
    ledger:
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`,
  });
  try {
    await assertSafeFixtureTables(db, [
      "auth.users",
      "admin_user",
      "supporter",
      "supporter_role",
      "consent",
      "audit_log",
    ]);
    receipt.manifestInitial = (await crmManifest(capture.catalog)).issues.length;
    if (!modern && receipt.manifestInitial !== 44)
      throw new Error("Hosted manifest baseline drift");
    const applied = [];
    for (const [f, expected] of deps) {
      const s = await readFile(resolve(root, "supabase/migrations", f), "utf8");
      if (hash(s) !== expected) throw new Error("Accepted dependency bytes differ");
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(s);
      });
      applied.push({
        file: f,
        sha256: expected,
        issues: (await crmManifest(await snapshot(db))).issues.length,
      });
    }
    receipt.dependencies = applied;
    receipt.manifestBeforeTask6 = (await crmManifest(await snapshot(db))).issues.length;
    if (!modern && receipt.manifestBeforeTask6 !== 25)
      throw new Error("Task2–5 conditional gap baseline drift");
    const actor = randomUUID(),
      supporter = randomUUID();
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      await tx`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Synthetic preserved CRM fact',${supporter + "@example.invalid"})`;
      await tx`insert into public.supporter_role(supporter_id,role) values(${supporter}::uuid,'donor')`;
      await tx`insert into public.consent(supporter_id,channel,status,source,"timestamp") values(${supporter}::uuid,'email','opt_out','synthetic',${"2026-09-30T00:00:00Z"}::timestamptz)`;
      await tx`insert into public.audit_log(actor_user_id,action,entity,entity_id,"timestamp",detail) values(${actor}::uuid,'synthetic.preserved','supporter',${supporter},now(),'{}'::jsonb)`;
    });
    const before = await snapshot(db),
      beforeRows = await rowState(),
      beforeExtra = hash(await extra()),
      text = await readFile(resolve(root, "supabase/migrations", file), "utf8"),
      legacy = await readFile(
        resolve(root, "supabase/migrations/20260925103937_atomic_crm_supporter_audit.sql"),
        "utf8",
      );
    receipt.preMigrationRowHash = beforeRows;
    receipt.preMigrationCompleteAuthDefaultNativeLedgerHash = beforeExtra;
    const apply = () =>
      db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(text);
      });
    const cases: [string, string][] = [
      [
        "Auth direct SELECT(email)",
        "set local role supabase_auth_admin;grant select(email) on auth.users to service_role",
      ],
      [
        "Auth direct UPDATE(banned_until)",
        "set local role supabase_auth_admin;grant update(banned_until) on auth.users to service_role",
      ],
      [
        "Auth PUBLIC SELECT(email)",
        "set local role supabase_auth_admin;grant select(email) on auth.users to public",
      ],
      [
        "Auth PUBLIC UPDATE(banned_until)",
        "set local role supabase_auth_admin;grant update(banned_until) on auth.users to public",
      ],
      [
        "public unknown schema creation default",
        "alter default privileges for role postgres in schema public grant execute on functions to dashboard_user",
      ],
      [
        "private unknown schema creation default",
        "alter default privileges for role postgres in schema private grant execute on functions to dashboard_user",
      ],
      [
        "unknown global creation default",
        "alter default privileges for role postgres grant execute on functions to dashboard_user",
      ],
      [
        "public schema default grant option",
        "alter default privileges for role postgres in schema public grant execute on functions to service_role with grant option",
      ],
      [
        "private schema default grant option",
        "alter default privileges for role postgres in schema private grant execute on functions to service_role with grant option",
      ],
      [
        "global default grant option",
        "alter default privileges for role postgres grant execute on functions to service_role with grant option",
      ],
      [
        "global owner default missing",
        "alter default privileges for role postgres revoke execute on functions from postgres",
      ],
      [
        "consent rule",
        "create rule crm_unreviewed as on insert to public.consent do instead nothing",
      ],
      ["consent persistence", "alter table public.consent set unlogged"],
      ["supporter column type", "alter table public.supporter alter column name type varchar(200)"],
      ["supporter owner", "alter table public.supporter owner to supabase_admin"],
      ["supporter RLS", "alter table public.supporter disable row level security"],
      [
        "supporter version trigger disabled",
        "alter table public.supporter disable trigger bump_supporter_edit_version",
      ],
      [
        "role version trigger disabled",
        "alter table public.supporter_role disable trigger bump_supporter_edit_version_from_role",
      ],
      ["consent index dropped", "drop index public.consent_unique_event"],
      [
        "wrapper argument names",
        "drop function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb);create function public.mutate_crm_supporter_if_version_with_audit(wrong uuid,p_expected_version bigint,p_input jsonb,p_roles jsonb,p_actor_user_id uuid,p_at timestamptz,p_detail jsonb) returns jsonb language plpgsql set search_path='' as $$begin return '{}'::jsonb;end$$",
      ],
      [
        "wrapper body",
        "create or replace function public.mutate_crm_supporter_if_version_with_audit(p_supporter_id uuid,p_expected_version bigint,p_input jsonb,p_roles jsonb,p_actor_user_id uuid,p_at timestamptz,p_detail jsonb) returns jsonb language plpgsql set search_path='' as $$begin return '{}'::jsonb;end$$",
      ],
      [
        "wrapper ACL",
        "grant execute on function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) to anon",
      ],
      [
        "wrapper owner",
        "alter function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) owner to supabase_admin",
      ],
      [
        "wrapper configuration",
        "alter function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) set search_path='public'",
      ],
      [
        "wrapper security definer",
        "alter function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) security definer",
      ],
      [
        "wrapper cost",
        "alter function public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb) cost 1",
      ],
      [
        "unknown private bridge",
        "create function private.require_crm_supporter_actor(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$begin return;end$$;revoke all on function private.require_crm_supporter_actor(uuid) from public,anon,authenticated;grant execute on function private.require_crm_supporter_actor(uuid) to service_role",
      ],
    ];
    for (const name of [
      "mutate_crm_supporter_with_audit",
      "replace_supporter_roles_atomic",
      "append_crm_consents_with_audit",
    ]) {
      cases.push([
        name + " overload",
        `create function public.${name}(wrong text) returns void language plpgsql set search_path='' as $$begin return;end$$`,
      ]);
    }
    const refusal: unknown[] = [];
    for (const [name, mutation] of cases) {
      let status = "success";
      const rollback = new Error("Task6 unexpected acceptance rollback");
      try {
        await db.begin(async (tx) => {
          if (modern && name.includes("default")) {
            await tx.unsafe(
              "drop function public.mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb);drop function public.replace_supporter_roles_atomic(uuid,jsonb);drop function public.append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb)",
            );
          }
          await tx.unsafe(mutation);
          await tx`set local role postgres`;
          await tx.unsafe(text);
          throw rollback;
        });
      } catch (e) {
        status = e === rollback ? "success" : ((e as { errno?: string }).errno ?? "unexpected");
      }
      const preserved =
        hash(await snapshot(db)) === hash(before) &&
        (await rowState()) === beforeRows &&
        hash(await extra()) === beforeExtra;
      refusal.push({ case: name, status, preserved });
      receipt.refusals = refusal;
      if (status !== "55000" || !preserved)
        throw new Error("Task6 drift refusal failed: " + name + " " + status);
    }
    // Direct native trigger cases exercise referenced-side RI actions as well.
    const native =
      await db`select t.tgname,c.conname,t.tgrelid::regclass::text table_name from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint where c.conrelid in ('public.supporter'::regclass,'public.supporter_role'::regclass,'public.consent'::regclass,'public.admin_user'::regclass) order by c.conname,t.tgtype,t.tgrelid`;
    for (const r of native) {
      let status = "success";
      try {
        await db.begin(async (tx) => {
          await tx.unsafe(`alter table ${r.table_name} disable trigger "${r.tgname}"`);
          await tx`set local role postgres`;
          await tx.unsafe(text);
          throw new Error("unexpected native acceptance");
        });
      } catch (e) {
        status = (e as { errno?: string }).errno ?? "unexpected";
      }
      const preserved =
        hash(await snapshot(db)) === hash(before) &&
        hash(await extra()) === beforeExtra &&
        (await rowState()) === beforeRows;
      refusal.push({ case: "native " + r.conname + " " + r.tgname, status, preserved });
      if (status !== "55000" || !preserved) throw new Error("Native refusal failed: " + status);
    }
    // Exact known old profiles exist only for the three legacy definitions.
    for (const [sig, change] of [
      ["replace_supporter_roles_atomic(uuid,jsonb)", "security definer"],
      [
        "append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb)",
        "set search_path='public'",
      ],
      ["mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb)", "cost 1"],
    ]) {
      let status = "success";
      try {
        await db.begin(async (tx) => {
          await tx`set local role postgres`;
          if (!modern) await tx.unsafe(legacy);
          await tx.unsafe(`alter function public.${sig} ${change}`);
          await tx.unsafe(text);
          throw new Error("unexpected function drift acceptance");
        });
      } catch (e) {
        status = (e as { errno?: string }).errno ?? "unexpected";
      }
      const preserved =
        hash(await snapshot(db)) === hash(before) &&
        hash(await extra()) === beforeExtra &&
        (await rowState()) === beforeRows;
      refusal.push({ case: sig + " " + change, status, preserved });
      if (status !== "55000" || !preserved) throw new Error("Function refusal failed");
    }
    receipt.refusals = refusal;
    await apply();
    const after = await snapshot(db);
    receipt.migrationRowsPreserved = (await rowState()) === beforeRows;
    receipt.completeAuthDefaultsNativeLedgerPreserved = hash(await extra()) === beforeExtra;
    receipt.unrelatedCatalogPreserved = hash(crmUnaffected(before)) === hash(crmUnaffected(after));
    if (
      !receipt.migrationRowsPreserved ||
      !receipt.completeAuthDefaultsNativeLedgerPreserved ||
      !receipt.unrelatedCatalogPreserved
    )
      throw new Error("Migration preservation failure");
    await apply();
    receipt.secondApplyCatalogIdentical = hash(await snapshot(db)) === hash(after);
    receipt.secondApplyRowsIdentical = (await rowState()) === beforeRows;
    receipt.manifestAfterTask6 = (await crmManifest(after)).issues.length;
    if (!modern && receipt.manifestAfterTask6 !== 22)
      throw new Error("Task6 must close exactly3 conditional gaps");
    const child = Bun.spawn(
      ["bun", "test", "src/lib/crm/atomicForward.database.test.ts", "--timeout", "30000"],
      {
        cwd: root,
        env: { ...process.env, R01_CRM_TEST_DATABASE_URL: clone.url },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    await writeFile(resolve(out, `task-6-${mode}.log`), stdout + stderr);
    receipt.testExit = exit;
    receipt.testSummary = (stdout + stderr).match(
      /^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm,
    );
    receipt.postTestRowsPreserved = (await rowState()) === beforeRows;
    receipt.postTestCatalogPreserved = hash(await snapshot(db)) === hash(after);
    receipt.postTestAuthDefaultsNativeLedgerPreserved = hash(await extra()) === beforeExtra;
    if (
      exit ||
      !receipt.postTestRowsPreserved ||
      !receipt.postTestCatalogPreserved ||
      !receipt.postTestAuthDefaultsNativeLedgerPreserved
    )
      throw new Error("Task6 behavior or preservation failure");
  } catch (e) {
    receipt.failure = { message: (e as Error).message, errno: (e as { errno?: string }).errno };
    throw e;
  } finally {
    await clone.close();
    receipt.templateBefore = clone.templateBefore;
    receipt.templatePreserved = clone.templatePreserved;
    receipt.modernBefore = modernBefore;
    receipt.modernPreserved = (await localSourceState(modernUrl)) === modernBefore;
    receipt.frozenInputsPreserved = hash(await blobs()) === hash(frozen);
    receipt.cleanup = "normal newly owned clone drop only";
    receipt.completedAt = new Date().toISOString();
    await writeFile(resolve(out, `task-6-${mode}.json`), JSON.stringify(receipt, null, 2) + "\n");
    console.log(
      JSON.stringify({
        mode,
        testExit: receipt.testExit,
        testSummary: receipt.testSummary,
        refusalCount: ((receipt.refusals as unknown[]) ?? []).length,
        manifestAfter: receipt.manifestAfterTask6,
        templatePreserved: receipt.templatePreserved,
        modernPreserved: receipt.modernPreserved,
        frozenInputsPreserved: receipt.frozenInputsPreserved,
        failure: receipt.failure,
      }),
    );
  }
  if (!receipt.templatePreserved || !receipt.modernPreserved || !receipt.frozenInputsPreserved)
    throw new Error("Source/frozen input preservation failure");
}
function crmUnaffected(c: Catalog) {
  return Object.fromEntries(
    Object.entries(c).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.filter(
            (e: Record<string, unknown>) =>
              k !== "functions" ||
              !(
                ([
                  "mutate_crm_supporter_with_audit",
                  "replace_supporter_roles_atomic",
                  "append_crm_consents_with_audit",
                  "mutate_crm_supporter_if_version_with_audit",
                ].includes(String(e.name)) &&
                  e.schema === "public") ||
                (e.name === "require_crm_supporter_actor" && e.schema === "private")
              ),
          )
        : v,
    ]),
  );
}
async function crmManifest(c: Catalog) {
  type E = Record<string, unknown>;
  const entries = (k: string) => (c[k] ?? []) as E[];
  return checkReleaseSchema(
    {
      load: async () => ({
        tables: entries("relations")
          .filter((e) => e.kind === "r" || e.kind === "p")
          .map((e) => ({
            schema: String(e.schema),
            name: String(e.name),
            rls: e.rls === true,
            columns: Object.fromEntries(
              entries("columns")
                .filter((x) => x.schema === e.schema && x.table === e.name)
                .map((x) => [String(x.name), String(x.type)]),
            ),
            grants: Object.fromEntries(
              ["anon", "authenticated", "service_role"].map((role) => [
                role,
                ((e.acl ?? []) as E[])
                  .filter((a) => a.grantee === role)
                  .map((a) => String(a.privilege)),
              ]),
            ),
          })),
        functions: entries("functions").map((e) => ({
          schema: String(e.schema),
          name: String(e.name),
          arguments: String(e.args),
          returns: String(e.result),
          executeRoles: ((e.acl ?? []) as E[])
            .filter((a) => a.privilege === "EXECUTE")
            .map((a) => String(a.grantee)),
        })),
        migrationVersions: [],
      }),
    },
    releaseManifest,
  );
}
if (process.argv[2]?.startsWith("green")) await green();
else await red();
