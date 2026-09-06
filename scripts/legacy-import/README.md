# Legacy SQL staging tool

Local inspection only. This script does not import into application tables or contact Supabase, payment providers, or email services.

Run from the repository root using Python 3.11+:

```powershell
python -m unittest discover -s scripts/legacy-import -p 'test_*.py'
python scripts/legacy-import/legacy_stage.py --source '<local data export.sql>' --inventory docs/evidence/legacy-import-20260906/source-schema-inventory.json --database backups/legacy-import-20260906/verified-staging.sqlite --report docs/evidence/legacy-import-20260906/data-profile.json
```

Only the expected phpMyAdmin literal INSERT format is supported. Arbitrary SQL is never executed. Unsupported statements, column mismatches, changed source hashes and conflicting legacy IDs fail closed. A staging database is bound to the SHA256 of one source export and must reside inside this repository's Git-ignored backups directory.

`legacy_rows` retains business source records; `quarantine` identifies selected broken references. Staging is not acceptance for target import. Credentials and authentication tables are excluded, file access tokens removed, and global_options held outside staging pending allowlist review. Reports contain aggregate counts only; actual personal records remain in local backups. Do not commit, expose or publish that directory.

One transaction covers all business row inserts; a later parser or data conflict rolls back the batch. Exact repeated input is idempotent. A separate repeat pass verifies zero added rows. Selected relationship checks are explicitly non-exhaustive. Duplicate email groups indicate review needs, not proof that people should be merged. Monetary totals are decimal-derived, currency-unverified source totals; they do not establish settlement or issue receipts.

The CLI requires an inventory compatible with every inserted source table. Never use this tool as a production migration runner. Production preparation still requires target constraints/RLS checks, a reviewed field/status mapping, canonical identity resolution, asset bytes, reconciliation and rollback rehearsal.
