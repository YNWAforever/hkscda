import { SQL } from "bun";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
const container = "supabase_db_hkscda-policy-20260913";
const target = "hkscda_baseline_parity_20260913";
async function command(args: string[], output?: string) {
  const p = Bun.spawn(args, { stdout: output ? Bun.file(output) : "pipe", stderr: "pipe" });
  const [error, stdout] = await Promise.all([
    new Response(p.stderr).text(),
    output ? Promise.resolve("") : new Response(p.stdout).text(),
  ]);
  if (await p.exited) throw new Error(error || stdout);
  return stdout;
}
const ports = await command(["docker", "port", container, "5432/tcp"]);
if (!ports.includes(":56322")) throw new Error("Wrong dedicated container");
await mkdir(".local-policy-test/baseline-parity", { recursive: true });
const exists = await command([
  "docker",
  "exec",
  container,
  "psql",
  "-U",
  "supabase_admin",
  "-d",
  "postgres",
  "-Atc",
  `select 1 from pg_database where datname='${target}'`,
]);
if (exists.trim()) {
  if (!Bun.argv.includes("--replace-owned-comparison"))
    throw new Error("Comparison database exists");
  await command([
    "docker",
    "exec",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `drop database ${target}`,
  ]);
}
await command(
  [
    "docker",
    "exec",
    container,
    "pg_dump",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "--schema-only",
    "--exclude-schema=public",
    "--exclude-schema=private",
    "--exclude-schema=supabase_migrations",
  ],
  ".local-policy-test/baseline-parity/platform.sql",
);
const platformPath = ".local-policy-test/baseline-parity/platform.sql";
const platform = await readFile(platformPath, "utf8");
await writeFile(platformPath, platform.replace(/^CREATE POLICY .* ON storage\.[^\n]*\r?\n/gm, ""));
await command([
  "docker",
  "exec",
  container,
  "psql",
  "-U",
  "supabase_admin",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `create database ${target} owner postgres template template0`,
]);
await command([
  "docker",
  "cp",
  ".local-policy-test/baseline-parity/platform.sql",
  `${container}:/tmp/hkscda-baseline-platform-20260913.sql`,
]);
await command([
  "docker",
  "exec",
  container,
  "psql",
  "-U",
  "supabase_admin",
  "-d",
  target,
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  "/tmp/hkscda-baseline-platform-20260913.sql",
]);
const db = new SQL(`postgresql://postgres:postgres@127.0.0.1:56322/${target}`, {
  max: 1,
  prepare: false,
});
try {
  // Match Supabase public-schema initialization before replaying application migrations.
  await db.unsafe(`grant usage on schema public to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;`);
  const migrations = (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql") && x < "20260913")
    .sort();
  if (migrations.length !== 63) throw new Error("Expected exact63 baseline migrations");
  for (const name of migrations) {
    const sql = (await readFile("supabase/migrations/" + name, "utf8")).replace(/^\uFEFF/, "");
    await db.begin((tx) => tx.unsafe(sql));
    console.log(name);
  }
  await writeFile(
    ".local-policy-test/baseline-parity/replay.json",
    JSON.stringify({ target, container, migrations, production_mutated: false }, null, 2),
  );
} finally {
  await db.close();
}
