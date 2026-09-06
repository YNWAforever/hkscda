# Approved production repair result

Applied after the user's explicit `approve` response to the scoped production repair proposal. Target: HKSCDA iihqjzilgawhfdhdevam. Supabase apply_migration returned success; migration history records 20260906062155_cms_payment_read_compatibility_repair. Exact SQL: proposed-read-repair.sql. No historical migration entries were rewritten.

Immediately before applying, all guarded new objects remained absent,7published stories/1internal update/0media rows and3eligible actors matched the preflight. Published ID/slug/date fingerprint: ec16756342887093f654fc6753521e5b.

After commit, actual service_role SQL acceptance returned:
- CMS7, public7, supporter15.
- Five hidden draft payment settings; zero published methods.
- Seven immutable published revisions; published ID/slug/date fingerprint unchanged.
- One internal source update retained; zero internal updates in public revision snapshots.
- Anonymous payment-table SELECT and admin CMS RPC execution denied.
- content-media-private is private; both content buckets enforce8MiB jpeg/png/webp limits.

Public GET /stories and /donate returned HTTP200. No admin requests were present in the latest5minute Vercel log query; authenticated browser/API acceptance remains pending a signed-in refresh. SQL acceptance is not represented as browser verification. No provider activation, checkout transaction, real-person message, existing object deletion or application deployment was performed.

The approval followed a request to confirm a recoverable backup and authorize this repair. Backup availability was not independently verified by connector tooling; no backup/restore success is claimed. Full older migration-history reconciliation and unrelated identity/manual-gift/volunteer write gaps remain outside this approved scoped repair.