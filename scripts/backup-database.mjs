import { mkdirSync } from "node:fs";

// Data only, deliberately -- this repo's schema lives in version-controlled
// migrations (supabase/migrations/) and is recovered via `supabase db push`
// or `supabase db reset`, not from a backup file. A plain `supabase db dump`
// with no flags dumps SCHEMA ONLY (confirmed empirically), so `--data-only`
// is required for this script to capture anything worth calling a backup.
//
// Residual exposure: SUPABASE_DB_URL is passed to the Supabase CLI as a
// `--db-url` argv value (the CLI has no env-only mechanism for this), so the
// real connection string briefly appears in this machine's own OS process
// list while the dump runs -- avoid running this on a shared/multi-user host.
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

// stdout/stderr are captured (not inherited) so the real connection string
// can be scrubbed before anything reaches this script's own output -- the
// Supabase CLI can echo back an invalid --db-url verbatim in its own error
// messages (e.g. on a malformed/un-percent-encoded connection string), and
// that must never land unredacted in terminal scrollback or a CI log.
const result = Bun.spawnSync(["bunx", ...dumpArgs], { stdout: "pipe", stderr: "pipe" });
const redact = (text) => (dbUrl ? text.replaceAll(dbUrl, "[REDACTED]") : text);
process.stdout.write(redact(result.stdout.toString()));
process.stderr.write(redact(result.stderr.toString()));

if (result.exitCode !== 0) {
  console.error("Backup failed.");
  process.exit(result.exitCode ?? 1);
}

console.log(`Backup written to ${outputFile}`);
