import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const container = "supabase_db_hkscda-audit-integration-fresh";
const [details] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
assert.equal(details.Name, "/" + container);
assert.ok(details.Config.Labels["com.supabase.cli.project"] === "hkscda-audit-integration-fresh");
const sql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input, encoding: "utf8" },
  ).trim();
assert.equal(
  sql("select count(*) from private.supporter_recovery_challenge;"),
  "0",
  "Only the empty task-owned local candidate may be rehearsed",
);
const snapshot = () =>
  sql(`select jsonb_build_object(
  'auth_users',(select count(*) from auth.users),
  'supporters',(select count(*) from public.supporter),
  'ledger',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.proacl::text) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_supporter_recovery_challenge','consume_supporter_recovery_challenge','invalidate_supporter_recovery_challenge')),
  'table_oid','private.supporter_recovery_challenge'::regclass::oid,
  'challenge_rows',(select count(*) from private.supporter_recovery_challenge));`);
const before = snapshot();
const migration = await readFile(
  "supabase/migrations/20260930120000_supporter_recovery_single_use.sql",
);
const catalog = (await readFile("scripts/test-supporter-recovery-catalog.sql", "utf8"))
  .replace(/^begin;\s*$/im, "")
  .replace(/^rollback;\s*$/im, "");
sql(`begin;
drop function public.create_supporter_recovery_challenge(uuid,uuid,text,text,text);
drop function public.consume_supporter_recovery_challenge(uuid,text,text);
drop function public.invalidate_supporter_recovery_challenge(uuid);
drop table private.supporter_recovery_challenge;
${migration.toString("utf8")}
${catalog}
rollback;`);
assert.equal(
  snapshot(),
  before,
  "Full candidate rollback must preserve local catalog and row counts",
);
const result = {
  status: "passed",
  environment: "isolated Postgres 52322 / exact empty task-owned candidate / no production data",
  migrationSha256: createHash("sha256").update(migration).digest("hex"),
  wholeFileTransactionRollback: true,
  signatureGrantsRls: true,
  authSupporterLedgerCatalogUnchanged: true,
  backfillRows: 0,
  productionRequests: 0,
};
await writeFile(
  "docs/evidence/audit-remediation-20260927/t22-migration-rehearsal.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
