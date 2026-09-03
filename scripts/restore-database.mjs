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

const psResult = Bun.spawnSync(
  ["docker", "ps", "--filter", "name=supabase_db_hkscda", "--format", "{{.Names}}"],
  { stdout: "pipe" },
);
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
