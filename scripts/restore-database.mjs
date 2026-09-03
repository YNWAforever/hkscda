import { existsSync, readFileSync } from "node:fs";

// This script only restores into the LOCAL Supabase dev stack -- it has no
// code path capable of reaching a remote/production target. Restoring into
// production is a deliberate, human-run procedure documented in
// docs/backup-restore-runbook.md, using your own Postgres client tools and
// credentials, not this script.
const dumpFile = process.argv[2];
if (!dumpFile) {
  console.error("Usage: bun run restore:db <path-to-dump-file>");
  process.exit(1);
}
if (!existsSync(dumpFile)) {
  console.error(`Dump file not found: ${dumpFile}`);
  process.exit(1);
}

// A container named `supabase_db_hkscda` matching by name alone isn't a real
// safety guarantee: `docker ps` obeys `DOCKER_HOST`/the active Docker context,
// so if either is pointed at a remote daemon (plausible on a dev machine also
// used for other Docker work) and a same-named container happens to exist
// there, the checks below would otherwise pass and this script would restore
// into that remote target with no warning. Refuse to proceed unless we can
// positively confirm the resolved Docker endpoint is local.
function isLocalDockerHost(host) {
  if (!host) return true; // empty/unset means the platform default local socket
  return (
    host.startsWith("unix://") ||
    host.startsWith("npipe://") ||
    /^tcp:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(host)
  );
}

const dockerHostEnv = process.env.DOCKER_HOST;
if (dockerHostEnv && !isLocalDockerHost(dockerHostEnv)) {
  console.error(
    `DOCKER_HOST is set to a non-local address (${dockerHostEnv}). This script only ` +
      "restores into the local Supabase dev stack -- refusing to proceed against a remote Docker daemon.",
  );
  process.exit(1);
}

const contextResult = Bun.spawnSync(["docker", "context", "inspect"], {
  stdout: "pipe",
  stderr: "pipe",
});
if (contextResult.exitCode !== 0) {
  console.error(
    `Could not verify the active Docker context: ${contextResult.stderr.toString().trim()}. Is Docker running?`,
  );
  process.exit(1);
}

let dockerHost;
try {
  const contexts = JSON.parse(contextResult.stdout.toString());
  dockerHost = contexts?.[0]?.Endpoints?.docker?.Host;
} catch {
  console.error(
    "Could not parse `docker context inspect` output; refusing to proceed without " +
      "confirming the active Docker daemon is local.",
  );
  process.exit(1);
}

if (!isLocalDockerHost(dockerHost)) {
  console.error(
    `The active Docker context points at a non-local daemon (${dockerHost}). This script ` +
      "only restores into the local Supabase dev stack -- refusing to proceed against a remote Docker daemon.",
  );
  process.exit(1);
}

const psResult = Bun.spawnSync(
  ["docker", "ps", "--filter", "name=supabase_db_hkscda", "--format", "{{.Names}}"],
  { stdout: "pipe", stderr: "pipe" },
);
if (psResult.exitCode !== 0) {
  console.error(`Docker command failed: ${psResult.stderr.toString().trim()}. Is Docker running?`);
  process.exit(1);
}
const container = psResult.stdout.toString().trim();
if (!container) {
  console.error(
    "No running container named supabase_db_hkscda found. This script only " +
      "restores into the local dev stack -- run `bunx supabase start` first.",
  );
  process.exit(1);
}

console.log(`Restoring ${dumpFile} into local container ${container}...`);
console.log(
  "Note: 'duplicate key'/'already exists' errors below for migration-seeded\n" +
    "reference tables (e.g. adoption_fees, site_config, care_topics) are\n" +
    "EXPECTED when restoring onto a database that has already run its\n" +
    "migrations -- those rows already exist from the migration itself.\n" +
    "Any OTHER kind of error should be investigated. This command's exit\n" +
    "code is not a reliable success signal either way -- verify success by\n" +
    "checking your actual data afterward.\n",
);

const dumpContent = readFileSync(dumpFile);
const result = Bun.spawnSync(
  ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres"],
  { stdin: dumpContent, stdout: "inherit", stderr: "inherit" },
);

console.log(
  `\nRestore command finished (exit code ${result.exitCode}). Review the output above, then verify your data.`,
);
