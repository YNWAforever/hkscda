import { SQL } from "bun";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.HKSCDA_MIGRATION_REHEARSAL, "1");
const artifact = await Bun.file(
  "docs/evidence/operations-release-20260915/migration-rehearsal.json",
).json();
const source = artifact.runs.find(
  (r: { mode: string; result: string }) => r.mode === "fresh" && r.result === "passed",
)?.database;
assert.match(source, /^hkscda_ops_rehearsal_[a-f0-9]{10}_fresh$/);
const target = "hkscda_ops_restore_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
assert.match(target, /^hkscda_ops_restore_[a-f0-9]{10}$/);
const container = "supabase_db_hkscda-policy-20260913";
async function run(args: string[], input?: Uint8Array) {
  const p = Bun.spawn(args, {
    stdin: input ? new Blob([input]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).arrayBuffer(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw Error("Local backup/restore failed: " + err.slice(0, 500));
  return new Uint8Array(out);
}
const endpoint = JSON.parse(
  new TextDecoder().decode(
    await run(["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  ),
);
assert.match(endpoint, /^(npipe|unix):\/\//);
if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(npipe|unix):\/\//);
const ports = JSON.parse(
  new TextDecoder().decode(
    await run(["docker", "inspect", container, "--format", "{{json .NetworkSettings.Ports}}"]),
  ),
);
assert.ok(ports["5432/tcp"].every((p: { HostPort: string }) => p.HostPort === "56322"));
const admin = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/postgres", { max: 1 });
try {
  const backup = await run([
    "docker",
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-Fc",
    "-d",
    source,
  ]);
  await Bun.write(".local-policy-test/operations-rehearsal-backup.dump", backup);
  await admin.unsafe(`create database "${target}" template template0`);
  await run(
    [
      "docker",
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "postgres",
      "--exit-on-error",
      "-d",
      target,
    ],
    backup,
  );
  const restored = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/" + target, { max: 1 });
  try {
    const counts = (
      await restored`select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from volunteer_profile)::int profiles`
    )[0];
    assert.equal(counts.migrations, artifact.migrationFiles);
    assert.equal(counts.profiles, 1);
    const grants = (
      await restored`select has_function_privilege('anon','public.volunteer_bulk_command(uuid,jsonb)','execute') anonymous,has_function_privilege('service_role','public.volunteer_bulk_command(uuid,jsonb)','execute') service`
    )[0];
    assert.equal(grants.anonymous, false);
    assert.equal(grants.service, true);
    const result = {
      at: new Date().toISOString(),
      source,
      target,
      backupBytes: backup.byteLength,
      counts,
      grants,
      passed: true,
      scope:
        "Disposable local rehearsal databases only. No application/production rollback performed. Restore kept SQL grants and factual rows.",
    };
    await writeFile(
      "docs/evidence/operations-release-20260915/restore-rehearsal.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  } finally {
    await restored.close();
  }
} finally {
  await admin.close();
}
