import { SQL } from "bun";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Explicit isolated fixture authorization required");
const sixPhase = process.argv.includes("--six-phase");
const container = "supabase_db_hkscda-policy-20260913",
  target = sixPhase ? "hkscda_restore_six_phase_20260913" : "hkscda_restore_20260913",
  privateDir = sixPhase
    ? ".local-policy-test/restore-six-phase"
    : ".local-policy-test/restore-rehearsal",
  artifact = sixPhase
    ? "docs/evidence/admin-volunteer-settings/six-phase-restore.json"
    : "docs/evidence/admin-volunteer-settings/local-restore-rehearsal.json";
async function command(args: string[]) {
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [out, error, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${error.slice(0, 3000)}`);
  return out.trim();
}
const host = process.env.DOCKER_HOST;
const endpoint = await command([
  "docker",
  "context",
  "inspect",
  "--format",
  "{{json .Endpoints.docker.Host}}",
]);
const localHost = (value: string) => value.startsWith("npipe://") || value.startsWith("unix://");
if ((host && !localHost(host)) || !localHost(JSON.parse(endpoint)))
  throw new Error("Local Docker daemon required");
const ports = JSON.parse(
  await command(["docker", "inspect", container, "--format", "{{json .NetworkSettings.Ports}}"]),
);
if (!ports["5432/tcp"]?.every((entry: { HostPort: string }) => entry.HostPort === "56322"))
  throw new Error("Dedicated56322 container required");
const source = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/postgres", {
  max: 1,
  prepare: false,
});
let restored: SQL | undefined;
type Manifest = {
  schema: string;
  table: string;
  rows: number;
  row_sha256: string;
  id_sha256: string | null;
};
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
async function manifest(db: SQL): Promise<Manifest[]> {
  const tables =
    await db`select n.nspname as schema,c.relname as name,exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='id' and not a.attisdropped) as has_id from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p') and n.nspname in('public','auth','storage','supabase_migrations') order by n.nspname,c.relname`;
  const result: Manifest[] = [];
  for (const table of tables) {
    const sql = `select count(*)::integer rows,encode(extensions.digest(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),''),'sha256'),'hex') row_sha256,${table.has_id ? "encode(extensions.digest(coalesce(string_agg(id::text,E'\\n' order by id::text),''),'sha256'),'hex')" : "null::text"} id_sha256 from ${quote(table.schema)}.${quote(table.name)} r`;
    const row = (await db.unsafe(sql))[0];
    result.push({
      schema: table.schema,
      table: table.name,
      rows: row.rows,
      row_sha256: row.row_sha256,
      id_sha256: row.id_sha256,
    });
  }
  return result;
}
try {
  if ((await source`select 1 from pg_database where datname=${target}`).length)
    throw new Error("Restore destination already exists; refusing to overwrite it");
  await mkdir(privateDir, { recursive: true });
  await source.unsafe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await source`select pg_export_snapshot() as snapshot`)[0].snapshot;
  const before = await manifest(source);
  const startedAt = new Date().toISOString();
  const containerDump = "/tmp/hkscda-restore-20260913.dump",
    localDump = resolve(privateDir, "hkscda-20260913.dump");
  await command([
    "docker",
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--snapshot=" + snapshot,
    "--file=" + containerDump,
  ]);
  await source.unsafe("COMMIT");
  await command(["docker", "cp", container + ":" + containerDump, localDump]);
  await command([
    "docker",
    "exec",
    container,
    "createdb",
    "-U",
    "postgres",
    "--template=template0",
    target,
  ]);
  await command([
    "docker",
    "exec",
    container,
    "pg_restore",
    "-U",
    "supabase_admin",
    "--dbname=" + target,
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    containerDump,
  ]);
  restored = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/" + target, {
    max: 1,
    prepare: false,
  });
  const after = await manifest(restored);
  const mismatches = before.filter(
    (table, index) => JSON.stringify(table) !== JSON.stringify(after[index]),
  );
  if (after.length !== before.length || mismatches.length)
    throw new Error("Restored table/count/row/ID digest mismatch");
  const dump = await Bun.file(localDump).arrayBuffer();
  const digest = new Bun.CryptoHasher("sha256").update(dump).digest("hex");
  const proof = {
    status: "passed",
    scope: "Disposable local database only; no production or shared stack",
    source: { container, host: "127.0.0.1", port: 56322, database: "postgres" },
    destination: { container, database: target },
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    snapshot_consistency:
      "pg_export_snapshot in repeatable-read read-only transaction; pg_dump --snapshot and source digests share snapshot",
    backup: {
      format: "PostgreSQL custom archive",
      path: privateDir + "/hkscda-20260913.dump",
      bytes: dump.byteLength,
      sha256: digest,
    },
    restore: {
      schema_and_data: true,
      exit_on_error: true,
      overwrote_source: false,
      owner_and_acl_restoration: false,
    },
    verification: {
      table_count: before.length,
      total_rows: before.reduce((sum, t) => sum + t.rows, 0),
      mismatches: 0,
      tables: before,
    },
    limitations: [
      "Database records only; external Storage object bytes and provider state are outside pg_dump.",
      "Role definitions/ownership/ACL disaster recovery is not proved by this same-cluster no-owner/no-acl rehearsal.",
      "Synthetic local data only; this is not a production recovery-time or recovery-point guarantee.",
    ],
  };
  await mkdir(resolve(artifact, ".."), { recursive: true });
  await Bun.write(artifact, JSON.stringify(proof, null, 2));
  console.log(
    JSON.stringify({
      status: proof.status,
      tables: before.length,
      rows: proof.verification.total_rows,
      backup_bytes: dump.byteLength,
      evidence: artifact,
    }),
  );
} finally {
  await source.close({ timeout: 1 });
  if (restored) await restored.close({ timeout: 1 });
}
