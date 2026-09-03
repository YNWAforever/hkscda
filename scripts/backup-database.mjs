import { mkdirSync } from "node:fs";

// Data only, deliberately -- this repo's schema lives in version-controlled
// migrations (supabase/migrations/) and is recovered via `supabase db push`
// or `supabase db reset`, not from a backup file. A plain `supabase db dump`
// with no flags dumps SCHEMA ONLY (confirmed empirically), so `--data-only`
// is required for this script to capture anything worth calling a backup.
const isLocal = process.argv.includes("--local");
const dbUrl = process.env.SUPABASE_DB_URL;

if (!isLocal && !dbUrl) {
  console.error(
    "Set SUPABASE_DB_URL to your Supabase connection string (percent-encoded), " +
      "or pass --local to back up the local dev stack instead.",
  );
  process.exit(1);
}

mkdirSync("backups", { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = `backups/hkscda-${timestamp}.sql`;

const dumpArgs = isLocal
  ? ["supabase", "db", "dump", "--local", "--data-only", "-f", outputFile]
  : ["supabase", "db", "dump", "--db-url", dbUrl, "--data-only", "-f", outputFile];

const result = Bun.spawnSync(["bunx", ...dumpArgs], { stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) {
  console.error("Backup failed.");
  process.exit(result.exitCode ?? 1);
}

console.log(`Backup written to ${outputFile}`);
