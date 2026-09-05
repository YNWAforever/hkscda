import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
if (process.env.COMPLETION_LOCAL_RESTORE !== "1")
  throw new Error("Explicit disposable restore opt-in required");
const sourceName = "supabase_db_hkscda-completion-20260905",
  targetName = "supabase_db_hkscda-completion-restore-20260905";
function command(args: string[], stdin?: Uint8Array) {
  const r = Bun.spawnSync(args, { stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    mkdirSync("supabase/.temp/completion-restore/diagnostics", { recursive: true });
    writeFileSync("supabase/.temp/completion-restore/diagnostics/command-error.txt", r.stderr);
    throw new Error(
      `Local rehearsal command ${args[0]} ${args[1]} failed; inspect the isolated command before retrying`,
    );
  }
  return r.stdout;
}
if (process.env.DOCKER_HOST && !/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))
  throw new Error("Remote Docker override forbidden");
const contexts = JSON.parse(command(["docker", "context", "inspect"]).toString());
if (!/^(npipe:\/\/|unix:\/\/)/.test(contexts[0]?.Endpoints?.docker?.Host ?? ""))
  throw new Error("Local Docker socket required");
for (const [name, port] of [
  [sourceName, "55322"],
  [targetName, "55622"],
]) {
  const data = JSON.parse(command(["docker", "inspect", name]).toString())[0];
  if (
    data.Name !== "/" + name ||
    !data.State.Running ||
    !data.HostConfig.PortBindings?.["5432/tcp"]?.some((binding: any) => binding.HostPort === port)
  )
    throw new Error("Exact disposable container missing");
}
async function config(path: string, port: number) {
  const rows = (await readFile(path, "utf8")).trim().split(/\r?\n/);
  const value = JSON.parse(rows.at(-1)!);
  if (value.API_URL !== `http://127.0.0.1:${port}`) throw new Error("Unexpected local API");
  return value;
}
const a = await config("supabase/.temp/completion-local/start.raw.log", 55321),
  b = await config("supabase/.temp/completion-restore/start.raw.log", 55621);
const source = createClient(a.API_URL, a.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  target = createClient(b.API_URL, b.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:55322/postgres");
const restored = new SQL("postgresql://postgres:postgres@127.0.0.1:55622/postgres");
const marker = "restore-" + crypto.randomUUID(),
  password = crypto.randomUUID() + "Aa1!";
let actor: string | undefined;
const objectPath = marker + "/pixel.png";
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);
const report: any = {
  fixtureId: marker,
  source: "hkscda-completion-20260905",
  target: "hkscda-completion-restore-20260905",
  startedAt: new Date().toISOString(),
  scope:
    "Synthetic local schema/data/auth/password sign-in/Storage bytes rehearsal; no production backup or owner RPO/RTO acceptance",
};
await mkdir("docs/evidence/restore-local", { recursive: true });
await mkdir("supabase/.temp/completion-restore/backup", { recursive: true });
try {
  const user = await source.auth.admin.createUser({
    email: marker + "@example.invalid",
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  actor = user.data.user.id;
  await db`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${marker + "@example.invalid"},'staff','active')`;
  const [supporter] =
    await db`insert into public.supporter(name,email,language,source) values(${marker},${marker + "@example.invalid"},'en',${marker}) returning id`;
  await db`insert into public.donation(supporter_id,amount_cents,purpose,type,status,method,receipt_requested) values(${supporter.id}::uuid,12300,'medical','one_time','succeeded','manual',false)`;
  const upload = await source.storage
    .from("content-media-private")
    .upload(objectPath, bytes, { contentType: "image/png", upsert: false });
  if (upload.error) throw upload.error;
  // Reuse the existing data backup command with an explicit fixed disposable URL.
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(
        key,
      ),
    ),
  ) as Record<string, string>;
  childEnv.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  const backup = Bun.spawnSync(["bun", "--no-env-file", "scripts/backup-database.mjs"], {
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  report.existingDataBackupExit = backup.exitCode;
  if (backup.exitCode !== 0) throw new Error("Existing local backup command failed");
  // Explicit supplement includes auth and Storage metadata; bytes are a separate artifact.
  const dump = command([
    "docker",
    "exec",
    sourceName,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--data-only",
    "--disable-triggers",
    "--schema=public",
    "--schema=private",
    "--schema=auth",
    "--schema=storage",
  ]);
  await writeFile("supabase/.temp/completion-restore/backup/data-auth-storage.sql", dump);
  await writeFile("supabase/.temp/completion-restore/backup/pixel.png", bytes);
  report.backupBytes = dump.length;
  report.backupSha256 = createHash("sha256").update(dump).digest("hex");
  const started = performance.now();
  // Target only: clear migration-seeded rows before loading the reviewed schema's data.
  const truncate = `DO $$ DECLARE r record; BEGIN FOR r IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','private','auth','storage') LOOP EXECUTE format('TRUNCATE TABLE %I.%I CASCADE',r.schemaname,r.tablename); END LOOP; END $$;`;
  command(
    [
      "docker",
      "exec",
      "-i",
      targetName,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    Buffer.from(truncate),
  );
  command(
    [
      "docker",
      "exec",
      "-i",
      targetName,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    await readFile("supabase/.temp/completion-restore/backup/data-auth-storage.sql"),
  );
  const restoredBytes = await readFile("supabase/.temp/completion-restore/backup/pixel.png");
  const put = await target.storage
    .from("content-media-private")
    .upload(objectPath, restoredBytes, { contentType: "image/png", upsert: true });
  if (put.error) throw put.error;
  const [row] =
    await restored`select count(*)::int count,sum(d.amount_cents)::int amount from public.supporter s join public.donation d on d.supporter_id=s.id where s.source=${marker}`;
  if (row.count !== 1 || row.amount !== 12300) throw new Error("Restored relationship mismatch");
  report.relationships = row;
  const authVerifier = createClient(b.API_URL, b.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signin = await authVerifier.auth.signInWithPassword({
    email: marker + "@example.invalid",
    password,
  });
  if (signin.error || signin.data.user?.id !== actor)
    throw new Error("Restored auth sign-in failed");
  report.authPasswordSignIn = true;
  const signed = await target.storage.from("content-media-private").createSignedUrl(objectPath, 60);
  if (signed.error) throw signed.error;
  const fetched = await fetch(signed.data.signedUrl);
  const recovered = Buffer.from(await fetched.arrayBuffer());
  if (!fetched.ok || !recovered.equals(bytes)) throw new Error("Restored object mismatch");
  report.storageBytesMatch = true;
  const denied = await fetch(
    b.API_URL + "/storage/v1/object/public/content-media-private/" + objectPath,
  );
  if (denied.ok) throw new Error("Private restored object exposed");
  report.privatePublicUrlDenied = denied.status;
  const [versions] =
    await restored`select count(*)::int count from supabase_migrations.schema_migrations`;
  report.migrationCount = versions.count;
  report.restoreVerificationMs = performance.now() - started;
  report.status = "passed";
} finally {
  const cleanupErrors: string[] = [];
  async function cleanup(label: string, operation: () => Promise<unknown>) {
    try {
      await operation();
    } catch {
      cleanupErrors.push(label);
    }
  }
  for (const [label, sql, api] of [
    ["source", db, source],
    ["target", restored, target],
  ] as const) {
    await cleanup(label + " object", async () => {
      const value = await api.storage.from("content-media-private").remove([objectPath]);
      if (value.error) throw value.error;
    });
    await cleanup(label + " donations", async () => {
      await sql`delete from public.donation where supporter_id in (select id from public.supporter where source=${marker})`;
    });
    await cleanup(label + " supporter", async () => {
      await sql`delete from public.supporter where source=${marker}`;
    });
    if (actor) {
      await cleanup(label + " admin", async () => {
        await sql`delete from public.admin_user where auth_user_id=${actor}::uuid`;
      });
      await cleanup(label + " auth", async () => {
        const value = await api.auth.admin.deleteUser(actor!);
        if (value.error && value.error.status !== 404) throw value.error;
      });
    }
  }
  await Promise.allSettled([db.close(), restored.close()]);
  report.cleanupErrors = cleanupErrors;
  report.completedAt = new Date().toISOString();
  await writeFile("docs/evidence/restore-local/result.json", JSON.stringify(report, null, 2));
  if (cleanupErrors.length)
    throw new Error("Restore fixture cleanup incomplete; see sanitized result");
}
