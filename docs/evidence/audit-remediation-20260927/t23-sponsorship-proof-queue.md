# T23 · sponsorship pending-proof queue (ADMIN-04)

Source draft PR #167 / `f76af31c3a0f7882d05aa544337bb4e6d55c5375`, stacked on #166 / `e93262a725fdf82f6bcb4ab145b3d34adcaa7833`. Read-only filter and navigation slice; ADMIN-04 remains partial.

## Reproduction and change

Three focused baseline assertions failed: the proof task card opened the unfiltered pledge list, the URL serializer omitted `proof=pending`, and the repository returned three pledges for two pending proofs. A second-month proof can belong to an `active` pledge, so filtering pledge status alone would hide work.

The task card now opens `/admin/sponsorships?proof=pending`; follow-up opens `?status=needs_followup`. The pledge UI restores and persists the proof/status/page filters. The server validates `proof=pending`, keeps its existing reader authorization and no-store response, and uses an inner PostgREST proof relation so only pledges with a pending proof enter the result count and page. Search and status filters still compose with that query. The existing finance proof-review command, signed private file access, idempotency and payment state were not changed. No bulk approval or notification was added.

## Executed verification

- Red: `bun test` on the three focused files exited 1 with 59 pass/3 fail; failures were filter navigation, serialization and pre-page filtering. Green after implementation: five focused files 96 pass/0 fail; direct API/service/UI tests 65 pass/0 fail.
- Named unlinked local Supabase: PostgREST 57321 and DB 57322 were confirmed to belong to `hkscda-audit-remediation-20260927`. The service-only relation query returned HTTP 200. Three synthetic pledges (active, provisional, active) with two pending and one approved proof returned exact count 2 and the two pending pledges on pages 1 and 2 in stable newest-first order. Approved proof was excluded before paging.
- The synthetic insert generated three local outbox and three local message rows. Initial cleanup failed on the existing financial-history preservation trigger; its transaction rolled back, leaving the trigger enabled. A second exact-ID cleanup removed those six generated rows, three proofs, three pledges and one supporter in a local transaction; the trigger was temporarily disabled only within that transaction, reenabled before commit and independently confirmed enabled. All named synthetic row counts were then zero. No production data, external email or payment was used.
- Final `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: exit 0, 2887 pass/106 skip/0 fail/8988 assertions across 519 files. `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`: exit 0. Remote source CI run `36355532588`: pending at initial documentation capture.

## Release and rollback

No migration or config change. The existing proof review still rechecks the explicit proof ID and expected revision; a queue row may change before the drawer opens, so staff must review the current detail and let a conflict refresh rather than infer payment from uploaded proof. This filter is a navigation/read model only. If needed, revert this app slice while leaving the existing pledge list and finance review service available. Hosted staff/treasurer/admin browser UAT, provider sandbox and remaining sponsorship follow-up assignment/reminder drafts are not-run. No release operation was performed.
