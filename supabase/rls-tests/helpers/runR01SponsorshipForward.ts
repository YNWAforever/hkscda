/** Task 3: read-only schema capture and newly owned zero-data local rehearsal. */
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
import {
  checkReleaseSchema,
  type CatalogSnapshot,
} from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";

type Entry = Record<string, unknown>;
const tables = ["sponsorship_proof_upload_intent", "sponsorship_staff_proof_upload_intent"];
const intentRelations = [
  ...tables,
  "sponsorship_proof_upload_intent_pkey",
  "sponsorship_proof_upload_intent_storage_path_key",
  "sponsorship_proof_upload_intent_cleanup_idx",
  "sponsorship_staff_proof_upload_intent_pkey",
  "sponsorship_staff_proof_upload_cleanup_idx",
];
const functions = [
  "mark_sponsorship_proof_upload_submitted",
  "claim_expired_sponsorship_proof_uploads",
  "reserve_staff_sponsorship_proof_upload",
  "mark_staff_sponsorship_proof_attached",
  "claim_expired_staff_sponsorship_proof_uploads",
  "create_public_sponsorship_pledge",
];
const entries = (c: Catalog, k: string) => (c[k] ?? []) as Entry[];
const target = (e: Entry) =>
  e.schema === "public" &&
  (intentRelations.includes(String(e.table)) ||
    functions.includes(String(e.name)) ||
    intentRelations.includes(String(e.name)) ||
    tables.some((t) => e.name === "_" + t) ||
    [
      "sponsorship_proof_upload_submitted",
      "sponsorship_staff_proof_attached",
      "sponsorship_staff_proof_upload_cleanup_idx",
    ].includes(String(e.name)));
const unaffected = (c: Catalog) =>
  Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.filter((e) => !target(e)) : v]),
  );
const exceptReviewedPreferenceBody = (c: Catalog) => ({
  ...c,
  functions: entries(c, "functions").map((f) =>
    f.schema === "public" && f.name === "enforce_current_animal_preference"
      ? { ...f, bodyMd5: "explicit reviewed delta" }
      : f,
  ),
});
async function manifest(c: Catalog) {
  const relations: CatalogSnapshot["tables"] = entries(c, "relations")
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
    { load: async () => ({ tables: relations, functions: funcs, migrationVersions: [] }) },
    releaseManifest,
  );
}
async function run() {
  if (process.env.R01_SPONSORSHIP_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Explicit Task 3 fixture opt-in required");
  const mode = process.argv[2];
  if (!["red", "green", "green-modern"].includes(mode))
    throw new Error("Use red, green or green-modern");
  const green = mode.startsWith("green"),
    modern = mode.endsWith("modern"),
    root = resolve(import.meta.dir, "../../.."),
    output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  const dependency = "20261001134252_r01_adoption_upload_forward.sql",
    preferenceDependency = "20261001154743_r01_animal_preference_record_fields.sql",
    file = basename(process.argv[3] ?? "");
  if (green && !/^\d{14}_r01_sponsorship_submission_forward\.sql$/.test(file))
    throw new Error("Only focused Task3 migration allowed");
  const paths = [
    "src/lib/sponsorship/submissionIntent.database.test.ts",
    "supabase/rls-tests/helpers/runR01SponsorshipForward.ts",
    "supabase/rls-tests/helpers/productionSchemaClone.ts",
    "src/lib/sponsorship/proofIntent.server.ts",
    "src/lib/sponsorship/proofCleanup.server.ts",
    "src/lib/sponsorship/submission.server.ts",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-3-reviewed-paths.json",
  ];
  if (green)
    paths.push(
      "supabase/migrations/" + file,
      "supabase/migrations/" + dependency,
      "supabase/migrations/" + preferenceDependency,
    );
  const blobs = async () =>
    Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => {
          const text = await readFile(resolve(root, p), "utf8");
          return [p, { sha256: hash(text), canonicalSha256: hash(text.replaceAll("\r\n", "\n")) }];
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
    productionActions: "catalog/schema reads only; zero production rows or actor RPC",
    environment:
      "unique guarded owned clone52322; source57322/template52322 read-only; inert Storage port only",
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
    const reviewedTables = [
      "supporter",
      "consent",
      "sponsorship_pledge",
      "sponsorship_preference",
      "animals",
      "sponsorship_payment_proof",
      "public_status_token",
      "audit_log",
      "admin_user",
      "auth.users",
      "supporter_consent_intent",
      "message",
      "sponsorship_delivery_outbox",
      "sponsorship_proof_submission_command",
    ];
    await assertSafeFixtureTables(db, reviewedTables);
    // Each actor/trigger path was read in full before this runner was authorized.
    // The exact recorded hashes fence stale manual review; the guard is additional.
    const reviewedNames = [
      "private.bump_sponsorship_followup_version",
      "private.bump_supporter_edit_version",
      "private.increment_sponsorship_proof_revision",
      "private.preserve_sponsorship_contact_submission",
      "private.preserve_sponsorship_financial_history",
      "private.snapshot_sponsorship_proof_contact",
      "private.sponsorship_cancel_transition",
      "private.sponsorship_proof_financial_transition",
      "public.enforce_current_animal_preference",
      "public.log_animal_mutation",
      "public.record_public_consent_intents",
      "public.set_updated_at",
      "private.queue_sponsorship_transition",
      "public.record_exact_sponsorship_payment_proof",
      "public.record_sponsorship_payment_proof",
      "private.has_admin_role",
      "private.normalize_public_animal_age",
      "private.is_valid_animal_public_profile",
      "public.set_animal_catalog_membership_defaults",
    ];
    const review = JSON.parse(
      await readFile(
        resolve(
          root,
          "docs/evidence/audit-remediation-20260927/r01-forward/task-3-reviewed-paths.json",
        ),
        "utf8",
      ),
    ) as { functions: { name: string; hash: string }[] };
    const actual = entries(capture.catalog, "functions")
      .filter((e) => reviewedNames.includes(e.schema + "." + e.name))
      .map((e) => ({ name: e.schema + "." + e.name, hash: e.bodyMd5 }));
    for (const f of actual)
      if (!review.functions.some((r) => r.name === f.name && r.hash === f.hash))
        throw new Error("Unreviewed function body: " + f.name);
    if (actual.length !== reviewedNames.length) throw new Error("Incomplete manual path metadata");
    receipt.reviewedFunctions = actual;
    const [ledger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    const rowState = async () => {
      const facts = [];
      for (const t of [
        "sponsorship_pledge",
        "sponsorship_payment_proof",
        "public_status_token",
        "payment",
        "donation",
        "audit_log",
        "message",
        "sponsorship_delivery_outbox",
      ]) {
        const [r] = await db.unsafe(
          `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from public.${t} t`,
        );
        facts.push([t, r]);
      }
      return hash(facts);
    };
    let preservedFacts: string | undefined;
    const initial = await manifest(capture.catalog);
    receipt.manifestBefore = {
      requirements: releaseManifest.length,
      issues: initial.issues.length,
    };
    if (!modern && initial.issues.length !== 44) throw new Error("Hosted baseline drift");
    if (green) {
      const dep = await readFile(resolve(root, "supabase/migrations", dependency), "utf8");
      if (hash(dep) !== "ca4879d9c93d413941ccc5a13c17d4eba1f70b293169665583e4b23973d1a5f3")
        throw new Error("Accepted Task2 dependency bytes differ");
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(dep);
      });
      const preferenceSql = await readFile(
        resolve(root, "supabase/migrations", preferenceDependency),
        "utf8",
      );
      if (
        hash(preferenceSql) !== "28a93d8679a222f89d193af055285c24e86df06f227a7c527df26829957e9867"
      )
        throw new Error("Reviewed preference dependency bytes differ");
      const beforePreference = await snapshot(db);
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(preferenceSql);
      });
      const afterPreference = await snapshot(db);
      if (
        hash(exceptReviewedPreferenceBody(beforePreference)) !==
        hash(exceptReviewedPreferenceBody(afterPreference))
      )
        throw new Error("Preference dependency changed unrelated catalog");
      const preferenceApply = () =>
        db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx.unsafe(preferenceSql);
        });
      await preferenceApply();
      if (hash(afterPreference) !== hash(await snapshot(db)))
        throw new Error("Preference dependency replay drift");
      const preferenceRejected = [];
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
            await tx.unsafe(preferenceSql);
          });
        } catch (e) {
          code = (e as { errno?: string }).errno ?? "unexpected";
        }
        const preserved = hash(afterPreference) === hash(await snapshot(db));
        if (code !== "55000" || !preserved)
          throw new Error("Preference preflight rollback failed " + label + " " + code);
        preferenceRejected.push({ case: label, sqlState: code, preserved });
      }
      receipt.preferenceDependency = {
        file: preferenceDependency,
        sha256: hash(preferenceSql),
        beforeDefinition: entries(beforePreference, "functions").find(
          (f) => f.schema === "public" && f.name === "enforce_current_animal_preference",
        ),
        afterDefinition: entries(afterPreference, "functions").find(
          (f) => f.schema === "public" && f.name === "enforce_current_animal_preference",
        ),
        onlyReviewedFunctionBodyDelta: true,
        allOtherCatalogPreserved: true,
        firstApply: 0,
        secondApply: 0,
        rejected: preferenceRejected,
      };
      // Pre-existing synthetic money/proof/contact/event facts must survive DDL.
      const legacySupporter = crypto.randomUUID(),
        legacyPledge = crypto.randomUUID();
      await db`insert into public.supporter(id,name,email) values(${legacySupporter}::uuid,'Synthetic legacy',${legacySupporter + "@example.invalid"})`;
      await db`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language,contact_submission) values(${legacyPledge}::uuid,${legacySupporter}::uuid,'100',10000,'en','{"name":"Synthetic legacy","source":"immutable synthetic fixture"}'::jsonb)`;
      await db`insert into public.sponsorship_payment_proof(pledge_id,storage_path,payment_method,amount_cents,payment_date) values(${legacyPledge}::uuid,${legacyPledge + "/proof/legacy.pdf"},'fps',10000,'2026-09-25')`;
      await db`insert into public.public_status_token(token_hash,entity_type,entity_id,expires_at) values(${hash(legacyPledge)},'sponsorship_pledge',${legacyPledge}::uuid,'2099-01-01')`;
      const before = await snapshot(db),
        facts = await rowState(),
        text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
      const dependencyManifest = await manifest(before);
      receipt.manifestBeforeTask3 = {
        requirements: releaseManifest.length,
        issues: dependencyManifest.issues.length,
      };
      if (!modern && dependencyManifest.issues.length !== 41)
        throw new Error("Accepted dependency must leave exactly 41 gaps before Task3");
      preservedFacts = facts;
      if (
        /\b(?:ALTER\s+(?:ROLE|DATABASE|SYSTEM|DEFAULT)|DROP\s+(?:SCHEMA|TABLE)|net\.|http_|dblink|cron\.)/i.test(
          text,
        )
      )
        throw new Error("Out-of-scope migration primitive");
      const apply = async () =>
        db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx.unsafe(text);
        });
      await apply();
      const first = await snapshot(db);
      if (hash(unaffected(before)) !== hash(unaffected(first))) {
        const old = unaffected(before) as Record<string, unknown>,
          next = unaffected(first) as Record<string, unknown>;
        receipt.unexpectedDrift = Object.keys(old)
          .filter((k) => hash(old[k]) !== hash(next[k]))
          .map((k) => ({
            facet: k,
            added: ((next[k] ?? []) as Entry[])
              .filter((e) => !((old[k] ?? []) as Entry[]).some((p) => hash(p) === hash(e)))
              .map((e) => ({ schema: e.schema, name: e.name, table: e.table, hash: hash(e) })),
            removed: ((old[k] ?? []) as Entry[])
              .filter((e) => !((next[k] ?? []) as Entry[]).some((p) => hash(p) === hash(e)))
              .map((e) => ({ schema: e.schema, name: e.name, table: e.table, hash: hash(e) })),
          }));
        throw new Error("Unrelated catalog changed; sanitized facet diagnostic in receipt");
      }
      if (modern && hash(before) !== hash(first))
        throw new Error("Modern existing good metadata changed");
      await db.unsafe(
        "create temporary table sponsorship_proof_upload_intent(marker text);insert into pg_temp.sponsorship_proof_upload_intent values('synthetic shadow');set search_path=pg_temp,public",
      );
      await apply();
      if (hash(await snapshot(db)) !== hash(first) || (await rowState()) !== facts)
        throw new Error("Second apply metadata/data drift");
      const [shadow] = await db.unsafe(
        "select marker from pg_temp.sponsorship_proof_upload_intent",
      );
      if (shadow.marker !== "synthetic shadow") throw new Error("Shadow changed");
      await db.unsafe("drop table pg_temp.sponsorship_proof_upload_intent;set search_path=''");
      const mutations = [
        ["client grant", "grant select on public.sponsorship_proof_upload_intent to anon"],
        [
          "owner ACL drift",
          "revoke select on public.sponsorship_proof_upload_intent from postgres",
        ],
        [
          "service grant option",
          "grant update on public.sponsorship_staff_proof_upload_intent to service_role with grant option",
        ],
        [
          "missing service right",
          "revoke delete on public.sponsorship_proof_upload_intent from service_role",
        ],
        [
          "function public execute",
          "grant execute on function public.create_public_sponsorship_pledge(uuid,jsonb,jsonb,jsonb,jsonb) to public",
        ],
        [
          "wrong index",
          "drop index public.sponsorship_proof_upload_intent_cleanup_idx;create index sponsorship_proof_upload_intent_cleanup_idx on public.sponsorship_proof_upload_intent(expires_at)",
        ],
        [
          "wrong trigger",
          "alter table public.sponsorship_payment_proof disable trigger sponsorship_proof_upload_submitted",
        ],
        [
          "wrong function body",
          "create or replace function public.reserve_staff_sponsorship_proof_upload(p_pledge_id uuid,p_storage_path text) returns void language plpgsql set search_path='' as $$ begin return; end $$",
        ],
      ];
      const rejected = [];
      for (const [label, mutation] of mutations) {
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
        const preserved = hash(await snapshot(db)) === hash(first) && (await rowState()) === facts;
        if (code !== "55000" || !preserved)
          throw new Error("Preflight rollback failed " + label + " " + code);
        rejected.push({ case: label, sqlState: code, preserved });
      }
      const final = await manifest(first);
      if (!modern && final.issues.length !== 33)
        throw new Error("Expected gaps44->33 including acceptedTask2 dependency");
      receipt.manifestAfter = { requirements: releaseManifest.length, issues: final.issues.length };
      receipt.migration = {
        file,
        sha256: hash(text),
        firstApply: 0,
        secondApply: 0,
        unrelatedCatalogPreserved: true,
        modernTask3TargetsAndAllOtherCatalogPreserved: modern,
        modernIntentionalPreferenceBodyDelta: modern,
        preexistingRowsPreserved: (await rowState()) === facts,
        tempShadowPreserved: true,
        rejected,
        dependency: { file: dependency, sha256: hash(dep), task1Applied: false },
      };
      await assertSafeFixtureTables(db, [...reviewedTables, ...tables]);
    }
    const args = [
      "bun",
      "test",
      "src/lib/sponsorship/submissionIntent.database.test.ts",
      "--timeout",
      "30000",
    ];
    if (!green) args.push("--test-name-pattern", "current caller");
    const p = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, R01_SPONSORSHIP_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    const log = stdout + stderr;
    await writeFile(resolve(output, `task-3-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (!green && exit !== 0 && log.includes("42P01")) receipt.watchedRed = true;
    else if (!green) throw new Error("Actual missing relation RED absent");
    if (green && exit !== 0) throw new Error("Task3 actual DB tests failed");
    const [afterLedger] =
      await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`;
    if (afterLedger.hash !== ledger.hash) throw new Error("Synthetic ledger changed");
    receipt.ledgerPreserved = true;
    if (preservedFacts && (await rowState()) !== preservedFacts)
      throw new Error("Actor tests changed pre-existing synthetic facts");
    receipt.preexistingSyntheticFactsPreservedAfterTests = green;
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
    receipt.cleanup = "exact owned clone normally dropped; no force or session termination";
    receipt.completedAt = new Date().toISOString();
    receipt.testedExecutableBlobsPreserved = hash(await blobs()) === hash(frozen);
    await writeFile(
      resolve(output, `task-3-${mode}-db.json`),
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
