# Database Backup and Restore Runbook

HKSCDA's Supabase project (ref `iihqjzilgawhfdhdevam`) is on the free tier, which has no
built-in automatic backups or point-in-time recovery. `scripts/backup-database.mjs` and
`scripts/restore-database.mjs` give you a manual, on-demand way to back up and recover
the database's data until/unless that changes (upgrading to a paid tier with built-in
PITR, or building scheduled automated backups, are both reasonable future upgrades --
neither is done here).

## What this backs up (and what it deliberately doesn't)

This backs up **data only** -- donor records, submissions, admin-authored content edits,
and everything else that lives only in the live database. It does **not** back up schema.
That's intentional: this repo's schema is already fully captured in version-controlled
migrations (`supabase/migrations/`), which is a more durable and reviewable source of
truth than a snapshot in a backup file. Recovering schema means running
`bunx supabase db push` (or, for a from-scratch project, letting the migrations apply
during `bunx supabase start`/project setup) -- not restoring from one of these dumps.

## Taking a backup

```bash
SUPABASE_DB_URL="postgresql://postgres:<your-password>@db.iihqjzilgawhfdhdevam.supabase.co:5432/postgres" bun run backup:db
```

Get the real connection string from the Supabase dashboard (Project Settings -> Database
-> Connection string -> URI). It must be percent-encoded if your password contains special
characters. **Never commit this value or paste it into a shared chat/ticket** -- treat it
like any other production credential.

The dashboard offers both a **Direct connection** and a **Pooler (transaction/session
mode)** connection string -- it's easy to grab the pooler one by habit, since that's the
one the app uses at runtime, but `pg_dump`-based tooling (what this script wraps) generally
needs the **direct** connection string instead. Double-check you're on the dashboard's
"Direct connection" tab before copying.

There is a residual exposure you should know about: the Supabase CLI has no env-only way
to accept a connection string, so `backup-database.mjs` passes `SUPABASE_DB_URL` to it as
a `--db-url` command-line argument. That means the real connection string briefly appears
in this machine's own OS process list (e.g. `ps`/Task Manager) while the backup command
runs. The script does redact the connection string from its own captured stdout/stderr
before printing anything -- this matters because the Supabase CLI can otherwise echo an
invalid `--db-url` back verbatim in its own error message (for example on a malformed or
un-percent-encoded connection string), which would otherwise leak the credential into your
terminal or CI logs. That redaction only covers this script's own output, though; it does
not and cannot close the OS-process-list exposure. Because of that, avoid running a real
backup on a shared or multi-user host.

This writes a timestamped file to `backups/` (gitignored -- these files can contain real
donor data and must never be committed). **A local `backups/` directory on one laptop is
not itself durable disaster-recovery storage.** After taking a backup you intend to actually
rely on, move the file to secure, off-machine storage yourself (e.g. an encrypted cloud
storage bucket) -- this repo's tooling stops at producing the file.

## Restoring in a real emergency

`scripts/restore-database.mjs` only restores into the **local** Supabase dev stack
(`bunx supabase start`) -- it has no code path that can reach a remote target, by design,
so it can never be the thing that accidentally overwrites production. Use it to rehearse
a restore, verify a backup file is good, or recover your own local dev database.

Before touching Docker at all, the script also verifies that the active Docker
daemon/context is genuinely local: it checks `DOCKER_HOST` (rejecting anything that isn't
empty, a Unix/Windows socket, or a `tcp://` address pointing at `127.0.0.1`/`localhost`/
`::1`) and independently confirms the same thing from `docker context inspect`'s resolved
endpoint. This closes a real gap that a name-only container check can't: if `DOCKER_HOST`
(or the active Docker context) were misconfigured to point at a remote daemon -- plausible
on a dev machine also used for other Docker work -- a same-named `supabase_db_hkscda`
container could happen to exist on that remote host too, and a check that only looked for
a matching container name would "successfully" find it and restore into it by accident.
The script refuses to proceed at all unless it can positively confirm the resolved Docker
endpoint is local, rather than just assuming so because a same-named container turned up.
Like the argv-exposure risk above, this check has a disclosed limit: it inspects the shape
of the endpoint string, not what it actually connects to, so a deliberately tunnelled
socket (SSH-forwarded or `socat`-proxied) or a poisoned hosts file remapping `localhost`
away from loopback could still slip past it -- that's inherent to a client-side string
check and isn't something to try to patch further here.

To restore into a **real** remote target (recovering the actual production database after
a real incident), do this yourself, deliberately, using your own Postgres client tools and
credentials:

```bash
psql "$YOUR_REAL_TARGET_CONNECTION_STRING" < backups/hkscda-<timestamp>.sql
```

If you don't have `psql` installed locally (this repo doesn't assume any contributor's
machine has Postgres client tools -- it's why the local restore script above uses
`docker exec` into a container instead of a local `psql` binary), the same disposable-container
approach works here too, with no local install required:

```bash
docker run --rm -i postgres:17 psql "$YOUR_REAL_TARGET_CONNECTION_STRING" < backups/hkscda-<timestamp>.sql
```

Some `ERROR: duplicate key value violates unique constraint` lines are expected if the
target has already run its own migrations (which seed some reference tables) -- these are
harmless; each `INSERT` in a data-only dump commits independently, so your real data still
lands. Any *other* kind of error is worth investigating before trusting the restore.
**Verify success by checking your actual data afterward, never by the restore command's
exit code alone** -- `psql` can exit `0` even when individual statements failed.

There is one known, reproducible warning from the underlying `pg_dump` about a circular
foreign-key relationship between `content_item` and `content_media`:

```
pg_dump: warning: there are circular foreign-key constraints among these tables
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers
```

This did not cause an actual restore failure when drilled (2026-09-03), but if a future
schema change makes it matter, `psql --set ON_ERROR_STOP=0 -c "SET session_replication_role = replica;"`
before replaying the dump (and setting it back to `origin` after) is the standard Postgres
way to temporarily disable trigger/FK enforcement during a bulk restore.

## What has (and hasn't) actually been proven

This runbook's backup/restore mechanics were drilled end-to-end on 2026-09-03 against the
**local** Supabase CLI stack: a fixture row was seeded, backed up, the local database was
reset (simulating total data loss), and the row was successfully restored and verified
present again. This proves the dump file format and restore mechanics genuinely work
against a real Postgres instance running this repo's actual schema and migrations.

It does **not** prove a real production dump/restore round-trip. That requires your own
production credentials, and -- given the risk of a mistake overwriting real donor
records -- should only ever be run deliberately by a human against a true throwaway
target (e.g., a fresh scratch Supabase project), never automated by an agent. If you want
that additional confidence, run the same restore procedure above against a disposable
project you create for the purpose, then discard it.
