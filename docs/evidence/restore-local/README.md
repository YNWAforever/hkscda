# Synthetic local restore rehearsal

Executed2026-09-06 between unique disposable stacks `hkscda-completion-20260905` (DB55322/API55321) and `hkscda-completion-restore-20260905` (DB55622/API55621). No production backup, data, object or authentication configuration was used.

The existing `scripts/backup-database.mjs` exited0 with an explicit local source URL. A separate data supplement covered public/private/Auth/Storage metadata; private image bytes were captured separately. The target was provisioned from the exact repository migrations. Both Docker container names, running state, local Docker endpoint and database port bindings were checked before mutation.

Initial target truncation failed with permission denied on Auth schema_migrations; the transaction did not partially truncate tables. The local postgres role is not a superuser. The corrected rehearsal used the new disposable target's supabase_admin role for its platform-owned tables. This was a local role correction, not a production permission change. The first failure and sanitized error are retained.

Passed recovery checks:

- Restored one synthetic supporter/donation relationship with amount12300cents.
- Successfully signed in with the restored Auth user's password using a separate anon client; privileged Storage client retained its service identity.
- Uploaded bytes read back from the backup artifact; downloaded signed private bytes matched exactly.
- Known public URL for the restored private object returned400.
- Exact migration versions matched across both stacks:52total, including all7candidate migrations.
- Post-cleanup counts matched for74public/private/Auth-user/Storage tables; `counts.json` retains the count-only comparison.
- Fixture cleanup reported no errors.

`result.json` records a5720.94ms restore-and-selected-verification interval (total run approximately12s), backup size128999bytes and its SHA256. Count comparison occurred afterward. These timings are synthetic local observations, not an owner-approved RTO. No RPO, production backup completeness or production restore capability is claimed.

The data/auth/Storage dump and object bytes remain under ignored `supabase/.temp/completion-restore/backup`; existing backup command outputs remain under ignored `backups/`. These ephemeral artifacts contain synthetic Auth metadata and are not part of the release artifact. Production recovery still requires a verified backup from the correct project, exact schema/config/Storage/auth inventory, authorized restore target and owner-approved recovery targets.
