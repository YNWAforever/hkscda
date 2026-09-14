import { SQL } from "bun";
import {
  assessVolunteerCompatibility,
  requiredVolunteerCapabilities,
  type Capability,
} from "../src/lib/volunteers/compatibility/check";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const enabled = process.env.HKSCDA_MIGRATION_REHEARSAL === "1";
assert.ok(enabled, "Explicit disposable rehearsal required");
const container = "supabase_db_hkscda-policy-20260913";
async function command(args: string[], input?: string) {
  const p = Bun.spawn(args, {
    stdin: input ? new Blob([input]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw Error(`Local ${args[0]} ${args[1]} failed: ${err.slice(0, 1500)}`);
  return out;
}
const endpoint = JSON.parse(
  await command(["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
);
assert.match(endpoint, /^(npipe|unix):\/\//);
if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(npipe|unix):\/\//);
const ports = JSON.parse(
  await command(["docker", "inspect", container, "--format", "{{json .NetworkSettings.Ports}}"]),
);
assert.ok(ports["5432/tcp"].every((v: { HostPort: string }) => v.HostPort === "56322"));
const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const prefix = "hkscda_ops_rehearsal_" + nonce;
const admin = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/postgres", { max: 1 });
const platform = await command([
  "docker",
  "exec",
  container,
  "pg_dump",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "--schema-only",
  "--no-owner",
  "--no-privileges",
  "--schema=auth",
  "--schema=storage",
  "--schema=extensions",
]);
const extensions =
  await admin`select extname,nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname<>'plpgsql'`;
const allFiles = (await readdir("supabase/migrations"))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();
// Historical baseline is verified first; new additive release files then apply in order.
const files = allFiles.filter((f) => f <= "20260913182552_volunteer_legacy_list_alias_fix.sql");
const cutoff = "20260913180745_volunteer_admin_directory_read.sql";
const artifact = {
  startedAt: new Date().toISOString(),
  source: "dedicated local56322 platform schema only; no production data",
  migrationFiles: allFiles.length,
  runs: [] as unknown[],
};
await mkdir("docs/evidence/operations-release-20260915", { recursive: true });
async function install(mode: "fresh" | "upgrade") {
  const name = prefix + "_" + mode;
  assert.match(name, /^hkscda_ops_rehearsal_[a-f0-9]{10}_(fresh|upgrade)$/);
  await admin.unsafe(`create database "${name}" template template0`);
  const db = new SQL(`postgresql://postgres:postgres@127.0.0.1:56322/${name}`, { max: 1 });
  const applied: string[] = [];
  try {
    await db.unsafe(
      "create schema if not exists extensions; create schema if not exists graphql; create schema if not exists vault;",
    );
    for (const e of extensions) {
      if (["pg_graphql", "supabase_vault"].includes(e.extname)) continue;
      await db.unsafe(`create extension if not exists "${e.extname}" with schema "${e.nspname}"`);
    }
    await command(
      [
        "docker",
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        name,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      platform
        .replaceAll("CREATE SCHEMA ", "CREATE SCHEMA IF NOT EXISTS ")
        .replace(/^CREATE POLICY [\s\S]*?;\n/gm, ""),
    );
    await db.unsafe(
      "create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);",
    );
    const apply = async (file: string) => {
      await db.begin(async (tx) => {
        await tx.unsafe(
          (await readFile("supabase/migrations/" + file, "utf8")).replace(/^\uFEFF/, ""),
        );
        await tx`insert into supabase_migrations.schema_migrations(version,name)values(${file.split("_")[0]},${file})`;
      });
      applied.push(file);
    };
    for (const file of files.filter((f) => mode === "fresh" || f < cutoff)) await apply(file);
    const actor = crypto.randomUUID();
    await db`insert into auth.users(id,email,email_confirmed_at)values(${actor}::uuid,${"ops-" + nonce + "@example.invalid"},clock_timestamp())`;
    await db`insert into public.admin_user(auth_user_id,email,role,status)values(${actor}::uuid,${"ops-" + nonce + "@example.invalid"},'admin','active')`;
    const before: Record<string, unknown> = {};
    if (mode === "upgrade") {
      before.directoryMissing = (
        await db`select to_regprocedure('public.volunteer_admin_directory_read(uuid,jsonb)') is null missing`
      )[0].missing;
      assert.equal(before.directoryMissing, true);
      try {
        await db`select public.volunteer_legacy_identity_command(${actor}::uuid,'{"action":"list_legacy"}'::jsonb)`;
        throw Error("Expected recorded42702 before aliasfix");
      } catch (error) {
        const code =
          error && typeof error === "object"
            ? "errno" in error
              ? error.errno
              : "code" in error
                ? error.code
                : undefined
            : undefined;
        assert.equal(code, "42702");
        before.legacyError = code;
      }
      for (const file of files.filter((f) => f >= cutoff)) await apply(file);
    }
    await db`select public.volunteer_profile_command(${actor}::uuid, '{"action":"claim","display_name":"Synthetic zero booking","birth_date":"1990-01-01"}'::jsonb)`;
    const directory = (
      await db`select public.volunteer_admin_directory_read(${actor}::uuid,'{"limit":25}'::jsonb) result`
    )[0].result;
    const legacy = (
      await db`select public.volunteer_legacy_identity_command(${actor}::uuid,'{"action":"list_legacy"}'::jsonb) result`
    )[0].result;
    assert.ok(Array.isArray(directory.profiles));
    assert.equal(directory.profiles.length, 1);
    assert.ok(Array.isArray(legacy.registrations));
    const grants =
      await db`select p.proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('volunteer_admin_directory_read','volunteer_legacy_identity_command')`;
    for (const grant of grants) {
      assert.equal(grant.anon, false);
      assert.equal(grant.authenticated, false);
      assert.equal(grant.service, true);
    }
    for (const file of allFiles.filter((f) => !files.includes(f))) await apply(file);
    const capabilities: Capability[] = [];
    for (const signature of requiredVolunteerCapabilities) {
      const row = (
        await db`select to_regprocedure(${"public." + signature}) is not null as exists,coalesce(has_function_privilege('service_role',to_regprocedure(${"public." + signature}),'execute'),false) as service,coalesce(has_function_privilege('anon',to_regprocedure(${"public." + signature}),'execute'),false) as anonymous,coalesce(has_function_privilege('authenticated',to_regprocedure(${"public." + signature}),'execute'),false) as authenticated`
      )[0];
      capabilities.push({
        signature,
        exists: row.exists,
        service: row.service,
        anonymous: row.anonymous,
        authenticated: row.authenticated,
      });
    }
    const compatibility = assessVolunteerCompatibility({
      capabilities,
      migrations: applied.map((f) => f.split("_")[0]),
      legacyAliasSafe: true,
    });
    assert.equal(compatibility.ready, true, JSON.stringify(compatibility.blockers));
    return {
      mode,
      database: name,
      applied: applied.length,
      compatibility,
      before,
      directory: "loaded",
      legacy: "loaded",
      grants,
      result: "passed",
    };
  } catch (error) {
    return {
      mode,
      database: name,
      applied: applied.length,
      lastApplied: applied.at(-1),
      error: error instanceof Error ? error.message : "unknown",
      result: "failed",
    };
  } finally {
    await db.close();
  }
}
try {
  for (const mode of ["upgrade", "fresh"] as const) {
    const result = await install(mode);
    artifact.runs.push(result);
    console.log(JSON.stringify(result));
    await writeFile(
      "docs/evidence/operations-release-20260915/migration-rehearsal.json",
      JSON.stringify(artifact, null, 2) + "\n",
    );
    if (result.result === "failed") break;
  }
} finally {
  await admin.close();
}
if (artifact.runs.some((r) => (r as { result: string }).result !== "passed")) process.exitCode = 1;
