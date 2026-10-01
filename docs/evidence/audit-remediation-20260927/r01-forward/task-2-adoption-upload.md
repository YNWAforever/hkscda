# R01 Task 2 — adoption upload forward schema

Source base: `e79537a191d8119b6d4eaa48833a5db8e200a03c`, isolated branch `codex/audit-r01-adoption-upload-20261001`. This is implementation of the approved Task 2 brief, not a production migration or a new plan.

## Scope and current status

The focused migration `20261001134252_r01_adoption_upload_forward.sql` supplies the missing `public.adoption_upload_intent`, nullable `public.public_status_token.submission_fingerprint` with lowercase SHA-256 format check, and `public.cleanup_expired_adoption_application(p_application_id uuid) returns text`. The current caller accepts only `completed`, `purged`, or `defer`.

New cleanup is postgres-owned SECURITY DEFINER with an empty search path and qualified application relations/clock. Only service_role can execute it. New intent grants are service_role SELECT/INSERT/UPDATE/DELETE, with RLS enabled and no public policies. Existing reviewed modern definitions, grants, constraints, indices, RLS and version triggers are preserved. Unexpected existing definitions fail with SQLSTATE55000 inside the migration transaction; none are silently replaced. Existing fingerprints remain NULL; there is no backfill.

Task 2 source implementation and schema compatibility are complete in isolation. The genuine missing-table RED is retained. Final hosted and modern rehearsals each passed 11 tests / 49 assertions, seven rollback negatives, second apply and original-source preservation. All four final local gates passed. Adjacent receipts and task-2-source-binding.json bind the tested executable bytes to their Git blobs. Controller review and exact new-head CI remain pending; nothing was applied to production.

## Evidence and environments

Fresh production read-only metadata at 2026-10-01T13:31:05Z reconfirmed all three targets absent, ledger112, existing status-token postgres ownership/RLS/service-only table ACL, and the case FK `ON DELETE SET NULL` with UNIQUE public_application_id. Production catalog capture hash is `33b97d3a27da5629e8196a9241f78400682bb9c053a7adbd49f0c4c7ec55b959`. The accepted clone interface at basee795 restores exact public/private catalog facets into a new owned `r01_clone_<32hex>` on loopback52322. It preserves managed synthetic Auth/Storage prerequisites and verifies 158 empty application tables before fixtures. No production rows are copied or stored; source function bodies stay in memory and receipts retain hashes.

Source template `audit_pr135_20260929` at loopback52322 and modern source `postgres` at loopback57322 are read-only throughout the DB rehearsals. Original catalog/managed metadata/all synthetic row aggregates/sequence/ledger hashes are compared after normal clone cleanup. New clones are dropped without FORCE or session termination. Final gate environment uses DB57322 and synthetic Auth52321, with all inherited feature TEST_DATABASE_URL and ALLOW_LOCAL_FIXTURES opt-ins cleared; build uses loopback54329 and CI placeholders. These are local synthetic environments, not hosted actor or provider UAT.

The hosted-prestate runner applies only Task 2 SQL. It never applies the inherited partial payment migration. Its manifest result is independently 146 requirements /44 gaps before and /41 after. The other 41 requirements remain open; actual production is unchanged at44 gaps/ledger112.

## Reviewed paths and behavior

Graph project `hkscda-r01-adoption-20261001` supplied the current cleanup caller in `src/lib/publicAdoption/uploadIntent.server.ts`. Legacy SQL files 20260925123000, 20260926100000 and 20260926140000 were read as references, not replayed wholesale.

Cleanup locks the intent, evaluates submitted/expiry state with clock_timestamp after that lock, then locks the application parent before checking its case. FK key-share locking therefore coordinates concurrent insertion. Completed cases and submitted/unexpired intents are retained. Partial application children cascade on purge; the intent remains until the caller confirms Storage deletion. Storage failure is injected below the real cleanup service through its port; no real Storage request occurs.

Before fixture/RPC calls, the unchanged shared safety guard checks all directly and indirectly affected tables and transitive trigger/default/check paths. Manual review binds the complete actual trigger bodies, owners, signatures, configs and ACLs through source catalog parity and sanitized trigger metadata. Reviewed sources are log_animal_mutation, set_updated_at, private.bump_adoption_case_bulk_row_version, and enforce_current_animal_preference. The latter selects/locks animals and checks eligibility; it does not invoke a provider. The parent FK children are application detail/photo/animal-preference/visit-preference/intake, plus case SET NULL. No existing trigger, RLS policy or prerequisite is disabled or replaced.

The SQL service actor bypasses RLS by the existing service-role architecture. Anon/authenticated direct intent/token access and cleanup execution are denied. Identity/token/path/fingerprint authorization remains in the unchanged current server caller and its existing unit regressions; SQL role tests do not claim HTTP JWT/provider UAT. Cleanup is automated public-submission housekeeping without a staff actor parameter, so staff suspension/stale-admin-role/versioned admin audit commands are not introduced in this repair. Existing admin mutation/audit/version boundaries remain covered by the full suite. A clone-only inert downstream deletion failure checks transactional rollback of the parent and child rows; it is removed in finally and does not replace any application RPC.

## Tests

The adjacent database suite tests the real missing caller query, service-only RPC/table permissions, malformed hashes/photo counts/expiry and duplicate application/bearer inputs, nullable old fingerprints, submitted/unexpired/unknown/NULL defer behavior, completed-case row/version retention, concurrent purge retries, Storage retry retention, expiry refresh while waiting for the intent lock, wall-clock expiry crossing while locked, both parent/case insertion lock orders, and downstream rollback. Final hosted and modern results:11pass/0fail/49assertions each. Final receipts bind starting and ending SHA-256 of migration, test, runner and accepted helper; executable inputs are immutable during each accepted run.

The runner also applies the focused migration twice with a temporary shadow relation, compares unaffected catalog facets and old-row/ledger hashes, and requires full catalog equality on modern prestate. Seven negative transactional preflights independently alter fingerprint type/check, cleanup index predicate, PUBLIC cleanup EXECUTE, client intent grantee, service grant option, and incomplete intent privilege profile; each must fail55000 and roll back to the exact before metadata/row hash.

## Retained failures and limitations

The first RED attempt was a harness22P02 array-binding error in the manual trigger query, not feature RED; static allowlisted table names corrected it, and fixture arrays use Bun SQL.array(TEXT). The second stopped before actors on an unreviewed existing animal-preference trigger. Full source review plus actual body hash resolved that refusal without changing the shared guard/native trust. The genuine watched RED was42P01 on public.adoption_upload_intent, 0pass/1fail; fingerprints/cleanup were independently confirmed absent by fresh metadata.

The first GREEN attempt had SQL42601 from the PL/pgSQL CASE expression in the preflight; parentheses repaired it. Two catalog refusals identified exactly three new pg_attribute index-column entries; the comparator now allows only the four exact intent relation names (table plus three indices), replacing a broader name-prefix filter. These were harness/preflight failures, not feature RED. Initial strict typing found a missing row-map annotation, then the sanitized trigger-receipt map annotation; both are explicit typed records. Initial targeted lint caught an unsafe throw in finally; source-preservation results are now recorded and checked after finally. Failed receipts remain in ignored task scratch and sanitized copies are retained with this evidence.

A slow intermediate rehearsal was diagnosed through one bounded read-only owned-clone wait metadata query and Docker status. It progressed from idle/client-read fact hashing to its Bun test child; both declared DB containers were healthy. No restart, reset, backend signal or session termination occurred.

The first modern rehearsal refused the actual legacy intent ACL with55000. Read-only metadata showed the exact postgres-owner/service-role-only eight-privilege profile, all nongrantable with postgres grantor. The controller explicitly reviewed preservation of that profile on an existing table, alongside the new-host CRUD-only profile. The migration now compares those precise profiles and rejects extras, grant options, incomplete profiles and effective client table/column privileges. Existing grants are untouched; missing tables still receive only CRUD. Updated SQL SHA-256: ca4879d9c93d413941ccc5a13c17d4eba1f70b293169665583e4b23973d1a5f3. Fresh hosted and modern rehearsals each passed11/0/49, all seven rollback negatives and immutable executable hashes. Modern before/after catalog hash stayed50bbc03d22ed2a419087aa56027e7be5a4c10c61cbf71662aa59398d317c4a63, with its existing one unrelated manifest gap unchanged. The original modern refusal and prior source hashes remain separate evidence.

Production DDL/DML/actor RPCs, production backup decryption, real Storage/payment/email/provider operations, preview/deployment, push/merge, and hosted direct HTTP actor UAT are not-run. Task 1 remains partial: accepted shared harness/source basee795 /draftPR183, exact base CI36869741408 allfive SUCCESS; payment finance-actor checkout_url RED and source ACL human approval remain pending. Task 2 acceptance supplies no payment ACL or release authority. Controller independent review and exact final-head CI remain external acceptance gates.

## Reproduce and verify

The tracked entrypoint is `supabase/rls-tests/helpers/runR01AdoptionForward.ts`. From the isolated repository root, with the authenticated schema-read context and the existing loopback synthetic template/modern database available:

```powershell
$env:R01_ADOPTION_ALLOW_LOCAL_FIXTURES = '1'
bun run supabase/rls-tests/helpers/runR01AdoptionForward.ts red
bun run supabase/rls-tests/helpers/runR01AdoptionForward.ts green 20261001134252_r01_adoption_upload_forward.sql
bun run supabase/rls-tests/helpers/runR01AdoptionForward.ts green-modern 20261001134252_r01_adoption_upload_forward.sql
```

RED intentionally exits 1; both GREEN commands exit 0. Each command creates and normally drops its own clone. Receipts are initially written to ignored `.superpowers/sdd/r01-forward-schema-plan-20261001`; sanitized acceptance/failure copies are committed here. Final hosted ran 14:17:11–14:17:59Z; modern ran 14:19:19–14:19:38Z on 2026-10-01. Both bound SQL ca4879d9, runner 6976c1b5, tests a71713af and unchanged shared helper 526c01f4. Full SHA-256/Git blob values are in the source binding receipt. Earlier hashes are historical intermediate evidence.

After both clone cleanups, the supplied ignored `run-task-2-gates.py final` wrapper ran the following once on those unchanged functional bytes, 14:22:07–14:26:20Z. It cleared inherited feature DB/fixture opt-ins, used synthetic loopback DB57322/Auth52321, and build loopback54329/CI placeholders.

| Command | Exit | Seconds | Result |
| --- | --- | --- | --- |
| bun run typecheck | 0 | 41.04 | strict typecheck passed |
| bun test --isolate --timeout 30000 | 0 | 109.30 | 3221 pass / 210 skip / 0 fail / 10443 assertions |
| bun run lint | 0 | 42.20 | 0 errors / 52 existing warnings |
| bun run build | 0 | 60.37 | production build passed in local placeholder context |

The opt-in DB suite is covered by the two isolated rehearsals, not the full-suite skipped count. Full gate outputs remain in local ignored scratch; their SHA-256 and byte counts are committed alongside the command/exit/timing receipt. Only documentation/receipt/current-tracker packaging followed those gates. `git diff --check` and exact tested blob verification are the final packaging checks. Shared guard and partial Task 1 SQL match basee795 byte-for-byte. No further optional DB/full-suite runs were performed.
