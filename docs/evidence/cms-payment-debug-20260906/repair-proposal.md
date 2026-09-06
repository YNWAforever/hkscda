# Confirmed schema drift and proposed loading repair

## Confirmed production state

Supabase access restored for HKSCDA iihqjzilgawhfdhdevam. All checks were read-only. Payment configuration and publish-request tables are absent; five queried CMS/CRM/payment RPCs are absent. This confirms a schema mismatch rather than cache-only failure. The migration ledger has18entries,12matching the52repository versions and6other versions;40repository versions are unrecorded. Actual older tables/functions already exist despite many missing ledger entries, so blindly replaying40migrations is unsafe.

Read-only backfill preflight:7published content items,0missing publication dates,0duplicate published slugs,0items lacking any active staff/admin actor,1internal update,0CMSmedia rows. All7legacy content tables checked grant service_role SELECT; private.has_admin_role(text[]) exists. All6new tables in this repair are absent. Duplicate volunteer-acknowledgement groups0. No business-row payloads or credentials were copied.

## Exact proposed action — not executed in production

`proposed-read-repair.sql` is one transaction with5slock timeout,120sstatement timeout and stale-preflight guards. It combines these existing schema changes in dependency order:

1.20260831120000 payment settings: schema/RLS/audited approval functions; adapted seed creates5hidden draft rows, with no published_at. The original migration's5public/published seeds are deliberately excluded.
2.20260831160000 content-media bucket: creates the absent empty public publication-copy bucket.
3.20260905150012 CMS revisions/lifecycle: creates immutable revisions and publication pointers; backfills the7existing published records, preserving publication timestamps and excluding internal update material from public snapshots.
4.20260905155426 private media sessions: creates the private bucket and verified upload/public-copy metadata.
5.20260905162615 CRM complete reads: restores supporter summaries/filtering/export RPCs.
6.20260905163559 bounded CMS reads: restores list and authoring detail RPCs.

No payment method is published or activated, no provider credentials are changed, no transactions/messages are sent, and no existing Storage object is copied/deleted. Draft method configuration/publication remains a separate staff workflow. This is a scoped compatibility repair, not a declaration of complete production parity: identity/manual-gift/volunteer write migrations and older ledger reconciliation remain outstanding.

Use the Supabase migration mechanism for the approved one-off repair so the actual combined SQL is recorded with its own identity; do not mark all40versions applied or rewrite historical versions based only on matching names. Retain this exact repair SQL/source hashes for later reconciliation. Do not run it twice: its guards intentionally reject an already-repaired target.

## Executed local rehearsal

Only local Docker container supabase_db_hkscda-completion-20260905, publishedDBport55322, database cms_payment_rehearsal_20260906. No production schema dump or business data was used. Platform schema came from the existing disposable stack;43baseline repository migrations constructed the pre-repair application shape. The schema-only platform bootstrap initially stopped on a storage policy that depended on private.has_admin_role before baseline creation; baseline creation then succeeded. This rehearsal is synthetic, not an exact production clone or hosted HTTP/browser test.

Synthetic fixtures:1admin,7published stories,1internal update,1supporter. Before repair, the payment table and CMS/supporter reads failed with missing-relation/function errors (`local-before.txt`). An injected exception after all repair statements rolled back the entire transaction; subsequent assertions confirmed no new payment/revision tables and all7published originals remained. The unmodified proposed SQL then committed successfully (`local-apply.txt`).

`local-acceptance.sql` executed as service_role and verified CMS=7/public=7/CRM=1; internal sentinel excluded from public snapshots while internal source retained; publication dates unchanged;5hidden draft methods/0published methods; anonymous admin reads denied. Elevated metadata assertions verified the private bucket and7immutable published revisions. See `local-after.txt`. These results verify this scoped SQL repair; they do not replace authenticated production page acceptance.

## Execution and rollback gates

No production changes have been made. Before executing: confirm a current recoverable backup for this project, explicitly approve this exact production schema/backfill/draft-seed repair, recheck the preflight and target deployment, and coordinate a brief authoring-write pause. Current production backup availability has not been verified by the available connector tools. No destructive migration-history repair is authorized.

Within the transaction, any SQL/assertion/timeout failure rolls everything back (tested). After commit, do not delete revisions or reset ledgers to roll back; retain compatible data and prefer a forward repair. Public snapshots preserve the prior published content; inspect failures before further writes. Full database recovery, if necessary, requires a separately verified restore target and authority.

After repair: confirm metadata/grants; verify authenticated GET /api/admin/content, /api/admin/supporters and /api/admin/payment-methods return200 with valid envelopes; refresh the reported settings page and verify the loading state resolves. Recheck public stories and private media denial. A service-role SQL pass alone does not prove the user's browser is repaired.