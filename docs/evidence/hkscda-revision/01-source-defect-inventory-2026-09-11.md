# HKSCDA Revision — Source-Level Defect Inventory

Recorded: 2026-09-11 | Commit: `c037cc1` (= `origin/main` = deployed production)

Produced by a 13-way parallel read of the repository. Every `still_broken` entry
below carries a file path and the code the reading agent actually read. Entries
are **source-level findings**, not live database observations: this session did
not query the production database. Where a finding asserts that a database object
is absent in production, its evidence is the repository's own recorded preflight
(`docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json`),
not a fresh query — that re-check is itself a Phase 1 task.

**Totals:** 13 areas · 104 already-fixed items · 217 open items (blocker: 45, high: 66, low: 29, medium: 77)

---

## Phase 1 — Volunteer admin reads and the volunteer_activity_counts dependency

`volunteer_activity_counts` is not a view — it is a `security definer` SQL function returning `jsonb`, created in supabase/migrations/20260905163900_volunteer_atomic_approval.sql:46-53 and called from exactly one place, src/lib/volunteers/repository.server.ts:180. That single call sits inside `loadActivityCounts`, which `hydrateActivities` invokes on the path of EVERY volunteer read (admin activity list, admin registration list, registration detail, status-token lookup, public published list, and the post-mutation re-hydrate), so one missing DB object takes out the whole volunteer surface. The repository rethrows the PostgREST error (`if (error) throw error;` at line 183) with no fallback to `emptyCounts`; http.server.ts:52-60 turns it into a generic 500; fetchAdminJson throws; and VolunteerManagement.tsx never reads `isError` — it renders `data?.activities ?? []` with `loading={isLoading}` only, so a failed query paints the "尚未建立任何活動" / "沒有符合條件的報名" empty states. That is the exact "UI shows ZERO records while the DB has 12 activities and 5 registrations" symptom, and it is still present at c037cc1. The counting logic itself is correct and already fixed: the RPC sums `participant_count` (not row count) with FILTER clauses, and the two audit RPCs do locked, version-checked, transactional status/capacity changes. The remaining Phase 1 gaps are (a) the deployed database almost certainly still lacks migration 20260905163900 (repo evidence: production-schema-preflight.json lists it `applied:false`; crm-package5/checkpoint.md:3 calls it "unapplied"; production-repair-result.md:17 says volunteer gaps were excluded from the approved repair), and (b) the client/server code has no error-vs-empty distinction and no test pinning the RPC name/arg contract.

### Already addressed at this commit (8)

- **Capacity counts used row counts instead of summed participant_count**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:49 — `coalesce(sum(participant_count) filter(where status='approved'),0) approved_participants, ... pending ... waitlisted`. Same participant_count summing is used for the approval capacity gate (line 16) and the capacity-reduction floor (line 36). No `count(*)` anywhere in the volunteer counting path.
- **Counts were computed client-side from a page-capped registration fetch, so totals were wrong past the PostgREST row limit**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:45 comment "Counts used for refreshed capacity are complete even beyond the API row limit"; the aggregate is a single server-side jsonb projection consumed at src/lib/volunteers/repository.server.ts:176-197 with one RPC round trip per hydrate, not per activity.
- **Staff approval raced public submission and could overbook; audit was a separate non-transactional write**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:2-22 — set_volunteer_registration_status_with_audit takes `pg_advisory_xact_lock(hashtextextended(v_activity_id::text,0))` (line 10), locks activity and registration `for update` (11-12), enforces `v_registration.updated_at<>p_expected_updated_at -> conflict` (14), sums approved participants excluding the current row (16-17), then updates and inserts audit_log in the same transaction (19-20).
- **Activity capacity edits could be reduced below already-approved occupancy**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:26-41 — update_volunteer_activity_with_audit takes the same advisory lock (31), checks expectedUpdatedAt (34), and returns `capacity_full` when `v_next.capacity<v_used` (36-37). Wired at src/lib/volunteers/repository.server.ts:312-321.
- **Conflict/capacity errors degraded to a generic Error and lost the 409 status/code before reaching the UI**
  - Evidence: src/lib/volunteers/repository.server.ts:245-260 `requireUpdated` throws a structured `Response.json({error:{code,message}}, {status})`; src/lib/volunteers/http.server.ts:41 returns it verbatim; src/lib/admin/session.ts:81-102 reconstructs it as AdminApiError; pinned end-to-end by src/lib/volunteers/errorContract.test.ts:14-49.
- **Explicit empty internal notes could not be distinguished from omitted notes on a status change**
  - Evidence: src/lib/volunteers/repository.server.ts:460-461 sends `p_internal_notes: input.internalNotes ?? null` plus `p_update_internal_notes: input.internalNotes !== undefined`; migration line 19 honours the flag. Test at src/lib/volunteers/repository.server.test.ts:97-117.
- **Public volunteer page could not tell a load failure from an empty activity list**
  - Evidence: src/routes/volunteer.tsx:112-122 — `.catch(() => setLoadError("暫時未能載入義工活動，請稍後再試。"))` with a dedicated loadError branch rendered before the `activities.length === 0` branch at line ~218. (The admin screens still lack this — see still_broken.)
- **Admin registration filters left the operator stranded on a now-empty page number**
  - Evidence: src/components/admin/volunteers/VolunteerManagement.tsx:177-180 `applyRegistrationFilter` resets `registrationPage` to 1 on every filter change, and the two DataTables carry distinct empty copy for filtered vs unfiltered states (lines ~866, ~952).

### Open (9)

**[BLOCKER] Admin volunteer tables render the "nothing here" empty state when the list query FAILS. `isError` is never read on either query, so a 500 from the API is visually indistinguishable from a genuinely empty dataset — this is the literal audit symptom (zero rows shown while the DB holds 12 activities and 5 registrations).**

- File: `src/components/admin/volunteers/VolunteerManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/VolunteerManagement.tsx:195-196 `const activities = activitiesQuery.data?.activities ?? []; const registrations = registrationsQuery.data?.registrations ?? [];` then `loading={activitiesQuery.isLoading}` (line 824) and `loading={registrationsQuery.isLoading}` (line 908) are the ONLY query-state inputs to <DataTable>. Grep for `isError` in that file returns only `createActivity.isError` (line 798) — neither list query. src/router.tsx:6 is a bare `new QueryClient()` (no defaults), so after the default 3 retries status becomes 'error', isPending/isLoading go false, and src/components/admin/DataTable.tsx:74/85-ish falls through to the `empty` prop: "尚未建立任何活動。按「新增活動」開始。" and "沒有符合條件的報名。試試放寬篩選條件。". The three StatCards also read 0 from the same empty arrays (lines 198-205).

**[BLOCKER] Every volunteer read hard-depends on the volunteer_activity_counts RPC with no degradation path. The repository rethrows the PostgREST error instead of falling back to the `emptyCounts` constant it already defines, so a single missing/unprivileged DB function blanks the entire volunteer subsystem (admin lists, registration detail, status-token lookup, AND the public /volunteer page).**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/volunteers/repository.server.ts:180-183 — `const { data, error } = await client.rpc("volunteer_activity_counts", { p_activity_ids: activityIds }); if (error) throw error;`. `emptyCounts` is declared at line 70-74 and used only as a default parameter in `toActivity` (line 82), never as an error fallback. `loadActivityCounts` is reached from `hydrateActivities` (199-205), which is on the path of `listPublishedActivities` (272), `listActivities` (289), `getActivity` (215), and `hydrateRegistrations` (224) — which itself backs `createRegistration` (398), `listRegistrations` (421), `getRegistrationDetail` (437), `getRegistrationByStatusToken` (450), `updateRegistrationStatus` (465) and `updateAttendance` (482).

**[BLOCKER] The migration that creates volunteer_activity_counts (and the two audit RPCs) is recorded as NOT applied to the production database, and the one approved production repair explicitly excluded volunteer. The repo containing the .sql file is not evidence the function exists in the deployed DB.**

- File: `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`
- Phase: Phase 1
- Evidence: docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json — migration entry `{"applied": false, "version": "20260905163900"}` (and `20260704165600` is also `applied:false`); its `remote_only_migrations` list contains no volunteer entry. docs/evidence/crm-package5/checkpoint.md:3 "Allocated migration: 20260905163900_volunteer_atomic_approval.sql (unapplied)." docs/evidence/cms-payment-debug-20260906/production-repair-result.md:17 "Full older migration-history reconciliation and unrelated identity/manual-gift/volunteer write gaps remain outside this approved scoped repair." The same failure mode is already documented for sibling RPCs: docs/evidence/cms-payment-debug-20260906/README.md:9-10 records PGRST202 500s for `read_content_admin_summaries` and `crm_read_supporters`. Note: the preflight's `functions` array checked only 5 CMS/CRM/payment signatures — volunteer_activity_counts was never directly probed, so absence is strongly implied by migration history, not directly measured.

**[HIGH] Nothing pins the contract between the RPC name/arguments the repository calls and the function the migration defines. A rename or signature drift compiles, lints and passes the suite, then 500s at runtime.**

- File: `src/lib/supabaseMigrations.test.ts`
- Phase: Phase 1
- Evidence: A repo-wide grep for `volunteer_activity_counts` returns exactly two files: src/lib/volunteers/repository.server.ts:180 and supabase/migrations/20260905163900_volunteer_atomic_approval.sql:46/52/53 — no test file. src/lib/supabaseMigrations.test.ts:329 has a block asserting the contents of `_volunteer_activity_management_v1.sql` (RPC name, grants, advisory lock) but there is no equivalent block for `_volunteer_atomic_approval.sql`. src/lib/volunteers/repository.server.test.ts covers only the two audit RPCs via stubbed `rpc` and never exercises `hydrateActivities`/`loadActivityCounts`.

**[MEDIUM] The registration detail screen reports any fetch failure — including a 500 from the missing RPC or an expired session — as "registration not found", sending the operator to look for a record that exists.**

- File: `src/components/admin/volunteers/VolunteerRegistrationDetail.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/VolunteerRegistrationDetail.tsx:49-51 — `if (error || !data?.registration) { return <div ...>找不到義工報名。</div>; }`. Error and empty are collapsed into one branch, the same defect class as the list screen.

**[MEDIUM] The registration detail screen's action bar leaks raw English database enums, offers transitions the shared logic module deliberately excludes, and swallows attendance errors.**

- File: `src/components/admin/volunteers/VolunteerRegistrationDetail.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/VolunteerRegistrationDetail.tsx:108-128 renders `{status}` and `{attendanceStatus}` verbatim ("approved", "waitlisted", "rejected", "cancelled", "attended", "completed", "no_show") even though it already imports `registrationStatusLabels`/`attendanceStatusLabels` (lines 6-10) and uses them at lines 72/75. It offers all four statuses unconditionally, contradicting `availableRegistrationTransitions` (src/components/admin/volunteers/volunteerAdminLogic.ts:77-94, which never offers `cancelled`), and offers attendance without the `canMarkAttendance` gate (volunteerAdminLogic.ts:106-120) — so clicking "attended" on a pending row hits `validateAttendanceTransition` (src/lib/volunteers/rules.ts:76-78), which throws a plain Error and becomes a generic 500. Only `updateStatus.error` is rendered (line 101-105); `updateAttendance.error` is never displayed, so that failure is silent.

**[MEDIUM] Attendance updates bypass the locked/audited RPC pattern that status and capacity changes were migrated onto: a bare service-role table UPDATE with no expectedUpdatedAt, no DB-side actor check, and an audit row written separately in application code (so a crash between the two leaves an unaudited mutation).**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/volunteers/repository.server.ts:470-484 — `client.from("volunteer_registration").update({ attendance_status, volunteer_hours, internal_notes }).eq("id", input.registrationId)`, with no `.eq("updated_at", ...)` guard and no RPC. Compare `updateRegistrationStatus` at 454-469 which calls `set_volunteer_registration_status_with_audit`. The audit row is a second, independent write at src/lib/volunteers/service.ts:308-315, after the update has already committed.

**[LOW] A permission failure inside the audit RPCs surfaces to the operator as an opaque 500 rather than a 403, because only thrown `Response` and `ZodError` get specific handling.**

- File: `src/lib/volunteers/http.server.ts`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:6 and :30 `raise exception 'volunteer_forbidden' using errcode='42501'` — this arrives as a PostgREST error object, so src/lib/volunteers/repository.server.ts:463 / :319 `if (error) throw error` throws a plain object, and src/lib/volunteers/http.server.ts:52-60 falls through to `console.error(error)` + 500 "Could not process volunteer management request".

**[LOW] Every staff-driven status transition is stamped `status_reason='manual_review'`, including rejections and cancellations, so status_reason carries no information about why a registration was rejected.**

- File: `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:19 — `update public.volunteer_registration set status=p_status,status_reason='manual_review',...` with no branch on p_status. The reason vocabulary the rules engine produces (src/lib/volunteers/rules.ts:33-69: `minimum_age_not_met`, `capacity_full`, `guardian_details_required`, ...) is discarded on every staff edit.

### Must reuse, not reinvent (10)

- `loadActivityCounts / hydrateActivities` — `src/lib/volunteers/repository.server.ts`: Lines 176-205 are the single chokepoint for capacity counts across every volunteer read. Any resilience fix (fallback to `emptyCounts` on error, or a degraded-counts flag surfaced to the UI) belongs here — do NOT add a second counting query elsewhere, and do NOT re-derive counts client-side from paginated registration rows, which is exactly what migration 20260905163900:45 was written to stop.
- `emptyCounts` — `src/lib/volunteers/repository.server.ts`: Already declared at line 70-74 and already threaded through `toActivity`'s default parameter (line 82). A degradation path needs no new type — reuse this constant rather than inventing a nullable counts shape.
- `requireUpdated` — `src/lib/volunteers/repository.server.ts`: Lines 245-260 are the established way volunteer repo failures reach the client with a real HTTP status and machine-readable `code` (consumed by AdminApiError). Any new structured error (e.g. 403 for `volunteer_forbidden`, or a `counts_unavailable` signal) should use this same `Response.json({error:{code,message}})` envelope so src/lib/admin/session.ts:81-102 keeps reconstructing it.
- `withVolunteerErrors` — `src/lib/volunteers/http.server.ts`: Lines 37-62 are the single error funnel for all 13 volunteer handlers. New error mapping (Postgres errcode -> HTTP status) goes here, not in individual handlers.
- `DataTable (loading / empty props)` — `src/components/admin/DataTable.tsx`: Lines 43-53 already model `loading` and `empty` as distinct states. An error state should be added to this shared component (used by every admin list) rather than special-cased inside VolunteerManagement, so the identical error-reads-as-empty bug is fixed once for all admin tables.
- `availableRegistrationTransitions / canMarkAttendance / registrationStatusLabels / attendanceStatusLabels` — `src/components/admin/volunteers/volunteerAdminLogic.ts`: Lines 36-120 already encode the correct, tested transition set, the attendance gate, and the Chinese labels. VolunteerRegistrationDetail.tsx must import and use these instead of its hardcoded English arrays at lines 108-128 — the module is already imported in that file (line 6-10).
- `AdminApiError / fetchAdminJson` — `src/lib/admin/session.ts`: Lines 19-75 already carry `status`, `code` and `fields` from the server to the UI. Surfacing a volunteer list failure should use `error instanceof AdminApiError` on the existing thrown value — no new transport or error type is needed.
- `readMigrationBySuffix migration-contract tests` — `src/lib/supabaseMigrations.test.ts`: Line 329 shows the established pattern for asserting a volunteer migration's contents (function names, grants, locks). Add a block for `_volunteer_atomic_approval.sql` here rather than creating a new test harness. Note the memory-recorded preference: these are string assertions, so they must be paired with real Postgres execution — see docs/evidence/crm-package2/local-database-fifth-run.txt referenced by crm-package5/checkpoint.md:28.
- `set_volunteer_registration_status_with_audit / update_volunteer_activity_with_audit` — `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`: Lines 2-43 are the reference pattern for a volunteer mutation: advisory xact lock on hashtextextended(activity_id::text,0), row locks in a consistent order, expectedUpdatedAt version check, participant_count capacity gate, and the audit_log insert in the same transaction. Fixing the attendance write (repository.server.ts:470-484) should add a third function following this exact shape, not a new pattern.
- `src/routes/volunteer.tsx loadError pattern` — `src/routes/volunteer.tsx`: Lines 105-122 are the in-repo precedent for distinguishing a failed fetch from an empty result set on a volunteer surface. Mirror this semantic (distinct error copy rendered before the empty branch) on the admin screens.

### Open questions

- Does public.volunteer_activity_counts actually exist in the deployed database right now? The repo evidence (production-schema-preflight.json, dated 2026-09-06) says migration 20260905163900 was never applied and the approved repair skipped volunteer, but the preflight's function probe never included any volunteer signature. A read-only `select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('volunteer_activity_counts','set_volunteer_registration_status_with_audit','update_volunteer_activity_with_audit')` plus a service_role has_function_privilege check is needed before claiming the object is missing versus present-but-unprivileged versus present-but-stale-schema-cache.
- If volunteer_activity tables hold 12 rows but migration 20260704165600 is recorded `applied:false`, the production supabase_migrations history is out of sync with actual schema. Applying 20260905163900 needs a preflight on whether volunteer_registration.updated_at triggers and create_volunteer_registration already exist, otherwise a straight `supabase db push` may fail or re-run DDL out of order.
- PostgREST returns 404/PGRST202 for an unknown RPC and 42P01 for a missing relation; both are truthy `error` here, so both become a 500. Should a missing counts RPC degrade to zeroed counts (list still usable, capacity numbers wrong) or hard-fail with a visible banner? Degrading silently would make the capacity column lie, which is arguably worse than the current blank table — this is a product decision, not a purely technical one.
- Is there a deployment gate that verifies applied migrations match supabase/migrations before a Vercel release? Without one, the same drift that produced the CMS/CRM PGRST202 incident (docs/evidence/cms-payment-debug-20260906/README.md:9-10) will recur for volunteer.
- src/routes/admin/volunteers.tsx sets `ssr: false` and defines no `errorComponent`; with a bare `new QueryClient()` (src/router.tsx:6, throwOnError defaults to false) no router error boundary can ever catch these query failures. Should the fix be a per-component error branch, a shared DataTable error state, or a QueryClient-level `throwOnError` plus route errorComponents?


## Phase 2 — Animal photography pipeline and legacy import

The legacy import is an offline Python pipeline (scripts/legacy-import/) that staged a 28MB MariaDB export into a git-ignored SQLite DB, matched 1,142 of 1,256 supplied images to legacy `files.path` basenames by exact case-sensitive unique basename, and copied them content-addressed into `backups/legacy-import-20260906/animal-photos/<sha256>.<ext>` — all private, with `production_uploads: 0` (photo_stage.py:162). A separate production step replaced 44 placeholder animals with 248 canonical legacy animals (uuid5-derived IDs), published 248 reviewed `public_profile` objects, and published exactly 14 metadata-stripped JPEGs into the CMS's `content-media` bucket under a `legacy-animals/` prefix. The 234 animals without a photo are not a code defect: the referenced source files are simply absent from the supplied folder (live-photo-story-diagnosis.json:9) and the only list of what is needed lives in an untracked backups CSV. There is NO tracked ID-level legacy→canonical mapping artifact and no `legacy_id` column anywhere in supabase/migrations; the mapping survives only as a uuid5 derivation rule in Python plus gitignored JSON. The image storage contract is split and contradictory: the legacy publication used immutable content-addressed paths, while the only live admin path (src/components/admin/AnimalForm.tsx) uploads from the browser straight into a *public* bucket at a fixed mutable `${animalId}.jpg` with `upsert: true` before the DB write — so a failed DB save leaves the existing public photo already destroyed. Animal media has no private/public separation at all, in contrast to the content CMS which does have a correct private→public copy flow with digest verification.

### Already addressed at this commit (8)

- **Private photo staging writes were unsafe on interruption/redirection (direct-to-final object writes, fixed temporary manifest path)**
  - Evidence: scripts/legacy-import/photo_stage.py:34-74 now uses NamedTemporaryFile+fsync (write_temporary), verified atomic os.link publication with checksum recheck on FileExistsError (atomic_blob:46-66), and os.replace-based atomic_manifest:69-74; regression tests at scripts/legacy-import/test_photo_stage.py:19-51 assert no final/temp file survives a simulated os.link failure, that manifest symlinks are rejected, and that an old fixed .tmp path is untouched
- **Photo matching could invent associations via fuzzy/case-folded/extension-only matches or unsafe paths**
  - Evidence: scripts/legacy-import/photo_stage.py:18-31 safe_basename rejects backslash/colon/NUL, percent-encoded, absolute and traversal paths; unique_match requires exactly one metadata and one local candidate; tests scripts/legacy-import/test_photo_stage.py:5-17 cover traversal, remote URL, Windows path, duplicate metadata, duplicate local basename and case folding
- **Published photos could leak EXIF/GPS metadata or be silently re-encoded**
  - Evidence: scripts/legacy-import/photo_publication.py:7-31 remove_metadata strips APP1/APPD/COM segments without touching the entropy-coded scan; :45-48 asserts identical mode/size/tobytes between original and cleaned and that no exif/xmp/photoshop remains; test_photo_publication.py:5-15 proves ICC profile and scan data survive and the transform is idempotent. production-photo-publication.json:5-7 records 3 GPS sources cleaned and encoded_pixels_unchanged: true
- **Missing photos would break the public catalogue layout**
  - Evidence: src/components/site/AnimalPhoto.tsx:5-37 renders a labelled, dimension-stable fallback ('暫未有相片') and pins a failed URL in state so a broken image does not collapse the slot; live-photo-story-diagnosis.json:26-45 records 15/15 and 14/15 fallbacks rendering with zero pageErrors
- **The 234 missing photos were an unexplained product gap**
  - Evidence: docs/evidence/legacy-import-20260906/live-photo-story-diagnosis.json:10-21 shows all 248 animals carry a source photo reference but only 14 referenced basenames exist in the supplied folder (case-insensitive, all extensions); docs/development-completion-evidence.md:204 records the same recheck against all 1,256 files. Root cause is absent source material, not a failed request path
- **animals.public_profile column absent in production (profile-production-preflight.json:11)**
  - Evidence: docs/evidence/legacy-import-20260906/profile-production-publication.json:5-23 supersedes it: production migration version 20260907011009 maps to supabase/migrations/20260906181657_animal_public_profile.sql, 248 profiles applied, 14 photo links unchanged, rls_enabled true
- **Animal writes from the browser were completely unaudited**
  - Evidence: supabase/migrations/20260803120000_audit_animal_mutations.sql:26-79 installs public.log_animal_mutation, a SECURITY DEFINER trigger that writes an audit_log row for every auth.uid()-bearing write, with a documented scope note at :1-24 explaining why service-role writes are excluded
- **Content media had no private staging or public-copy verification**
  - Evidence: supabase/migrations/20260905155426_content_private_media_sessions.sql:2-31 provisions content-media-private plus content_media_session/content_public_asset, and src/lib/content/mediaLifecycle.repository.server.ts:160-182 copies to public with upsert:false and a digest recheck. This is correct — it just does not cover animal photos

### Open (15)

**[BLOCKER] A failed DB save after a successful photo upload permanently destroys the animal's existing public photo. The upload runs first with upsert:true at a fixed path; the animals UPDATE/INSERT runs afterwards and, on failure, simply returns — leaving the public object already replaced. Because the path is unchanged, image_url still points at it, so the public site immediately serves the new bytes for a save the admin was told failed.**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:74-88 uploads to `animal-images` at `${animalId}.jpg` with `{ upsert: true }` and returns early on uploadError; the DB write only happens at :105-122 and its failure path (`setError(copy.form.saveError); setSaving(false); return;`) performs no storage rollback and no restore of the previous object

**[HIGH] Two contradictory image storage contracts coexist for the same animals.image_url column. The legacy publication used immutable content-addressed objects; the only live admin path uses a mutable fixed key with upsert, so the same URL serves different bytes over time (CDN/browser staleness, no digest, no provenance, no way to tell which bytes an animal was reviewed with).**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: scripts/legacy-import/photo_publication.py:52 emits `'object_path':'legacy-animals/'+digest+'.jpeg'` (sha256-named, immutable) and docs/development-completion-evidence.md:155 confirms publication 'in content-media/legacy-animals'; src/components/admin/AnimalForm.tsx:78,86 uses the mutable `${animalId}.jpg` key in a different bucket entirely

**[HIGH] The `animal-images` storage bucket is not provisioned by any migration — it exists only as a manual dashboard instruction in a plan document. Any fresh environment (local supabase start, the CI fixture, a disaster-recovery restore) has no such bucket, so every admin animal photo upload fails there and the whole animal save aborts.**

- File: `supabase/migrations`
- Phase: Phase 2
- Evidence: grep of supabase/ shows storage.buckets inserts only for receipts, adoption-files, adoption-application-photos, sponsorship-payment-proof, site-documents, content-media and content-media-private (20260623160506:356, 20260626140914:500, 20260701185227:177, 20260702130000:89, 20260718100000:116, 20260831160000:14, 20260905155426:2) — none for animal-images. docs/superpowers/plans/2026-06-11-content-migration.md:165-176 says 'In Supabase dashboard: Storage → New bucket → name: animal-images, Public: ON'. scripts/ci/supabase-fixture.mjs contains no bucket/storage handling at all

**[HIGH] Animal photos have no private/public separation and no server-side byte validation. The browser uploads arbitrary file bytes straight into a PUBLIC bucket with no magic-byte check, no size cap, no digest, and no review step — the file is world-readable the instant the upload returns, before any DB row or approval exists.**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:74-88 is the entire pipeline: `supabase.storage.from('animal-images').upload(...)` then `getPublicUrl(...)`. There is no src/lib/animals/repository.server.ts or service.ts (src/lib/animals contains only eligibility.server.ts and public* readers), and no createSignedUploadUrl/uploadToSignedUrl call site exists for animals — that pattern is used only by content (src/components/admin/content/ContentEditor.tsx:1652) and adoption-guide releases. Contrast src/lib/content/mediaLifecycle.server.ts:64-85 (matchesContentImage/contentMediaDigest) and mediaLifecycle.repository.server.ts:160-182 (copyPublic with upsert:false + digest recheck)

**[HIGH] The content-media reconciliation job classifies the 14 published legacy animal photos as orphan deletion candidates. Its protected set is built only from content_media / content_revision / content_public_asset / content_media_session references; public.animals.image_url is never consulted, and the 14 objects live in the same content-media bucket under legacy-animals/.**

- File: `scripts/reconcile-content-media.ts`
- Phase: Phase 2
- Evidence: scripts/reconcile-content-media.ts:18-31 builds protectedPaths from revisionObjects+mediaObjects+publicationObjects+sessions only, then marks every object older than 24h and not in that set a candidate; scripts/content-media-reconciliation-local.ts:87-89 scans `storage.objects where bucket_id in ('content-media','content-media-private')` and :51-58 calls storage.remove() on the candidates (the 14 are far under the 100 cap at :49). docs/development-completion-evidence.md:155 places the photos in content-media/legacy-animals

**[HIGH] No ID-level source mapping artifact exists anywhere in the repository or the database. The legacy_id → canonical animal UUID map survives only as a uuid5 derivation rule in Python plus a gitignored JSON file that is not present in this working tree, so nothing tracked can answer 'which legacy record is this animal' for photo reconciliation, re-import or rollback review.**

- File: `supabase/migrations/20260906162436_animal_catalog_membership.sql`
- Phase: Phase 2
- Evidence: `grep -rn 'legacy_id|source_url|source_system' supabase/` returns no matches — public.animals has no such column (supabase/migrations/20260611162942_create_animals_table.sql:1-15 plus later additive migrations). private.animal_replacement_row (supabase/migrations/20260906162436_animal_catalog_membership.sql:50-57) stores only batch_id/animal_id/operation/before_image/after_image. The derivation lives at scripts/legacy-import/animal_replacement.py:39 (`uuid.uuid5(uuid.NAMESPACE_URL,'hkscda:legacy:v1:animals:'+key)`) and the concrete list only in `backups/legacy-import-20260906/animal-replacement-candidate.json`, which .gitignore:62 excludes and which does not exist in this checkout (`ls backups` → No such file or directory)

**[HIGH] The actual production photo publisher is not in the repository. photo_publication.py stops at writing a plan JSON into the gitignored backups directory; nothing tracked performs the Storage upload, the animals.image_url link, or the legacy_animal_photo_publish audit write. The publication that produced the current 14 photos is therefore unreproducible from a clean clone, and the next batch has no runnable tool.**

- File: `scripts/legacy-import/photo_publication.py`
- Phase: Phase 2
- Evidence: scripts/legacy-import/photo_publication.py:53 ends with `(root/'photo-publication-plan.json').write_text(...)`; a grep for storage/supabase/upload/http across scripts/legacy-import/*.py finds no client code. scripts/legacy-import/rehearse_public_profiles.py:27 reads back `photo-publication-uploaded.json` from the same untracked backups root, proving the uploaded-state record exists only outside Git. docs/evidence/legacy-import-20260906/production-photo-publication.json:10 records the audit action that no tracked code writes

**[HIGH] 234 of 248 active animals still have no photo and the only record of which source files are needed is untracked. This is the headline Phase 2 gap and it currently has no in-repo work item, checklist or manifest.**

- File: `docs/evidence/legacy-import-20260906/live-photo-story-diagnosis.json`
- Phase: Phase 2
- Evidence: docs/evidence/legacy-import-20260906/live-photo-story-diagnosis.json:7-9 (`linked_photos: 14`, `missing_source_files: 234`) and :13-21 (`source_photo_reference: 248`, `local_basename_match_case_insensitive: 14`, `referenced_file_absent_from_folder: 234`); docs/development-completion-evidence.md:204 states the list 'is saved at backups/legacy-import-20260906/missing-animal-photo-files.csv' — inside the directory .gitignore:62 excludes and which is absent from this checkout

**[MEDIUM] photo_publication.py is hard-pinned to the single historical batch of 14 and cannot process a second batch. It asserts an exact count and reads its inputs from the gitignored backups tree, so it will abort the moment the 234 missing source files arrive and the candidate set changes.**

- File: `scripts/legacy-import/photo_publication.py`
- Phase: Phase 2
- Evidence: scripts/legacy-import/photo_publication.py:37-38 `targets=[...]` followed by `assert len(targets)==14`; :36 and :42 read `animal-replacement-candidate.json` and `animal-photos/` from `checked_database_path('backups/legacy-import-20260906/verified-staging.sqlite').parent`, a path .gitignore:62 excludes

**[MEDIUM] animals.image_url is unconstrained free-form text with no bucket/path/digest columns, so it can point at an arbitrary third-party URL. The legacy importer actively does this — it falls back to hotlinking the legacy site's own photo URL, which would render remote images on public pages with no privacy, availability or content control.**

- File: `supabase/migrations/20260611162942_create_animals_table.sql`
- Phase: Phase 2
- Evidence: supabase/migrations/20260611162942_create_animals_table.sql:12 `image_url text,` with no CHECK, and no later migration touches it (grep 'image_url' over supabase/ returns only that line plus seed.sql). scripts/import-hkscda-animals.js:159 `let image_url = animal.mainPhotoUrl || null;` — mainPhotoUrl is the scraped remote URL (scripts/scrape-hkscda-animals.js:392)

**[MEDIUM] scripts/import-hkscda-animals.js derives storage keys from the array index, so re-running the scraper with any change in ordering reassigns photos to the wrong animals — overwriting live public objects with another animal's picture. It runs with the service-role key and upsert:true, and is still wired as an npm script.**

- File: `scripts/import-hkscda-animals.js`
- Phase: Phase 2
- Evidence: scripts/import-hkscda-animals.js:161 `const storageKey = \`hkscda-${animal.animalType}-${i}.jpg\`;` where i is the loop index from :146, uploaded at :115-117 with `{ upsert: true, contentType: 'image/jpeg' }` using SUPABASE_SERVICE_ROLE_KEY (:44,:57). package.json:17 exposes it as `import:hkscda`. It is also currently broken on its own terms: :26 reads `data/hkscda-animals.json` while the repo ships `data/hkscda_animals.json`

**[MEDIUM] Animal create/update/delete and photo upload bypass the route -> -handlers.ts -> http.server.ts -> service.ts -> repository.server.ts layering entirely, writing from the browser with the anon client under RLS only. There is no server-side animal mutation module to attach validation, image policy or provenance to.**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:106-121 calls `supabase.from('animals').update(...)`/`.insert(...)` directly; src/components/admin/AnimalsTable.tsx:53 calls `supabase.from('animals').delete()`. src/lib/animals/ contains only eligibility.server.ts and public* readers — no repository.server.ts, service.ts or http.server.ts. supabase/migrations/20260803120000_audit_animal_mutations.sql:3-11 documents this gap explicitly ('AnimalForm and AnimalsTable write to public.animals DIRECTLY from the browser ... bypassing the repository layer')

**[MEDIUM] Admin animal deletion hard-deletes the row and leaves the Storage object behind, contradicting the retire-don't-delete model the legacy replacement depends on. Orphan public objects accumulate forever, and deleting a legacy-imported animal silently invalidates the replacement rollback manifest's after-image check.**

- File: `src/components/admin/AnimalsTable.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalsTable.tsx:52-56 `await supabase.from('animals').delete().eq('id', id);` with no storage remove and no retired_at path. supabase/migrations/20260906162436_animal_catalog_membership.sql:31-34 introduced retired_at precisely to preserve foreign keys, and scripts/legacy-import/replacement_transaction.sql:52-54 aborts rollback with 'Imported row changed; review required' when a row is missing or altered

**[MEDIUM] Animal photos were published into the CMS's content-media bucket rather than an animal-owned bucket, mixing two domains with different lifecycles, owners and cleanup jobs. This is what makes the reconciliation misclassification possible and leaves animal media governed by content-media's mime/size policy.**

- File: `scripts/legacy-import/photo_publication.py`
- Phase: Phase 2
- Evidence: docs/development-completion-evidence.md:155 'Published 14 ... photos in content-media/legacy-animals'; scripts/legacy-import/photo_publication.py:52 emits the bare `legacy-animals/<digest>.jpeg` prefix with no bucket of its own. supabase/migrations/20260831160000_content_media_storage_bucket.sql:1-13 documents that bucket as existing solely for src/lib/content/repository.server.ts's mediaPublicUrl()

**[LOW] 27 supplied images remain permanently held with no follow-up path: 10 MPO multi-image files rejected by the JPEG/PNG-only contract and 7 Pillow decode/read failures. The tooling performs no first-frame extraction or conversion and offers no re-triage mode.**

- File: `scripts/legacy-import/photo_stage.py`
- Phase: Phase 2
- Evidence: docs/evidence/legacy-import-20260906/animal-photo-profile.json:20-23 (`OSError: 7`, `Unsupported image format: 10`); scripts/legacy-import/photo_stage.py:126-132 rejects anything whose Pillow format is not JPEG/PNG; docs/evidence/legacy-import-20260906/animal-photo-results.md:13 records 'No automatic format conversion or first-frame extraction performed'

### Must reuse, not reinvent (13)

- `createContentMediaLifecycle / ContentMediaPorts` — `src/lib/content/mediaLifecycle.server.ts`: The already-shipped allocate -> signed upload -> download -> verify -> finalize -> prepare -> copyPublic -> markReady state machine (mediaLifecycle.server.ts:86-165). Any animal photo pipeline must be modelled on this port contract rather than a second, ad-hoc browser upload path.
- `matchesContentImage / contentMediaDigest` — `src/lib/content/mediaLifecycle.server.ts`: Lines 64-85: magic-byte validation for jpeg/png/webp and SHA-256 digest via crypto.subtle. Server-side animal image validation must call these, not reimplement signature checks.
- `copyPublic (upsert:false + digest recheck)` — `src/lib/content/mediaLifecycle.repository.server.ts`: Lines 160-182 are the exact correct pattern the animal path violates: never overwrite an existing public object, re-verify the source digest before copying, and treat an existing identical object as success. Fixing AnimalForm should adopt this, not invent a new upload.
- `content_media_session / content_public_asset tables + create_/finalize_/prepare_/mark_ RPCs` — `supabase/migrations/20260905155426_content_private_media_sessions.sql`: Lines 2-136 define the private bucket, session table with expiry+sha256 CHECK, immutable public_path uniqueness, ready flag and a publish-blocking trigger. An animal media session table should mirror this shape (and reuse content-media-private or an animal equivalent) rather than defining a fresh scheme.
- `content-media-private / content-media bucket pair` — `supabase/migrations/20260905155426_content_private_media_sessions.sql`: Line 2-4 plus 20260831160000:14-25 show the migration-declared bucket pattern with file_size_limit and allowed_mime_types. The missing animal-images bucket must be declared this way, not by hand in the dashboard.
- `selectContentMediaReconciliationCandidates` — `scripts/reconcile-content-media.ts`: Lines 14-32 own the orphan-detection contract. Animal photo references (public.animals.image_url, or a new animal_media table) must be added to its protectedPaths inputs and to the lockedInventory queries in scripts/content-media-reconciliation-local.ts:87-109 — extending this, not writing a second reconciler.
- `safe_basename / unique_match / atomic_blob / atomic_manifest` — `scripts/legacy-import/photo_stage.py`: Lines 18-74 are reviewed, tested (test_photo_stage.py) path-safety and atomic-write primitives. Processing the 234 missing source files when they arrive must reuse these rather than re-deriving matching rules.
- `remove_metadata` — `scripts/legacy-import/photo_publication.py`: Lines 7-31 strip EXIF/XMP/IPTC/comments without re-encoding pixels and are proven idempotent by test_photo_publication.py. Any future animal photo publication must route bytes through this.
- `canonical uuid5 derivation 'hkscda:legacy:v1:animals:<legacy_id>'` — `scripts/legacy-import/animal_replacement.py`: Line 39 (mirrored at public_profiles.py:88 and target_lookups.py:20) is the only definition of the legacy->canonical ID mapping. Any durable mapping table or photo reconciliation must use this exact namespace/string, and any new work should persist it rather than re-deriving it a fourth time.
- `private.animal_replacement_batch / animal_replacement_row + pg_temp.apply_/rollback_animal_replacement` — `supabase/migrations/20260906162436_animal_catalog_membership.sql`: Lines 42-61 plus scripts/legacy-import/replacement_transaction.sql give the batch provenance, exact after-image guard, EXCLUSIVE-lock rollback and FK-reference refusal. A photo publication batch must record provenance in this same structure so photo and animal rollbacks compose instead of conflicting.
- `private.is_valid_animal_public_profile + animals.public_profile` — `supabase/migrations/20260906181657_animal_public_profile.sql`: Lines 2-38 are the deployed allowlist-and-validate pattern for legacy-sourced public animal data. Any new animal media provenance column should be constrained the same way rather than added as free text (the mistake image_url already embodies).
- `parsePublicAnimalProfile / projectPublicAnimal` — `src/lib/animals/publicProfile.ts`: Lines 26-96 are the single public read boundary for animal data; image_url passes through untouched at :91. Any image policy (allowed host/bucket, fallback) belongs here so both listing and detail readers get it.
- `public.log_animal_mutation trigger` — `supabase/migrations/20260803120000_audit_animal_mutations.sql`: Lines 26-79 already audit every browser-direct animal write. A server-side animal mutation route must follow the documented convention at :13-24 (service-role writes attribute their own actor via requireAdmin + insertAuditLog) instead of double-logging.

### Open questions

- Which bucket actually holds the 14 published photos? scripts/legacy-import/photo_publication.py:52 emits a bare 'legacy-animals/<digest>.jpeg' object path with no bucket named; only docs/development-completion-evidence.md:155 says 'content-media/legacy-animals'. This needs a live storage.objects check before any reconciliation or bucket migration is written.
- Does the deployed project actually have an 'animal-images' bucket, and with what public flag / mime / size policy? It exists in no migration, so its real configuration is unknowable from source and differs per environment by construction.
- Are the 234 missing source photo files obtainable at all (legacy site export, owner's own storage, or the original uploads directory)? The entire remaining Phase 2 photo gap is blocked on this and nothing in the repo tracks the ask.
- Two tracked artifacts disagree about production: profile-production-preflight.json:11 says public_profile_column_exists false, profile-production-publication.json:5-9 says migration 20260907011009 applied it with 248 rows. The publication file is later, but a read-only live check should settle it before any further profile/photo work.
- Repository migration filenames do not match the production migration versions that were actually applied (20260906162436 -> 20260906173545 per membership-production-repair.json:3-4; 20260906181657 -> 20260907011009 per profile-production-publication.json:5-6). Anything that replays migrations by filename will double-apply or skip; the mapping is recorded only in prose.
- I could not find a six-phase revision plan document anywhere under docs/ in this checkout, so every still_broken item is labelled 'Phase 2' (my assigned area) rather than mapped against phase definitions I never saw.
- Do the 14 published objects still exist in Storage and is animals.image_url their only referent? If the local reconciliation job has ever been pointed at anything but the disposable 127.0.0.1:55321 instance, they would already be gone.


## Phase 2 — Animal CMS (list, editor, schema, eligibility, publication)

At commit c037cc1 the Phase 2 *database* work is done but the Phase 2 *CMS* work is not. `public.animals` now carries `adoption_eligible`/`sponsorship_eligible`/`retired_at` NOT NULL booleans plus a constrained `public_profile jsonb` whose allowlist is enforced by `private.is_valid_animal_public_profile()`, and the public read path (RLS policy, `publicListing.server.ts`, `eligibility.server.ts`, sitemap, `AnimalCard`) fully honours independent adoption/sponsorship membership and retirement — production evidence shows 248 active animals resolving to 100 adoption cats + 108 adoption dogs + 115 sponsors, i.e. dual membership is live. The admin surface was not updated at all: `src/routes/admin/index.tsx` still lists by `.eq("type", section)` with no `.range()`, no `retired_at` filter and no pagination, and `AnimalForm.tsx`/`AnimalsTable.tsx` still write straight to `public.animals` from the browser anon client with a Zod schema that contains none of `public_profile`, `adoption_eligible`, `sponsorship_eligible` or `retired_at`. A repo-wide grep proves those four columns appear in zero files under `src/components/admin/` or `src/routes/api/` — they are writable only by the offline Python importers in `scripts/legacy-import/`. `species` is still `check (type in ('cat','dog','sponsor'))` (never narrowed to cat/dog), publication status is still conflated with care status through the single `status` column, and there is no draft/preview/publish or revision history for animals — `content_revision` in 20260905150012 is scoped to `content_item` only.

### Already addressed at this commit (9)

- **Adoption and sponsorship eligibility are now independent NOT NULL booleans on public.animals, not derived from a single `type` value**
  - Evidence: supabase/migrations/20260906162436_animal_catalog_membership.sql:3-8 adds `adoption_eligible boolean`, `sponsorship_eligible boolean`, `retired_at timestamptz`, backfills from `type`, then `ALTER COLUMN adoption_eligible SET NOT NULL, ALTER COLUMN sponsorship_eligible SET NOT NULL`. Production evidence at docs/evidence/legacy-import-20260906/profile-production-publication.json shows 248 active animals but 100 cats + 108 dogs + 115 sponsors = 323 memberships, i.e. dual membership is live.
- **Public read path honours independent membership and retirement rather than `type`**
  - Evidence: RLS policy at supabase/migrations/20260906162436_animal_catalog_membership.sql:33-34 `USING (status='available' AND retired_at IS NULL AND (adoption_eligible OR sponsorship_eligible))`; src/lib/animals/publicListing.server.ts:19-24 filters `.is("retired_at", null)` and `.eq(type==='sponsor' ? 'sponsorship_eligible' : 'adoption_eligible', true)` and only adds `.eq("type", …)` for non-sponsor; src/lib/animals/publicListing.ts:19-22 `isPublicAnimalMember`.
- **Archiving no longer requires deleting rows — retirement preserves foreign keys**
  - Evidence: supabase/migrations/20260906162436_animal_catalog_membership.sql:31 comment plus the `retired_at` column; scripts/legacy-import/replacement_transaction.sql:24 `UPDATE public.animals SET retired_at=now(),updated_at=now() WHERE id=old_row.id` instead of DELETE, with rollback at line 65.
- **public_profile is a schema-constrained allowlist, not a raw legacy blob — private legacy fields, URLs, emails and phone numbers cannot be stored**
  - Evidence: supabase/migrations/20260906181657_animal_public_profile.sql:8 restricts keys to code/birthday/neutered/suitability/personality/health/story/recordDate; :28-29 rejects `[<>@]`, `https?://`, `www.` and phone-like runs; :37-38 `ADD COLUMN public_profile jsonb NOT NULL DEFAULT '{}'` + `ADD CONSTRAINT animals_public_profile_valid CHECK(private.is_valid_animal_public_profile(public_profile))`.
- **Public projection strips internal notes and unknown columns before they reach the reader**
  - Evidence: src/lib/animals/publicProfile.ts:85-86 sets `notes: null, notes_en: null` and returns an explicit field list (no passthrough); mirrored by src/lib/animals/publicProfile.test.ts:45-56.
- **Browser-anon writes to public.animals are audited at the database layer**
  - Evidence: supabase/migrations/20260803120000_audit_animal_mutations.sql:85-93 installs `audit_animals`, `audit_animal_profile_internal` and `audit_animal_match` AFTER-row triggers calling `public.log_animal_mutation()`, which inserts into `public.audit_log` whenever `auth.uid()` is present (:37-39).
- **The broad `admin full access` policy (auth.role()='authenticated') is replaced by a staff/admin role check**
  - Evidence: supabase/migrations/20260906162436_animal_catalog_membership.sql:36-40 drops both `admin full access` and `staff can manage animals` then recreates `staff can manage animals ... USING (private.has_admin_role(ARRAY['staff','admin']))`, reapplying supabase/migrations/20260627091500_tighten_animals_admin_policy.sql.
- **Public listing pagination no longer double-counts or drops rows (defect G-01) — filters are applied to the full RLS-approved set before slicing, with a deterministic order**
  - Evidence: src/lib/animals/publicListing.ts:49-53 `comparePublicAnimals` (created_at desc, then id asc) and :102-111 total computed from the filtered set; src/lib/animals/publicListing.server.ts:21-22 matching `.order("created_at", …).order("id", …)`.
- **Admin ?section=cat/dog/sponsor entry points exist and are role-gated**
  - Evidence: src/routes/admin/index.tsx:17-19 `z.enum(["cat","dog","sponsor","applications","payments"]).catch("cat")` with `beforeLoad` calling `requireAdminPageAccess`; src/components/admin/adminNav.ts:63,71,79 link to `/admin?section=cat|dog|sponsor`; src/lib/admin/access.ts:75-77 maps all three to the `animals` area.

### Open (17)

**[BLOCKER] The admin list keys off `type`, so the new independent memberships are invisible in the CMS — a cat with sponsorship_eligible=true never appears in the sponsor section, and a sponsor-typed animal with adoption_eligible=true never appears in cat/dog**

- File: `src/routes/admin/index.tsx`
- Phase: Phase 2
- Evidence: src/routes/admin/index.tsx:60 `.eq("type", section)`. The public side does the opposite (src/lib/animals/publicListing.server.ts:20-24 filters on the eligibility boolean and drops the `type` filter for sponsors). Production has 323 memberships across 248 animals, so rows visible publicly in /sponsors are not reachable from /admin?section=sponsor.

**[BLOCKER] The animal editor cannot read or write adoption_eligible, sponsorship_eligible, retired_at or public_profile — the entire Phase 2 schema is unreachable from the CMS**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:10-23 the Zod schema contains only name/name_en/type/gender/age/age_en/notes/notes_en/description/description_en/status; the update and insert payloads at :90-103 contain the same set. A repo-wide grep for `retired_at|adoption_eligible|sponsorship_eligible` returns hits only in src/lib/animals/**, src/routes/sitemap[.]xml.ts, src/components/site/AnimalCard.tsx and src/types/animal.ts — zero hits under src/components/admin/ or src/routes/api/. Same for `public_profile`: it appears only in src/components/site/AnimalCard.tsx, AnimalDetail.tsx, src/lib/animals/** and src/types/animal.ts. The only writers of public_profile are scripts/legacy-import/profile_transaction.sql:22 and scripts/legacy-import/public_profiles.py.

**[BLOCKER] Catalogue membership can only be changed from the CMS by changing the species, and doing so silently rewrites both eligibility booleans**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:135-139/239-245 expose `type` as the only membership control (cat|dog|sponsor). supabase/migrations/20260906162436_animal_catalog_membership.sql:16-22 — on a type change into or out of 'sponsor' the trigger overwrites `adoption_eligible:=(NEW.type IN ('cat','dog'))` and `sponsorship_eligible:=(NEW.type='sponsor')`. So saving a cat as 'sponsor' silently removes it from the adoption catalogue, and no admin UI warns about it or can restore the dual membership the public UI already renders (src/components/site/AnimalCard.tsx:42-47 shows 可助養/可領養 badges).

**[BLOCKER] Publication status, care status and archiving are not separate: the single `status` column is simultaneously the care state and the public-visibility switch**

- File: `supabase/migrations/20260906162436_animal_catalog_membership.sql`
- Phase: Phase 2
- Evidence: supabase/migrations/20260611162942_create_animals_table.sql:10-11 `status ... check (status in ('available','adopted','fostered'))`; the public RLS policy at supabase/migrations/20260906162436_animal_catalog_membership.sql:34 requires `status='available'`. There is no `published`/`is_published`/`publish_state` column anywhere in supabase/migrations. Consequence: a fostered animal cannot be shown publicly, an animal cannot be prepared unpublished (every new row defaults to `status='available'` and goes live immediately), and the AnimalForm status select (src/components/admin/AnimalForm.tsx:144-148) is the only publish control. `retired_at` is the only archiving axis and is not settable from any admin surface.

**[BLOCKER] There is no draft/preview/publish versioning or revision history for animals**

- File: `supabase/migrations/20260905150012_content_revision_lifecycle.sql`
- Phase: Phase 2
- Evidence: supabase/migrations/20260905150012_content_revision_lifecycle.sql:6-22 creates `content_revision`/`content_publish_request` keyed on `content_item_id uuid not null references public.content_item(id)` only — nothing references public.animals. There is no /api/admin/animals route at all (`ls src/routes/api/admin` lists about-pages, access, adoption-guide-releases, adoption-information, adoptions, annual-reports, content, documents, donations, exports, faq, finance, knowledge, me, payment-methods, payments, receipts, sponsorships, supporters, volunteers — no animals). The only history for an animal edit is the append-only audit_log row from the trigger in supabase/migrations/20260803120000_audit_animal_mutations.sql:85-88, which cannot be previewed, diffed in the UI, or rolled back.

**[HIGH] The admin animal list is not server-paginated: it fetches every row of the section in one unbounded query and filters client-side**

- File: `src/routes/admin/index.tsx`
- Phase: Phase 2
- Evidence: src/routes/admin/index.tsx:58-62 `supabase.from("animals").select("*").eq("type", section).order("created_at", {ascending:false})` — no `.range()`, no `count`, no page state. Search is then done in memory at src/components/admin/AnimalsTable.tsx:46-50, and `AnimalsTable` renders `<DataTable rows={filtered}>` (:156-159) with no `TablePager`. PostgREST silently caps the response at the project max-rows setting, so with 292 production rows the list is already near the cap and an admin can be shown a truncated catalogue with no indication.

**[HIGH] `species` is still not constrained to cat/dog — 'sponsor' remains a value of the species column, and the sponsorship snapshot constraint was widened to keep it**

- File: `supabase/migrations/20260611162942_create_animals_table.sql`
- Phase: Phase 2
- Evidence: supabase/migrations/20260611162942_create_animals_table.sql:3 `type text not null check (type in ('cat','dog','sponsor'))`; no later migration alters that constraint (grep for `animals_type_check`/`check (type` across supabase/migrations returns only this line plus unrelated tables). supabase/migrations/20260906162436_animal_catalog_membership.sql:64-68 drops and re-adds `sponsorship_preference_animal_type_snapshot_check` as `CHECK (animal_type_snapshot IN ('cat','dog','sponsor'))`, explicitly preserving 'sponsor' as a species value. src/types/animal.ts:1 `export type AnimalType = "cat" | "dog" | "sponsor"`. Production still holds sponsor-typed rows, and such a row with adoption_eligible=true would render a link to `/animals/sponsor/{id}` (src/components/site/AnimalCard.tsx:20), a route that does not exist.

**[HIGH] The animal editor still writes through the browser anon Supabase client rather than an API, so the documented route -> -handlers -> http.server -> service -> repository.server layering, server-side validation and CSRF/authz checks are all bypassed**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:6 imports `supabase` from ../../lib/supabase (the anon client built from VITE_SUPABASE_ANON_KEY, src/lib/supabase.ts:11-17); :106-109 `supabase.from("animals").update({...payload, updated_at: new Date().toISOString()}).eq("id", existing.id)` and :116 `supabase.from("animals").insert(payload)`. Reads too: src/routes/admin/index.tsx:58 and src/routes/admin/animals/$id.edit.tsx:56. Only RLS (`private.has_admin_role(ARRAY['staff','admin'])`) guards these writes. supabase/migrations/20260803120000_audit_animal_mutations.sql:3-11 documents this as a known exception, not as fixed.

**[HIGH] Deleting an animal from the admin list is a hard DELETE whose error is discarded, so a failed delete looks like a success**

- File: `src/components/admin/AnimalsTable.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalsTable.tsx:52-56 `await supabase.from("animals").delete().eq("id", id); setConfirmDelete(null); onDeleted();` — the `{ error }` result is never destructured or checked. supabase/migrations/20260626140914_adoption_coordinator_foundation.sql:133 `animal_id uuid not null references public.animals(id) on delete restrict` on `successful_adoption`, so deleting any adopted animal raises 23503; the UI closes the confirmation, refetches, and the row silently reappears with no message. Line 117 of the same migration cascades `animal_match`, so a delete that *does* succeed destroys adoption-case match history that `retired_at` was added to preserve.

**[HIGH] The admin list does not filter or flag retired rows, so retired legacy placeholders stay in the cat/dog/sponsor lists forever and are indistinguishable from live animals**

- File: `src/routes/admin/index.tsx`
- Phase: Phase 2
- Evidence: src/routes/admin/index.tsx:58-62 has no `.is("retired_at", null)` and no retired filter; src/components/admin/AnimalsTable.tsx:105-145 defines columns photo/name/gender/age/status/actions — no retired or eligibility column, and `statusTones` (:15-19) knows only available/adopted/fostered. scripts/legacy-import/replacement_transaction.sql:24 retires rows in place (`SET retired_at=now()`) without changing `status`, and scripts/legacy-import/rehearse_animal_replacement.py:90 rehearses a 292-row batch.

**[HIGH] Both Phase 2 migrations are non-idempotent and the deployed public_profile migration is recorded in production under a different version than the repository filename, so a re-run or `supabase db push` will error mid-file**

- File: `supabase/migrations/20260906181657_animal_public_profile.sql`
- Phase: Phase 2
- Evidence: supabase/migrations/20260906181657_animal_public_profile.sql:37-38 `ALTER TABLE public.animals ADD COLUMN public_profile ...` and `ADD CONSTRAINT animals_public_profile_valid ...` — neither uses IF NOT EXISTS. supabase/migrations/20260906162436_animal_catalog_membership.sql:42,50 `CREATE TABLE private.animal_replacement_batch (` / `CREATE TABLE private.animal_replacement_row (` without IF NOT EXISTS, and :64-65 `ALTER TABLE public.sponsorship_preference DROP CONSTRAINT sponsorship_preference_animal_type_snapshot_check;` without IF EXISTS. docs/evidence/legacy-import-20260906/profile-production-publication.json records `"migration_version": "20260907011009"` against `"repository_migration": "20260906181657_animal_public_profile.sql"`, and docs/development-completion-evidence.md warns it "must not be reapplied by filename mismatch" — the guard is a prose note, not code.

**[HIGH] The `animal-images` storage bucket the editor uploads to is not declared in any migration, so its visibility, size limit, MIME allowlist and storage RLS policies are unversioned manual state**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:76-87 uploads to `supabase.storage.from("animal-images")`. Every other bucket is created in SQL — 'receipts' (20260623160506:356), 'adoption-files' (20260626140914:500), 'adoption-application-photos' (20260701185227:177), 'sponsorship-payment-proof' (20260702130000:89), 'site-documents' (20260718100000:117), 'content-media' (20260831160000:14), 'content-media-private' (20260905155426:3). `animal-images` appears in no migration; grep finds it only in AnimalForm.tsx and scripts/import-hkscda-animals.js.

**[HIGH] The animal CMS list and editor have zero automated test coverage**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: `find src -name "AnimalForm*test*" -o -name "AnimalsTable*test*"` returns nothing; src/components/admin/ contains only TablePager.test.tsx and adminNav.test.ts. src/routes/admin/ has login.test.tsx, reset-password.test.tsx and -supporters.test.tsx but no test for index.tsx, animals/new.tsx or animals/$id.edit.tsx. The Phase 2 tests that do exist (src/lib/animals/membership.test.ts, eligibility.server.test.ts, publicProfile.test.ts, publicListing.test.ts) all cover the public read path only.

**[HIGH] Two competing adoption-eligibility flags now exist and neither side reads the other**

- File: `src/lib/adoptions/repository.server.ts`
- Phase: Phase 2
- Evidence: `animal_profile_internal.is_adoptable` / `is_inside_support_pool` (supabase/migrations/20260626140914_adoption_coordinator_foundation.sql:201-... , indexed at :362-363) drive the coordinator pipeline filters in src/lib/adoptions/repository.server.ts:797-845 and the AnimalPipeline UI (src/components/admin/adoptions/AnimalPipeline.tsx:113-117 'Adoptable'/'Not adoptable'). The new `animals.adoption_eligible` drives the public catalogue. `listAnimalPipeline` (src/lib/adoptions/repository.server.ts:1730-1808) never selects or writes adoption_eligible/sponsorship_eligible/retired_at, so a coordinator marking an animal not adoptable does not remove it from the public site, and vice versa.

**[MEDIUM] The public listing loads the entire eligible catalogue on every request and paginates in memory — the listing is not server-paginated either**

- File: `src/lib/animals/publicListing.server.ts`
- Phase: Phase 2
- Evidence: src/lib/animals/publicListing.server.ts:14-36 loops `.range(from, from+999)` until a short batch, pushing every matching row into an in-process array, and src/lib/animals/publicListing.ts:75-106 filters and `.slice()`s that array. Free-text search, age, neutered and suitability filters (:78-99) cannot be pushed to Postgres because `age` is free text and `public_profile` is unindexed jsonb. With 248 active animals this is tolerable; it does not scale and there is no index on (status, retired_at, adoption_eligible) anywhere in supabase/migrations.

**[MEDIUM] On create, the uploaded photo is stored under a throwaway UUID that is never the animal's id, orphaning the object; the extension is also hard-coded to .jpg regardless of the real file type**

- File: `src/components/admin/AnimalForm.tsx`
- Phase: Phase 2
- Evidence: src/components/admin/AnimalForm.tsx:75 `const animalId = existing?.id ?? crypto.randomUUID();` then :78 `.upload(`${animalId}.jpg`, imageFile, { upsert: true })`. The subsequent insert at :116 does not set `id`, so Postgres assigns a different `gen_random_uuid()`. The stored `image_url` still resolves, but the object key no longer matches the row, the next edit uploads to `existing.id + '.jpg'` leaving the original object orphaned, and a PNG/WebP is published under a .jpg key. Deletion (src/components/admin/AnimalsTable.tsx:53) never removes the storage object either.

**[LOW] getPublicAnimal treats a missing `type` as a sponsorship lookup, so an omitted type can only ever resolve sponsorship-eligible animals**

- File: `src/lib/animals/publicAnimal.functions.ts`
- Phase: Phase 2
- Evidence: src/lib/animals/publicAnimal.functions.ts:10 makes `type` optional, and :24-27 `.eq(data.type === "sponsor" || !data.type ? "sponsorship_eligible" : "adoption_eligible", true)`. All four current callers pass a type (src/routes/animals/cat_.$id.tsx:14, dog_.$id.tsx:14, src/routes/sponsors_.$id.tsx:14), so this is latent, but an adoption-only animal fetched without a type silently returns null rather than the animal.

### Must reuse, not reinvent (10)

- `isPublicAnimalMember` — `src/lib/animals/publicListing.ts`: Lines 12-23 are the single canonical membership predicate (retired_at, status, adoption_eligible/sponsorship_eligible with pre-migration fallbacks). Any new admin list filter or eligibility toggle must express membership through this, not by re-deriving from `type`.
- `parsePublicAnimalProfile / projectPublicAnimal` — `src/lib/animals/publicProfile.ts`: Lines 26-45 and 54-96 already implement the allowlist, contact-scrubbing, length caps and Hong Kong birthday->age derivation. An admin public_profile editor must validate with parsePublicAnimalProfile so the client mirrors the DB CHECK exactly, and any preview must render through projectPublicAnimal.
- `private.is_valid_animal_public_profile(jsonb)` — `supabase/migrations/20260906181657_animal_public_profile.sql`: Lines 2-36 are the authoritative server-side allowlist backing the animals_public_profile_valid CHECK, and EXECUTE is already granted to authenticated and service_role (:36). A new animal API should call it rather than inventing a second validation path.
- `listAnimalPipeline` — `src/lib/adoptions/repository.server.ts`: Lines 1730-1808 are the only existing server-paginated query over public.animals — `.select(cols, { count: "exact" }).order(...).range(from, from + pageSize - 1)` plus a bounded candidate-id pre-scope. The admin CMS list should adopt this shape instead of an unbounded select(*).
- `TablePager + DataTable` — `src/components/admin/TablePager.tsx`: Already the paged admin-table pattern used by ContentManagement.tsx:342, KnowledgeManagement.tsx:277, VolunteerManagement.tsx:827 and GroupEnquiryManagement.tsx:210. AnimalsTable currently renders DataTable with no pager; wire in TablePager rather than building new pagination.
- `readEligibleAnimals` — `src/lib/animals/eligibility.server.ts`: Lines 5-23 are the server-side submission-time eligibility re-check (status + intent-specific boolean + retired_at, re-filtered through isPublicAnimalMember). Any new animal-selection surface must re-verify through this rather than trusting a client-supplied id.
- `adoption-guide-releases draft/submit/publish route set` — `src/routes/api/admin/adoption-guide-releases/$id/publish.ts`: The directory (preview.ts, publish.ts, return-to-draft.ts, submit.ts, withdraw.ts plus -handlers.ts) together with public.content_revision / content_publish_request in supabase/migrations/20260905150012_content_revision_lifecycle.sql:6-31 is the repo's existing draft/preview/publish + revision-history model. Animal versioning should extend that, not create a parallel scheme.
- `public.log_animal_mutation() and audit_animals trigger` — `supabase/migrations/20260803120000_audit_animal_mutations.sql`: Lines 26-88. It deliberately skips service-role writes (auth.uid() is null) because API routes write their own actor-attributed audit_log row. Any new /api/admin/animals route must insert its own audit_log row (see the insertAuditLog precedent referenced at :19-21) or the mutation becomes unaudited.
- `ROLE_ACCESS "animals" area + requireAdminPageAccess` — `src/lib/admin/access.ts`: Lines 40-72 grant the `animals` area to staff and admin, and lines 75-77 map sections cat/dog/sponsor to it. New animal routes and any new API handler must gate on this same area rather than a new ad-hoc role check.
- `scripts/legacy-import/replacement_transaction.sql` — `scripts/legacy-import/replacement_transaction.sql`: Lines 7-65 implement retire-in-place plus a guarded, fingerprint-checked rollback against private.animal_replacement_batch/_row. A CMS archive/unarchive feature should reuse this retire-not-delete semantic so historical foreign keys (successful_adoption ON DELETE RESTRICT, animal_match ON DELETE CASCADE) stay intact.

### Open questions

- Migration 20260906162436_animal_catalog_membership.sql has no production-application evidence in docs/ (only 20260906181657 is recorded, and under version 20260907011009). The production JSON reports cats/dogs/sponsors counts that imply adoption_eligible/sponsorship_eligible exist, but I could not verify from source whether the trigger, the rewritten RLS policies, the private.animal_replacement_* tables and the widened sponsorship_preference constraint are all present in the deployed database.
- Production shows 248 active animals against a 292-row backup and `anon_retired_visible: 0`. What are the other 44 rows (non-available status, or retired-and-therefore-invisible-to-anon)? The admin list shows all of them with no retired marker, so I could not determine how many retired placeholders staff currently see.
- Whether PostgREST `db-max-rows` is configured on this Supabase project. The admin list's unbounded select(*) is either silently truncated at that cap or returns all 292 rows; I found no supabase/config.toml setting for it in source.
- Whether the `animal-images` bucket is public, and what storage RLS policies it carries. Nothing in supabase/migrations declares it, so AnimalForm's upload path depends entirely on manual dashboard state.
- Whether the 92 held legacy stories and 234 missing photo files (docs/development-completion-evidence.md, 2026-09-07 entries) are expected to be finished through a future admin editor or through another offline import run — this determines whether public_profile authoring in the CMS is a required deliverable or optional.


## Phase 1 — Error and empty states across admin lists and KPIs (src/components/admin/**, src/routes/admin/**)

The admin surface has no shared error/empty/retry primitive: `DataTable` exposes only a `loading` and an `empty` slot and has no `error` or `onRetry` concept, so every screen hand-rolls its own handling and roughly a third of them do none at all. The dominant failure shape is that a rejected `useQuery` leaves `data` undefined, every call site coalesces with `?? []` / `?? 0` / `?? {a:0,b:0}`, `isLoading` flips back to false, and the screen therefore renders a fully-populated "empty" UI plus KPI tiles reading 0 — indistinguishable from a genuinely empty dataset. Four screens (admin dashboard, PaymentsReconcile, AccessManagement, VolunteerManagement) never read `.error`/`.isError` from their list query at all, so a 500 is completely silent. Where an error IS rendered, the screens print the raw `error.message`, which for `fetchAdminJson` defaults to the English literal `"API request failed"` (src/lib/admin/session.ts:70), never the required "無法載入"; the six one-off admin error components that exist (`CaseListStatusFilterError`, `TaskPanelAsyncError`, etc.) take only a `message` and none accepts an `onRetry`, and no `/admin/*` route declares an `errorComponent`. A genuinely correct pattern does exist in exactly one place — `StatusAdmin.tsx:303-307` renders a load-error row and gates the empty row behind `!error` — and the public site already has the retry pattern (`PublicStateShell` + `GenericErrorState({onRetry})`), so the fix is to lift those into admin rather than invent anything.

### Already addressed at this commit (8)

- **In-table load error that also suppresses the misleading empty row**
  - Evidence: src/components/admin/adoptions/StatusAdmin.tsx:303-307 — `{error && !isLoading && (<StatusLoadErrorRow message={`${copy.loadError}: ${error.message}`} />)}` immediately followed by `{!isLoading && !error && visibleStatuses.length === 0 && (...)}`. This is the only admin screen that gates the empty state on `!error`, and `copy.loadError` is "無法載入狀態" (StatusAdmin path via adminPageCopy.ts:443). Still no retry button, but the error/empty mutual exclusion is correct.
- **Content list screens that refuse to render an empty list while the query is errored**
  - Evidence: src/components/admin/content/AdoptionRulesManagement.tsx:96-102 renders the alert then gates the whole list on `{!rulesQuery.isLoading && !rulesQuery.isError ? ...}`; src/components/admin/content/CareTopicsManagement.tsx:123-129 does the same. A failed load therefore does not print "沒有領養規則資料" / "沒有照顧須知資料".
- **Empty-state text suppressed on a failed table load**
  - Evidence: src/components/admin/adoptions/CoordinatorReports.tsx:496 — `empty={historyQuery.error ? null : copy.empty}` passed to DataTable, so the export-history table does not claim "no records" when the fetch failed.
- **A shared pager exists and correctly disables Next at the last known page**
  - Evidence: src/components/admin/TablePager.tsx:43 `const hasNext = knownTotal ? page < (lastPage ?? 1) : true;` and :82 `disabled={!hasNext || busy}`; asserted by src/components/admin/TablePager.test.tsx:34-40. Nine screens' duplicated pager markup was already collapsed into this component (see its doc comment at TablePager.tsx:17-25).
- **A failing reference/extension query does not blank the parent record on the adoption screens**
  - Evidence: src/components/admin/adoptions/CaseDetail.tsx:799 `{statusesError && <CaseDetailStatusesError message={statusesError.message} />}` renders beside the still-intact record; src/components/admin/adoptions/AdopterDetail.tsx:678-682 likewise; src/components/admin/adoptions/AnimalPipeline.tsx:349-353 collects positions/sources/statuses errors into `readErrors` and renders them at :930-937 without removing the pipeline; :1349-1351 renders `selectedAnimalTasksQuery.error` inside the drawer only.
- **Screen-reader announcement of async load errors is covered by a test**
  - Evidence: src/components/admin/adoptions/adoptionErrorAnnouncements.test.tsx:31-32 and :48-49 assert `role="alert"` on CaseListStatusFilterError and CaseDetailStatusesError.
- **The required "無法載入" copy already exists for some loads**
  - Evidence: src/components/admin/adminPageCopy.ts:86, 166, 187, 216-217, 305-306, 400-401, 443, 498 define 無法載入* strings; used e.g. at src/components/admin/adoptions/IntakeInbox.tsx:144 (`{copy.loadError}: {error.message}`) and src/components/admin/crm/SupporterList.tsx:214 (`{copy.loadError}`).
- **A retry-bearing error state already exists on the public site and can be lifted, not invented**
  - Evidence: src/components/site/PublicStateShell.tsx:3-40 (role="alert"/aria-live plus an `action` slot); src/components/site/AnimalListingPage.tsx:132-155 `AnimalListingError({species, onRetry})` with a 再試一次 button; src/components/site/adoption/StatusPage.tsx:191-204 `GenericErrorState({onRetry})` with 重新載入.

### Open (19)

**[BLOCKER] Admin dashboard animal list has zero error handling: a failed Supabase query renders an empty table with no error and no retry**

- File: `src/routes/admin/index.tsx`
- Phase: Phase 1
- Evidence: src/routes/admin/index.tsx:54 `const { data: animals = [], isLoading } = useQuery({...})` — `error`/`isError` are never destructured. On failure `animals` is `[]`, `isLoading` is false, so line 137-140 renders `<AnimalsTable animals={[]} />`, which prints `empty={copy.common.noResults}` (src/components/admin/AnimalsTable.tsx:160). Operator sees "沒有結果" for a 500.

**[BLOCKER] PaymentsReconcile KPI tiles coerce a failed load to 0 and the failure is never surfaced at all**

- File: `src/components/admin/donations/PaymentsReconcile.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/donations/PaymentsReconcile.tsx:92 `const { data, isLoading, isFetching } = useQuery({...})` — no `error`. :109-113 `const summary = data?.summary ?? { awaitingReconcile: 0, awaitingReceipt: 0, confirmedAmountCents: 0 };` feeds :309-312 `summaryCards` rendered at :320-330, so all three tiles read 0 / HK$0.00 on a failed fetch. :383-389 `<DataTable ... empty="沒有收款紀錄" />` then claims there are no payments. The only errors rendered are mutation/export errors (:377, :381). The `activityData` query at :100-104 is likewise error-free and degrades to "暫無活動紀錄。" (:426-427).

**[BLOCKER] AccessManagement never reads its list/audit query errors; admin-count KPIs render 0/0/0 on failure**

- File: `src/components/admin/access/AccessManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/access/AccessManagement.tsx:173-180 define `usersQuery`/`auditQuery`; neither `.error` nor `.isError` is referenced anywhere in the file (the local `error` state at :171 is written only by mutation `onError` handlers at :205, :222, :232). :235-236 `const users = usersQuery.data?.users ?? []; const summary = usersQuery.data?.summary ?? { active: 0, pending: 0, disabled: 0 };` feeds the three tiles at :406-417, and :420-426 renders `<DataTable ... empty={t.noUsers} />`. A failed access-control load therefore reads as "0 active admins, 0 pending invites, no users".

**[BLOCKER] VolunteerManagement: list errors invisible, stat cards show 0, and Next stays ENABLED on a failed load**

- File: `src/components/admin/volunteers/VolunteerManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/VolunteerManagement.tsx:182-193 define `activitiesQuery`/`registrationsQuery`; neither `.error`/`.isError` is read (only `patchActivity.error`/`updateRegistration.error` at :681-684 and `createActivity.isError` at :798). :195-204 `activities = activitiesQuery.data?.activities ?? []` drives `pendingCount`/`upcomingCount`, and the three StatCards at :659-676 (component at :95-123) render 0/0/0. Worse, :827-834 `<TablePager total={activitiesQuery.data?.total} .../>` passes `undefined` on error, and TablePager.tsx:37,43 then set `knownTotal=false` → `hasNext=true`, so the 下一頁 button is enabled over a zero-row table; :916-923 repeats this for registrations.

**[HIGH] GroupEnquiryManagement: list error invisible, Next enabled on error, and the detail panel silently vanishes when its query fails**

- File: `src/components/admin/volunteers/GroupEnquiryManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/GroupEnquiryManagement.tsx:53-57 `enquiriesQuery` — `.error` is never rendered; :203-208 `<DataTable rows={enquiriesQuery.data?.enquiries ?? []} empty="沒有符合條件的團體查詢。" />`; :210-216 `<TablePager total={enquiriesQuery.data?.total} .../>` → undefined on error → Next enabled (TablePager.tsx:43). Separately :58-65 `detailQuery` and :67 `const detail = detailQuery.data?.enquiry;` feed :233 `{detail ? <EnquiryDetailPanel .../> : null}` — a failed detail fetch renders nothing at all after the operator clicks a row.

**[HIGH] CoordinatorReports metric tiles render 0 when the summary query errors (guarded on isLoading only)**

- File: `src/components/admin/adoptions/CoordinatorReports.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/adoptions/CoordinatorReports.tsx:446 `value={summary?.[tile] ?? 0}` with :447 `isLoading={summaryQuery.isLoading}`; MetricTile (:83-102) shows "-" only while `isLoading`, so once the query settles in error state all six tiles (publicIntakeCases…exportsRun) print 0. The InlineAlert at :358-362 sits above them, so the page simultaneously says "無法載入每月摘要" and "0, 0, 0, 0, 0, 0". Same coercion at :158/:462 makes the header read "0 筆紀錄".

**[HIGH] TaskCenter summary tiles render 0 on a failed task load**

- File: `src/components/admin/adoptions/TaskCenter.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/adoptions/TaskCenter.tsx:83 `const tasks = tasksQuery.data?.tasks ?? EMPTY_TASKS;` → :86 `const summary = useMemo(() => buildTaskCenterSummary(tasks), [tasks]);`. `buildTaskCenterSummary` seeds every bucket at 0 (src/components/admin/adoptions/taskCenterLogic.ts:58-65) and iterates an empty array, so the six tiles at :217-229 (`{summary[item]}` at :226) all read 0. :239 also passes `pageCopy.common.totalCount(total)` with `total = tasksQuery.data?.total ?? 0` (:84), and :243 passes `emptyMessage={copy.empty}` to TaskPanel — so the error banner at :232-234 is rendered above an otherwise perfectly normal-looking empty screen.

**[HIGH] ContentManagement summary cards render 0 on error**

- File: `src/components/admin/content/ContentManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/content/ContentManagement.tsx:163-164 `const rows = data?.content ?? []; const summary = summarizeContentRows(rows);` — `summarizeContentRows` reduces from `{total:0, published:0, drafts:0, rescueStories:0}` (src/components/admin/content/contentAdminLogic.ts:57-67). The four SummaryCards at :266-269 therefore all read 0 on a failed fetch, next to `empty="沒有宣傳內容"` at :339.

**[HIGH] No shared admin error/retry component and no admin route error boundary; none of the six existing admin error components can carry a retry action**

- File: `src/components/admin/DataTable.tsx`
- Phase: Phase 1
- Evidence: The only exported admin error components are CaseDetail.tsx:297 `CaseDetailStatusesError({message})`, CaseList.tsx:38 `CaseListStatusFilterError({label, message})`, MatchPanel.tsx:99 `MatchPanelAsyncError({message})`, StatusAdmin.tsx:86 `StatusLoadErrorRow({message})`, StatusAdmin.tsx:96 `StatusFieldError({id, message})`, TaskPanel.tsx:139 `TaskPanelAsyncError({message})` — every signature is message-only, no `onRetry`. `DataTable` (src/components/admin/DataTable.tsx:16-33) has `loading`/`empty` props but no `error`/`onRetry`. A grep for `errorComponent:` across src/routes returns 11 public routes plus __root.tsx:126 and zero `/admin/*` routes.

**[HIGH] The user-visible failure string is the untranslated English literal "API request failed", never "無法載入"**

- File: `src/lib/admin/session.ts`
- Phase: Phase 1
- Evidence: src/lib/admin/session.ts:67-71 — `throw new Error(body?.error typeof string ? body.error : "API request failed")`. Screens print `error.message` verbatim: src/components/admin/adoptions/CaseList.tsx:313-320 (`{error.message}` alone, no label), AdopterList.tsx:383-390, AnimalPipeline.tsx:949-955, CaseDetail.tsx:764-766, StatusAdmin.tsx:304. A network-layer failure (`TypeError: Failed to fetch`) surfaces as "Failed to fetch" for the same reason.

**[MEDIUM] Error banner and empty-state message render simultaneously, so a failed list still asserts "0 items / no results"**

- File: `src/components/admin/adoptions/CaseList.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/adoptions/CaseList.tsx:285 renders `pageCopy.common.totalCount(total)` with `total = data?.total ?? 0` (:89) and :322-331 renders `<DataTable ... empty={copy.empty} />` unconditionally under the :313 error block. Same shape: AdopterList.tsx:383 error + :392-399 `empty={copy.empty}` with `total = data?.total ?? 0` (:125); SupporterList.tsx:209-217 error + :219-227 `empty={copy.empty}`; IntakeInbox.tsx:139-146 error + :152 `totalCount(items.length)` + :168 `{copy.empty}`; PledgeReviewLane.tsx:71 `total = data?.total ?? 0` + :183 `copy.totalCount(total)`; AnnualReportManagement.tsx:231-239 error + :258-264 "尚未建立年度報告"; DocumentManagement.tsx:349-357 error + :376-381 "沒有文件".

**[MEDIUM] An empty list shows no "0 items" row and no disabled Next — TablePager renders nothing at all for total=0**

- File: `src/components/admin/TablePager.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/TablePager.tsx:46 `if (knownTotal && (lastPage ?? 1) <= 1) return null;` — with `total: 0` this returns an empty string, asserted by src/components/admin/TablePager.test.tsx:16 `expect(render({ total: 0 })).toBe("")`. The Phase-1 requirement that an empty list "show 0 items and disable Next" is therefore unmet wherever TablePager is the pager (VolunteerManagement, GroupEnquiryManagement, ContentManagement, KnowledgeManagement, AdoptionGuideReleaseManagement). The component also cannot distinguish "total unknown because the API omitted it" from "total unknown because the request failed", which is the root cause of the enabled-Next bug above.

**[MEDIUM] Detail pages blank the whole record on error and put the only retry button on the unreachable success path**

- File: `src/components/admin/adoptions/CaseDetail.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/adoptions/CaseDetail.tsx:753-770 — `if (caseError || !adoptionCase) return (<div>…{caseError?.message ?? copy.notFound}</div>)`, containing only a back link; the `refetch()` button lives at :793, inside the success return, so it can never be reached when the load failed. src/components/admin/adoptions/AdopterDetail.tsx:527-545 and :573 are identical. `refetch` is destructured at CaseDetail.tsx:682 and AdopterDetail.tsx:342 but is dead on the error path.

**[MEDIUM] A load error is reported to the operator as "record not found"**

- File: `src/components/admin/volunteers/VolunteerRegistrationDetail.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/volunteers/VolunteerRegistrationDetail.tsx:49-51 — `if (error || !data?.registration) { return <div ...>找不到義工報名。</div>; }`. A 500 or a network drop is indistinguishable from a deleted registration, and there is no retry.

**[MEDIUM] Supporter record blanks entirely on error with no retry action**

- File: `src/components/admin/crm/SupporterDetail.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/crm/SupporterDetail.tsx:199-207 — `if (error || !data) { return (<div className="p-6">…{copy.loadError}…</div>); }` where `copy.loadError` is "無法載入捐款人。" (:33). The query at :163 does not destructure `refetch`, so no retry is possible; the whole record including every sub-section (payments, timeline, followups) disappears.

**[MEDIUM] English error copy shipped in the Chinese admin, with the list still rendering as empty behind it**

- File: `src/components/admin/content/PaymentMethodsManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/content/PaymentMethodsManagement.tsx:113-116 — `const queryErrorMessage = listQuery.error || identityQuery.error ? "Unable to load payment method configurations. Please reload the page." : undefined;` while :112 `const configs = listQuery.data?.items ?? [];` still feeds the view. Same class of issue: src/components/admin/content/KnowledgeManagement.tsx:256 `<p role="alert">Ownership could not be verified.</p>` and :262 `No knowledge posts yet.`

**[MEDIUM] Hand-rolled tables and pagers bypass DataTable/TablePager, so any Phase-1 fix applied to the shared components will not reach them**

- File: `src/components/admin/content/DocumentManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/content/DocumentManagement.tsx:359-473 builds its own `<table>` plus its own prev/next buttons (`pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 25))` at :232); src/components/admin/content/AnnualReportManagement.tsx:240-264 does the same; src/components/admin/content/AdoptionInformationManagement.tsx:242 and :328-340 likewise. CaseList.tsx:333-350, AdopterList.tsx:402-424, TaskCenter.tsx:251-274 and CoordinatorReports.tsx:501-525 also still inline their own pager markup rather than using TablePager.

**[LOW] AnimalPipeline empty state and pager controls are untranslated English**

- File: `src/components/admin/adoptions/AnimalPipeline.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/adoptions/AnimalPipeline.tsx:977 `No animals match these filters.`, :1010 `Page {resolvedPage} of {totalPages}`, :1038 `Previous`, :1047 `Next` — inside an otherwise Traditional-Chinese admin whose shared copy table already supplies `pageCopy.common.previous`/`.next`/`.pageOf` (src/components/admin/adminPageCopy.ts:15-16, 44-45).

**[LOW] Error copy tells the operator to reload the page by hand instead of offering a retry control, and uses "未能載入" rather than the specified "無法載入"**

- File: `src/components/admin/content/AboutPagesManagement.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/content/AboutPagesManagement.tsx:87-93 `未能載入頁面內容，請重新整理頁面。`; src/components/admin/content/AdoptionRulesManagement.tsx:96-100 `未能載入領養規則，請重新整理頁面。`; src/components/admin/content/CareTopicsManagement.tsx:123-127 `未能載入照顧須知，請重新整理頁面。`; src/components/admin/content/ContentRevisionPanel.tsx:41 `未能載入版本紀錄，請重試。`; src/components/admin/content/ContentTimeline.tsx:125 `未能載入正文，請重試。`. None renders a button; all five use a phrase that differs from the 無法載入 strings in adminPageCopy.ts.

### Must reuse, not reinvent (8)

- `DataTable` — `src/components/admin/DataTable.tsx`: The single table primitive used by CaseList, AdopterList, CoordinatorReports, SupporterList, PaymentsReconcile, AccessManagement, VolunteerManagement, GroupEnquiryManagement and ContentManagement. Its props (lines 16-33) already model loading/empty; an `error` + `onRetry` slot added here (and used to suppress `empty` when error is set, exactly as CoordinatorReports.tsx:496 does by hand) fixes the error-looks-like-empty class in one place. Do not add a parallel ErrorTable.
- `TablePager` — `src/components/admin/TablePager.tsx`: The shared pager already exists precisely to stop screens hand-rolling a tenth copy (see its doc comment, lines 17-25). Its `total?: number` tri-state is the root cause of Next staying enabled on error (line 43) and of empty lists rendering no pager at all (line 46) — fix it here, and change the remaining inline pagers (CaseList.tsx:333, AdopterList.tsx:402, TaskCenter.tsx:251, CoordinatorReports.tsx:501, PaymentsReconcile.tsx:392, DocumentManagement.tsx:449, AnnualReportManagement) over to it rather than patching each.
- `adminPageCopy / useAdminPageCopy` — `src/components/admin/adminPageCopy.ts`: The bilingual zh/en copy table where every existing 無法載入* string already lives (lines 86, 166, 187, 216-217, 305-306, 400-401, 443, 498) alongside `common.refresh`/`.previous`/`.next`/`.pageOf`. New error and retry strings belong here, not inline in components — the English leaks in AnimalPipeline.tsx:977 and PaymentMethodsManagement.tsx:115 are what happens otherwise.
- `PublicStateShell` — `src/components/site/PublicStateShell.tsx`: The existing shared state shell: role="status"/"alert" with matching aria-live, a heading-level guard, and an `action` slot for the retry button (lines 3-40). `AnimalListingError` (src/components/site/AnimalListingPage.tsx:132-155) and `GenericErrorState` (src/components/site/adoption/StatusPage.tsx:191-204) are the two worked examples of wiring `onRetry` to `query.refetch()`. The admin error component should be modelled on this, not designed fresh.
- `StatusLoadErrorRow + the `!error` empty gate` — `src/components/admin/adoptions/StatusAdmin.tsx`: Lines 86-94 and 303-307 are the only correct error/empty interaction in the admin tree: an in-table alert row that also suppresses the empty row. Use this as the reference behaviour when adding `error` to DataTable, and delete the six near-duplicate one-off alert components (CaseDetail.tsx:297, CaseList.tsx:38, MatchPanel.tsx:99, TaskPanel.tsx:139, StatusAdmin.tsx:86) in favour of the shared one.
- `fetchAdminJson / AdminApiError` — `src/lib/admin/session.ts`: Every admin query funnels through this (re-exported as `fetchCoordinatorJson` by src/components/admin/adoptions/api.ts:1). Line 70's `"API request failed"` fallback and the structured `AdminApiError` (lines 19-41, carrying `status`/`code`) are the single place to produce a localized, status-aware default message so components stop printing raw English `error.message`.
- `AdminLayout` — `src/components/admin/AdminLayout.tsx`: The common frame every admin screen renders inside; if a route-level `errorComponent` is added for `/admin/*` (none exists today — grep of src/routes shows 11 public routes plus __root.tsx:126 and zero admin routes), it must render inside this shell so navigation survives the failure.
- `buildTaskCenterSummary / summarizeContentRows` — `src/components/admin/adoptions/taskCenterLogic.ts`: Pure KPI aggregators (taskCenterLogic.ts:54-73; contentAdminLogic.ts:57-67) that both seed at 0 and are called with an error-coerced empty array. The fix belongs at the call sites — pass an explicit null/unknown state rather than `data?.x ?? []` — not by duplicating a second 'safe' aggregator.

### Open questions

- Should a failed KPI render an em dash / "—" (the convention CoordinatorReports' MetricTile already uses for the loading state at CoordinatorReports.tsx:98) or a dedicated error glyph? Picking one now keeps the ~20 tiles across CoordinatorReports, TaskCenter, PaymentsReconcile, AccessManagement, VolunteerManagement and ContentManagement consistent.
- Is "無法載入" required as an exact literal in the DOM (i.e. testable via a string match) or as a copy pattern like "無法載入<名詞>"? Existing strings are all of the second form (adminPageCopy.ts:86 "無法載入狀態篩選", :187 "無法載入收件箱"), while five content components use the different phrase "未能載入". A decision is needed before writing assertions.
- For the empty case the requirement says "show 0 items and disable Next", but TablePager.tsx:46 deliberately renders nothing when there is a single page, and TablePager.test.tsx:13-17 locks that in. Does Phase 1 intend to change that contract (always render the pager, with a "0 項" readout and both buttons disabled), or is the DataTable empty row considered sufficient for "0 items"?
- Which screens count as having an "extension section"? Confirmed sub-queries that can fail independently are CaseDetail/AdopterDetail statuses, AnimalPipeline positions/sources/statuses and per-animal tasks, GroupEnquiryManagement detail, DocumentManagement/KnowledgeManagement ownership, and SupporterDetail's payments/timeline (the last are fields of one response, not separate queries, so they cannot fail independently today).
- Should React Query be given global defaults (retry policy, a shared `throwOnError` for admin, or an onError sink)? `src/router.tsx:6` constructs `new QueryClient()` with no `defaultOptions` at all, so today every screen inherits the library's 3-retry default and nothing else.
- Is a route-level `errorComponent` wanted for `/admin/*`, or is per-screen inline handling the intended Phase 1 shape? None of the 42 files under src/routes/admin declares one.


## Phase 2 — Public website layout, cards, copy and Sponsorship Area entry points

At commit c037cc1 the public animal card is an 88px-square avatar card, not a photo-led card: `.animal-profile-photo` hard-sets `width/height: 88px; flex: 0 0 88px` (src/styles.css:799-807) and AnimalCard puts that thumbnail beside the name inside `.animal-profile-identity` (src/components/site/AnimalCard.tsx:28-37). Two different grids render the same card — listings use `.animal-profile-grid` at 1/2/3 columns (src/styles.css:764-767, 895-904) while the home page uses `.animal-grid` at 4/3/2/1 columns plus an undefined `.home-animal-grid` class (src/components/site/home/FeaturedAnimals.tsx:29, src/styles/public.css:750-754). There is no top-level 助養區 navigation entry: `navGroups` has five groups and 每月助養 is a child of 支持救援 (src/components/site/navigation.ts:24-32); the footer has no /sponsors link at all, and the header and mobile drawer CTAs are adopt+donate only. The string 助養區小朋友 does not exist anywhere in the repository. Implementation commentary is still live in public copy — 「四步看懂，七步申請流程保持不變。」 (AdoptionStepsBand.tsx:21) and two more strings that docs/development-public-copy-review.md already flagged but never replaced. `bun run verify:brand` runs scripts/verify-public-brand.mjs against an externally started preview server (BASE_URL default http://127.0.0.1:4173) and a Supabase fixture — it starts neither — and it asserts only logo presence/ratio, no horizontal overflow, exactly one h1, privacy-safe recovery copy, console/request/page errors, header focus, the homepage menu and the /help searchbox. It asserts nothing about palette, typography, radii, card anatomy, grid columns, navigation structure or copy strings.

### Already addressed at this commit (8)

- **DESIGN-SPEC.md presented the retired Poofyco rose/navy + Baloo + 25px-radius direction as current design guidance**
  - Evidence: docs/DESIGN-SPEC.md:1-12 now carries an explicit '**Historical reference only — superseded.**' banner naming #05648E / #A61C56 / Noto Sans HK / 1200px 12-col / 8px scale / 8-16-pill radii as the approved identity and pointing at docs/brand-guidelines.md and brand/design-tokens.{json,css}
- **Animal listings paginated with range() and no order(), so an animal could appear on two pages or none (G-01)**
  - Evidence: src/routes/animals/cat.tsx:23-41 and src/routes/sponsors.tsx:23-27 now server-render through getPublicAnimalListing/getPublicSponsorListing with loaderDeps; src/lib/animals/publicListing.ts:82-98 filters before paginating
- **Public pages published unverified board members and estimated adoption figures**
  - Evidence: src/routes/publicTruth.test.ts:14-46 pins that report/adoption.tsx uses resilientPublicLoader + getAdoptionImpactReport (no '"adopted"', no useQuery) and that about/team.tsx renders 尚未有公開資料 instead of named individuals; src/routes/about/team.tsx:85 confirms the empty state
- **Home page shipped unverified testimonials, social metrics and payment account numbers**
  - Evidence: src/routes/index.visual.test.ts:39-53 asserts the home modules contain no SocialProof/VolunteerCarousel/SocialWall/BestRescue and no bank/PayMe/PayPal account strings; src/routes/index.tsx:76-84 composes only HomeHero, FeaturedAnimals, ImpactBand, AdoptionStepsBand, FeaturedStory, HelpCards, TransparencyBand
- **Sponsor payment-impersonation risk on /sponsors**
  - Evidence: src/routes/sponsors.tsx:41-58 renders PaymentSafetyNotice warning against paying any account/phone/email not confirmed by staff, with a /help#contact link
- **Two h1 elements on pages where a state panel sits inside a frame that already renders the h1**
  - Evidence: src/components/site/PublicStateShell.tsx:9-23 takes headingLevel 1|2 and switches the tag; src/components/site/AnimalListingPage.tsx:143 and src/components/site/home/FeaturedAnimals.tsx:36 pass headingLevel={2}
- **Literal '????' mojibake in public copy**
  - Evidence: grep for '????' across src/routes and src/components returns hits only in src/components/admin/content/* (ContentManagement.tsx:232 and admin test fixtures); no public-site file matches
- **'data projection' / 'not provided' English implementation wording leaking into rendered copy**
  - Evidence: grep for 'data projection' and 'not provided' across src/**/*.tsx,*.ts returns no match; 'projection' appears only in code comments (src/components/site/AnimalListingPage.tsx:59, src/routes/animals/cat.tsx:26, src/routes/sponsors.tsx:19)

### Open (22)

**[BLOCKER] The public animal card is an 88px avatar card, not a photo-led card. The portrait is a fixed 88px square sitting beside the name, so the animal's photo occupies roughly 7,700px² of a card that is 1/3 of a 1200px grid.**

- File: `src/styles.css`
- Phase: Phase 2
- Evidence: src/styles.css:799-807 `.animal-profile-photo { width: 88px; height: 88px; aspect-ratio: 1; flex: 0 0 88px; border-radius: 8px; }`; src/components/site/AnimalCard.tsx:28-37 places `<AnimalPhoto animal={animal} />` inside `.animal-profile-identity` (a `display:flex; align-items:center; gap:16px` row, src/styles.css:784-788) next to the code/name/species text block

**[BLOCKER] The 助養區小朋友 concept does not exist anywhere in the repository — no nav entry, no route, no component, no copy, no migration.**

- File: `src/components/site/navigation.ts`
- Phase: Phase 2
- Evidence: grep -rn '小朋友' over src/, docs/, scripts/ and supabase/ returns zero matches at commit c037cc1

**[HIGH] `.public-animal-media { aspect-ratio: 4 / 3 }` is applied to the card photo but is dead — the later, equally-specific `.animal-profile-photo` rule overrides it with `aspect-ratio: 1` plus explicit 88px width/height. The 4:3 intent exists in source but never renders.**

- File: `src/components/site/AnimalPhoto.tsx`
- Phase: Phase 2
- Evidence: src/components/site/AnimalPhoto.tsx:15 emits class `"animal-profile-photo public-animal-media"`; src/styles.css:535-537 `.public-animal-media { aspect-ratio: 4 / 3; }` at line 535 is overridden by src/styles.css:799-802 at line 799 (same specificity, later wins)

**[HIGH] Two different, conflicting grids render the same AnimalCard. Listing pages get 1/2/3 columns; the home page gets 4/3/2/1 columns via a different class stack, so an identical card has a different width and column count depending on the route.**

- File: `src/components/site/home/FeaturedAnimals.tsx`
- Phase: Phase 2
- Evidence: Listing path: src/components/site/AnimalGrid.tsx:336 `<div className="animal-profile-grid">` with src/styles.css:764-767 (1 col), :895-899 (2 cols @ min-width 640px), :900-904 (3 cols @ min-width 1024px). Home path: src/components/site/home/FeaturedAnimals.tsx:29 `<div className="animal-grid home-animal-grid">` with src/styles/public.css:750-754 `.animal-grid { grid-template-columns: repeat(4, minmax(0,1fr)); gap: 20px }`, :1767+1786-1789 (3 cols @ max-width 1119px), :1792+1831-1836 (2 cols @ max-width 900px), :1884+1951-1956 (1 col @ max-width 640px)

**[HIGH] There is no top-level 助養區 navigation entry. 每月助養 is a child item inside the 支持救援 dropdown, so the Sponsorship Area is two interactions deep on desktop and mobile.**

- File: `src/components/site/navigation.ts`
- Phase: Phase 2
- Evidence: src/components/site/navigation.ts:14-58 defines exactly five groups — 領養 / 支持救援 / 我們的工作 / 故事與資源 / 關於協會 — and `{ label: "每月助養", to: "/sponsors" }` is navGroups[1].items[0] (:27). The string 助養區 appears in src/ only as a back-link label (src/routes/sponsors_.$id.tsx:56,68,97; src/components/site/sponsorship/PledgeWizard.tsx:25; src/components/site/sponsorship/PledgeStatusPage.tsx:170,173; src/routes/sponsors_.pledge.tsx:18), never as a navigation destination label.

**[HIGH] Sponsorship has no entry point in the footer, the header CTAs, or the mobile drawer CTAs — every persistent public action funnels to adoption or donation only.**

- File: `src/components/site/Footer.tsx`
- Phase: Phase 2
- Evidence: src/components/site/Footer.tsx:29-74 lists 待領養貓隻/待領養狗隻/領養流程/安全捐助/成為義工/企業及團體參與 and 每月領養報告/年報及審計報告/飼養知識/求助及常見問題/私隱政策 — no /sponsors link. src/components/site/Header.tsx:233-238 renders only `查看待領養動物` (/animals/cat) and `立即捐助` (/donate). src/components/site/navigation.ts:75-89 `getMobileDrawerActions` returns only those same two. src/components/site/PublicPageFrame.tsx:210-220 'next step' band links 領養/義工/捐助 only.

**[HIGH] Implementation commentary is still shipping as public copy on the home page. docs/development-public-copy-review.md already identified these exact lines and proposed replacements, but none were applied at this commit.**

- File: `src/components/site/home/AdoptionStepsBand.tsx`
- Phase: Phase 2
- Evidence: src/components/site/home/AdoptionStepsBand.tsx:21 `<h2 id="steps-title">四步看懂，七步申請流程保持不變。</h2>` and :22 `<p>這裡只作簡化說明；正式申請、家訪資料、儲存草稿及狀態查詢流程不變。</p>`; src/components/site/home/FeaturedStory.tsx:62 `故事庫暫未有可顯示的精選內容，因此保留真實救援相片與故事入口，不以示例個案代替真實經歷。`; src/components/site/home/FeaturedAnimals.tsx:25 `每張動物卡只顯示已公開資料；相片、狀態與內容均以協會最新發佈記錄為準。`. docs/development-public-copy-review.md:7-9 lists the first three with proposed replacements dated 2026-09-05.

**[HIGH] `bun run verify:brand` does not verify the brand. It checks no colour token, font stack, radius, spacing unit, touch-target size, card anatomy, grid column count, navigation structure or copy string — despite docs/brand-guidelines.md:103-106 naming it as the gate for exactly those things.**

- File: `scripts/verify-public-brand.mjs`
- Phase: Phase 2
- Evidence: scripts/verify-public-brand.mjs assertions are: assertNoOverflow (:167), assertBrandLogo — presence + 1:1 natural/rendered ratio only (:176-216), assertOneHeading — h1 count === 1 (:218-229), assertNoSeriousA11yViolations (a11y mode only, :233), assertPerformanceFloor (performance mode only, :264), assertRecoveryCopy (/status/ routes only, :301), checkHeaderFocus (:329), checkHomepageMenu (:377), checkHelpSearch (:393), plus console/requestfailed/pageerror listeners (:581-607) and asset 404 collection. No selector, computed-style or text assertion for palette, typography, radii or IA exists in the file.

**[MEDIUM] `home-animal-grid` is an undefined class — it appears in markup but in no stylesheet, so the home animal band silently falls back to the generic 4-column `.animal-grid`.**

- File: `src/components/site/home/FeaturedAnimals.tsx`
- Phase: Phase 2
- Evidence: src/components/site/home/FeaturedAnimals.tsx:29 is the only occurrence of the string `home-animal-grid` in the whole repo (grep -rn 'home-animal-grid' src/ returns exactly one hit, no CSS)

**[MEDIUM] The ported photo-led card anatomy (`.animal-card`, `.animal-media` 4/3, `.animal-card-body`, `.animal-image-fallback`, plus `.listing-grid`, `.similar-grid`, `.filter-shell`, `.species-tabs`, `.content-card`) is dead CSS — no TSX uses these class names, so the 'one card anatomy' rule in the brand guidelines is unmet while the correct anatomy sits unused in the stylesheet.**

- File: `src/styles/public.css`
- Phase: Phase 2
- Evidence: src/styles/public.css:777-92xx defines `.animal-card`/`.animal-media { aspect-ratio: 4 / 3 }`/`.animal-card-body`/`.animal-image-fallback`; grep across src/components and src/routes finds `animal-card` only as the substring of `public-animal-card` (src/components/site/AnimalCard.tsx:23) and `animal-media` only as the substring of `public-animal-media` (src/components/site/AnimalPhoto.tsx:15); `animal-card-body`, `animal-image-fallback`, `listing-grid`, `similar-grid`, `species-tabs`, `content-card` have zero TSX occurrences. docs/brand-guidelines.md:59-60 requires 'one card anatomy across animal, story, opportunity, and report content'.

**[MEDIUM] Card anatomy is not shared across content types: animal cards, story cards and knowledge cards are three independent implementations with different radii, photo treatment and column rules.**

- File: `src/components/site/stories/StoryWall.tsx`
- Phase: Phase 2
- Evidence: Animal: src/components/site/AnimalCard.tsx:23 `.public-animal-card animal-profile-card`, radius var(--public-radius)=1rem (src/styles.css:494-503), 88px avatar. Story: src/components/site/stories/StoryWall.tsx:114 ad-hoc Tailwind `rounded-md border ... hover:shadow-md` with a full-bleed `aspect-[4/3]` image (:120,:123) in a `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` (:97). Knowledge: src/components/site/knowledge/KnowledgeGrid.tsx:29 `rounded-xl ... p-5 shadow-soft`, no image, same 1/2/3 grid (:25)

**[MEDIUM] verify:brand cannot run standalone — it requires an already-running SSR preview server and a reachable Supabase, neither of which the npm script starts. Running `bun run verify:brand` on a clean machine fails on connection, not on a brand defect.**

- File: `scripts/verify-public-brand.mjs`
- Phase: Phase 2
- Evidence: scripts/verify-public-brand.mjs:10 `const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173"` and :159 `page.goto(urlFor(route))`; package.json:20 `"verify:brand": "node scripts/verify-public-brand.mjs"` (no server start). .github/workflows/ci.yml lines ~93-141 shows the full prerequisite chain CI performs by hand: `bun run build` with SUPABASE_* env, start scripts/ci/supabase-fixture.mjs, start `bun run preview` on 127.0.0.1:4173, poll until ready, curl the fixture, only then `bun run verify:brand`. The script also hard-reads scripts/ci/supabase-fixture.mjs at module load (:92) to hash it, so it throws before launching a browser if that file is missing.

**[MEDIUM] verify:brand's route list omits two live public routes, so /knowledge and /volunteer/group are never checked for overflow, logo, single-h1 or a11y.**

- File: `scripts/verify-public-brand.mjs`
- Phase: Phase 2
- Evidence: scripts/verify-public-brand.mjs:21-40 `staticRoutes` contains 18 entries and does not include `/knowledge` or `/volunteer/group`, both of which exist (src/routes/knowledge.tsx, src/routes/volunteer/group.tsx) and are linked from the footer (src/components/site/Footer.tsx:59-61) and nav (src/components/site/navigation.ts:30,45)

**[MEDIUM] The retired Poofyco navy is still the shadow colour on live public surfaces. Two competing shadow systems coexist: brand-token shadows (blue-grey) and Tailwind `@utility` shadows hardcoded to rgba(29,35,83) = #1D2353 navy.**

- File: `src/styles.css`
- Phase: Phase 2
- Evidence: src/styles.css:639-644 `@utility shadow-soft { box-shadow: 0 8px 30px rgba(29, 35, 83, 0.1) } @utility shadow-panel { box-shadow: 0 24px 60px rgba(29, 35, 83, 0.25) }` — comment on :638 even claims they 'replace hardcoded rgba values'. The brand-token equivalents are src/styles.css:194-195 `--public-shadow-soft: 0 8px 24px rgba(15, 51, 65, 0.08)` / `--public-shadow-raised: 0 24px 60px rgba(8, 52, 70, 0.14)`. The navy utilities are used on live public surfaces: src/components/site/knowledge/KnowledgeGrid.tsx:29, src/components/site/adoption/StatusPage.tsx:211,232,250,280,303,319,353, src/components/site/sponsorship/PledgeStatusPage.tsx:201, src/components/site/help/HelpWidget.tsx:60,119, src/components/site/ShortlistTray.tsx:22, src/components/site/donations/ContextualDonationPrompt.tsx:43, src/components/site/adoption/ApplicationWizard.tsx:515,540,552,597. docs/brand-guidelines.md:16-17 retires this direction and :103-106 lists 'the absence of Poofyco/Baloo tokens' as a merge gate.

**[MEDIUM] Two competing page-container systems and a third ad-hoc one. `.public-container` and `@utility container-wide` both target 1200px with different gutter math, and the form/status pages use neither.**

- File: `src/styles.css`
- Phase: Phase 2
- Evidence: src/styles/public.css:44-47 `.public-container { width: min(1200px, calc(100% - 48px)); margin-inline: auto }` vs src/styles.css:279-283 `@utility container-wide { max-width: 1200px; margin-inline: auto; padding-inline: 1.5rem }`. `container-wide` has 34 non-test usages including live public surfaces (src/components/site/stories/StoryWall.tsx:50, stories/StoryContentGrid.tsx:25, stories/RescueMap.tsx:15, sponsorship/PledgeStatusPage.tsx:126,200, adoption/StatusPage.tsx:130,210, adoption/ApplicationWizard.tsx:514,539,551,571). A third shape appears in src/components/site/sponsorship/PledgeWizard.tsx:226,237,251 `max-w-2xl mx-auto px-4`.

**[MEDIUM] An animal with no public_profile renders '未有記錄' up to six times on one card (code, gender, age, neutered, suitability, personality), which is the card's dominant text.**

- File: `src/components/site/AnimalCard.tsx`
- Phase: Phase 2
- Evidence: src/components/site/AnimalCard.tsx:31 (編號), :53 (性別), :58 (年齡), :63-67 (絕育), :73-77 (領養經驗), :83 (性格) each fall back to the literal "未有記錄". `public_profile` is optional/nullable in the type (src/types/animal.ts:22 `public_profile?: AnimalPublicProfile | null`) and every field inside it is nullable (:8-15).

**[MEDIUM] The sponsor detail pending skeleton does not match the layout it replaces, so the page shifts on hydration (square photo + 2-col Tailwind grid vs the 7fr/5fr .detail-grid with a 400x280 photo).**

- File: `src/routes/sponsors_.$id.tsx`
- Phase: Phase 2
- Evidence: src/routes/sponsors_.$id.tsx:77-86 `<main className="container-wide grid gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8"><Skeleton className="aspect-square w-full rounded-md" />…`; the resolved page renders src/components/site/PublicDetailFrame.tsx:23-33 `.detail-page > .public-container.detail-grid` with src/styles/public.css:1524-1531 `grid-template-columns: 7fr 5fr; gap: 48px` and a 400x280 photo

**[MEDIUM] Sponsor detail not-found and error states render outside any <main> landmark — the root wraps the Outlet in a plain div, and these components return a bare <section>.**

- File: `src/routes/sponsors_.$id.tsx`
- Phase: Phase 2
- Evidence: src/routes/__root.tsx:164-166 `<div id="main-content" tabIndex={-1} data-site-content><Outlet /></div>` (a div, not <main>); src/routes/sponsors_.$id.tsx:61-73 (SponsorDetailNotFound) and :89-101 (SponsorDetailError) return `<PublicStateShell …/>` directly, which renders `<section role=…>` (src/components/site/PublicStateShell.tsx:25-38) with no <main> ancestor

**[LOW] The no-photo fallback shows only an icon and 暫未有相片 — it omits the animal's name, which the brand guidelines explicitly require, and the CSS written for a named fallback targets elements the component never renders.**

- File: `src/components/site/AnimalPhoto.tsx`
- Phase: Phase 2
- Evidence: src/components/site/AnimalPhoto.tsx:26-34 renders `<Icon aria-hidden="true" /><small>暫未有相片</small>` and nothing else. docs/brand-guidelines.md:72-73: 'If an animal has no usable image, show a restrained branded fallback with its name'. src/styles/public.css:1552-1560 styles `.detail-image-fallback strong` and `.detail-image-fallback p`, neither of which AnimalPhoto emits.

**[LOW] The animal detail photo does not honour the detail gallery's 4:3 ratio: a hard 400x280 box (10:7) wins because both width and height are definite, making aspect-ratio inert.**

- File: `src/styles.css`
- Phase: Phase 2
- Evidence: src/styles.css:831-836 `.animal-profile-photo-detail { width: 100%; max-width: 400px; height: 280px; min-height: 0 }` combined on the same element with src/styles/public.css:1538-1545 `.detail-gallery { aspect-ratio: 4 / 3; ... }`; the element carries both classes via src/components/site/AnimalPhoto.tsx:14 `"animal-profile-photo animal-profile-photo-detail detail-gallery"`

**[LOW] Two nested `.site-shell min-h-dvh` wrappers are rendered on every public page.**

- File: `src/routes/__root.tsx`
- Phase: Phase 2
- Evidence: src/components/site/fixedActions/PublicFixedActions.tsx:52 `<div className="site-shell min-h-dvh" style={style}>{children}</div>` receives as children src/routes/__root.tsx:161-172 `publicContent`, which itself opens with `<div className="site-shell min-h-dvh">` (:162)

**[LOW] Eleven unreferenced public site components remain in the tree, several carrying retired-direction styling and unverifiable claims.**

- File: `src/components/site/BestRescue.tsx`
- Phase: Phase 2
- Evidence: Zero non-self imports for src/components/site/{BestRescue,FeatureTrio,SocialProof,SocialWall,PhotoMarquee,AdoptionSteps,FundraisingCard,VolunteerCarousel,AdoptionChart,StatCard}.tsx; src/components/site/Hero.tsx is imported by nothing and is the only consumer of PublicPageHero.tsx (so `.public-page-hero-*` CSS at src/styles.css:458-476,569-605 is also unreachable). Content examples: src/components/site/BestRescue.tsx:7-11 hardcodes four unverified organisational claims and :33 uses `shadow-soft`; src/components/site/PhotoMarquee.tsx:39 uses the retired `rounded-[25px]`; src/components/site/AdoptionSteps.tsx:40 carries the same 四步 framing.

### Must reuse, not reinvent (12)

- `navGroups / findCurrentNavigation / isCurrentPath / getMobileDrawerActions` — `src/components/site/navigation.ts`: Single source of truth for the public IA. Adding a top-level 助養區 group (and any 助養區小朋友 child) means editing navGroups here — Header.tsx:181-227 (desktop popovers) and :297-335 (mobile drawer) both iterate it, and the current-item highlighting comes from findCurrentNavigation. Do not add a nav entry in Header.tsx directly.
- `AnimalCard` — `src/components/site/AnimalCard.tsx`: The one animal card used by both the listings (via AnimalGrid) and the home featured band. Any card re-anatomy (photo size, layout, badges) must happen here and in its `.animal-profile-*` CSS, not in a new component — it already handles the adoption/sponsorship intent split (detailHref at :17-20, badges at :38-48) and the shortlist action (:92-94).
- `AnimalPhoto` — `src/components/site/AnimalPhoto.tsx`: The only place that decides card-vs-detail photo classes and handles onError fallback (:7-8, :23). Changing the card photo from an 88px avatar to a photo-led crop means changing the class it emits at :12-16 plus `.animal-profile-photo` in src/styles.css:799-807 — not adding an <img> anywhere else.
- `AnimalGrid` — `src/components/site/AnimalGrid.tsx`: Owns filters, active-filter chips, totals, empty/last-page states and pagination for /animals/cat, /animals/dog and /sponsors. It is intent-aware (:338 passes intent to AnimalCard) and degrades gracefully when genderFilter/q are undefined (:81-83), which is how /sponsors reuses it with fewer controls. New listing surfaces (e.g. a 助養區 sub-listing) must reuse it rather than re-implement filtering.
- `AnimalListingPage / AnimalListingPending / AnimalListingError` — `src/components/site/AnimalListingPage.tsx`: Shared shell for the species listings including the ListingHero and SpeciesNav; its COPY record (:15-26) is where listing titles/leads live. /sponsors currently bypasses it and uses PublicPageFrame instead — any Sponsorship Area work should pick one of these two frames deliberately, not create a third.
- `PublicPageFrame` — `src/components/site/PublicPageFrame.tsx`: The content-route frame (hero + highlights + chapters + optional CTA + a fixed 'next step' band). /sponsors already uses it (src/routes/sponsors.tsx:60-71). Note :204-222 hardcodes the next-step links to 領養/義工/捐助 — that band is where a sponsorship handoff belongs, and it must be parameterised there rather than duplicated per route.
- `PublicDetailFrame` — `src/components/site/PublicDetailFrame.tsx`: The breadcrumb + .detail-grid (7fr/5fr) + .detail-panel layout used by both animal and sponsor detail via AnimalDetail. Any sponsor-detail changes and any corrected pending skeleton must match this structure.
- `PublicStateShell` — `src/components/site/PublicStateShell.tsx`: The single empty/error/not-found panel, with the headingLevel 1|2 switch (:9-23) that keeps the one-h1 rule verify:brand enforces. Reuse it instead of hand-rolling another centred state block, and pass headingLevel={2} whenever it sits inside a frame that already renders an h1.
- `PublicStatusBadge` — `src/components/site/PublicStatusBadge.tsx`: The 待領養 / 待助養 / 可助養 / 可領養 badge used by AnimalCard (:39-47) and AnimalDetail (:53-55); it carries the icon+text pairing that satisfies the 'colour is never the only signal' rule in docs/brand-guidelines.md:38-39.
- `design tokens (--color-* / --public-radius* / --public-shadow-*)` — `src/styles.css`: @theme block at :7-60 plus --public-radius* at :108-111 and --public-shadow-soft/raised at :194-195 are the token layer that brand/design-tokens.{css,json} and docs/brand-guidelines.md describe. New card/grid work must consume these, not the navy `@utility shadow-soft`/`shadow-panel` at :639-644 and not raw hex.
- `scripts/verify-public-brand.mjs (recordFailure + per-route loop)` — `scripts/verify-public-brand.mjs`: The existing Playwright harness already walks 5 viewports x the route list with failure collection, artefact retention and reflow/reduced-motion passes (:568-659). New brand assertions (palette, card anatomy, grid columns, nav entries, banned copy strings) should be added as assert* functions called from that loop, reusing recordFailure/retainAudit — not as a second script.
- `docs/brand-guidelines.md` — `docs/brand-guidelines.md`: The authoritative 'should be' for Phase 2: 1200px/12-col (:53-54), 8px spacing (:55), 8/16/pill radii (:56-57), 44px targets (:58), one hero family and one card anatomy (:59-60), named fallback with the animal's name (:72-73), no Poofyco/Baloo tokens (:16-17, :103-106). Use it, not docs/DESIGN-SPEC.md, which is explicitly superseded.

### Open questions

- No six-phase revision plan/spec exists in docs/superpowers/{plans,specs}/ at commit c037cc1, so the intended definitions of 助養區 and 助養區小朋友 (is the latter a sponsored-animal sub-catalogue, a child-sponsor programme, or a rename of the existing /sponsors listing?) cannot be established from the repository. The target photo size and card anatomy for Phase 2 are likewise unstated in source.
- Whether the deployed database actually populates animals.public_profile for the legacy-imported records. src/lib/animals/publicProfile.ts parses it defensively and every field is nullable, so the six-'未有記錄' card is reachable in principle, but I cannot confirm from source how many live records hit it.
- verify:brand has never been executed here (it needs a built app, a running nitro preview on 127.0.0.1:4173 and a Supabase fixture). Its pass/fail status at this commit is unknown from source alone; docs/development-owner-uat-status.md:13 claims 26 routes x 5 viewports passed locally, but the script's staticRoutes list is 18 + 4 discovered detail + 4 state = 26, which matches the claim's arithmetic without proving the run.
- docs/development-public-copy-review.md:13 says a production public-content inventory could not be established and that demo-labelled public content was observed by an earlier audit. I could not verify or refute that from source; it needs read-only access to the deployed project.
- Whether the eleven unreferenced site components (BestRescue, FeatureTrio, SocialProof, SocialWall, PhotoMarquee, AdoptionSteps, FundraisingCard, VolunteerCarousel, AdoptionChart, StatCard, Hero) are intentionally parked for a later phase or are genuine dead code to delete. src/routes/index.visual.test.ts:42-45 asserts four of them stay off the home page, which implies deliberate quarantine rather than pending reuse.


## Phase 3 — Sponsorship pledges, monthly model, payments, receipts

The sponsorship domain is a three-table, single-status design: `sponsorship_pledge` (one `status` column that simultaneously encodes commitment, payment and review state), `sponsorship_preference` (ranked animal *wishes*, not assignments), and `sponsorship_payment_proof`. There is no period/month, assignment, or payment-allocation entity anywhere in the repo — `grep -riE "sponsorship_(period|month|cycle|assignment|allocation)|pledge_period|billing"` over `src/` and `supabase/migrations/` returns only `recurring_mandate.next_charge_at` (a donation-side column that no application code reads). A SECOND month's payment cannot be recorded today: `record_sponsorship_payment_proof` hard-rejects any pledge whose status is not `pending_payment`/`needs_followup` (migration 20260829180000 lines 72-74), and the service and UI mirror that gate, so once a pledge reaches `active` there is no path to record another payment and no way to represent month 2 at all. Amounts are stored as integer cents throughout (`amount_cents integer check (> 0)`) and 123.45 survives *storage* (`Math.round(123.45*100) === 12345`), but it does not survive *display* — both sponsorship admin components round with `Math.round(amountCents / 100)` and unconditionally append `/月`, so a one-off recorded payment of HK$123.45 renders as "HK$123/月". Sponsorship money is completely disconnected from `donation`/`payment`/`receipt`: an approved sponsorship payment creates no donation row, gets no IRD receipt, and is excluded from CRM lifetime totals and the payments admin. Finally, the committed sponsorship migrations carry an explicit "NOT applied to the live database" header and the most recent production schema preflight (2026-09-06) records both 20260702130000 and 20260829180000 as absent from the migration ledger.

### Already addressed at this commit (10)

- **Only one payment proof could ever exist per pledge (unique constraint on pledge_id), so staff could not attach a corrected proof after a rejection**
  - Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:20-22 — `alter table public.sponsorship_payment_proof drop constraint if exists sponsorship_payment_proof_pledge_id_key;` followed by `create index if not exists sponsorship_payment_proof_pledge_idx on public.sponsorship_payment_proof (pledge_id);`. Proof rows now accumulate as history.
- **Staff could not record a payment verified out-of-band (e.g. checked the bank directly) because proof file columns were NOT NULL**
  - Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:318-334 drops NOT NULL on storage_path/file_name and rewrites the file_type/file_size CHECKs to allow null; src/lib/sponsorshipAdmin/service.ts:112-124 persists null file fields; src/lib/sponsorshipAdmin/repository.server.ts:345-349 treats a null storage_path as 'no proof' instead of signing a bogus URL.
- **sponsorship_preference.animal_type_snapshot CHECK only allowed 'sponsor' while the zod schema accepted cat/dog/sponsor, so a cat/dog preference insert would violate the constraint**
  - Evidence: Original constraint at supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql:20. Widened at supabase/migrations/20260906162436_animal_catalog_membership.sql:64-68 — `ADD CONSTRAINT sponsorship_preference_animal_type_snapshot_check CHECK (animal_type_snapshot IN ('cat','dog','sponsor'))`, matching src/lib/sponsorship/schemas.ts:41.
- **Admin mutations could be driven by an unvalidated actor and left no audit trail**
  - Evidence: All three RPCs in supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql (lines 51-60, 146-155, 239-248) re-check `admin_user` status='active' and role in ('staff','admin') inside SECURITY DEFINER, take `for update` on the pledge row, and insert an audit_log row (lines 107-124, 207-223, 280-292). Execute is revoked from public and granted only to service_role (lines 296-303).
- **The review RPC and the repository could disagree about which proof row is 'current' once history accumulates**
  - Evidence: Both use newest-first: migration 20260829180000 lines 175-181 `order by created_at desc limit 1 for update`; src/lib/sponsorshipAdmin/repository.server.ts:301-305 + 328 `.order("created_at", { ascending: false })` then `currentProof = proofHistory[0]`. The alignment is documented in a comment at repository.server.ts:296-300.
- **An ineligible pledge could leave an orphaned proof file in the storage bucket**
  - Evidence: src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts:75-77 calls `service.assertRecordPaymentEligible(pledgeId)` before touching storage, and lines 106-109 remove the uploaded object if the subsequent recordPayment throws. `assertRecordPaymentEligible` is defined at src/lib/sponsorshipAdmin/service.ts:93-99.
- **A retried/double-clicked admin action could send the supporter a duplicate pledge status email**
  - Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:355-357 creates `message_pledge_status_update_unique` on (supporter_id, payload->>'reference', payload->>'event'); src/lib/sponsorshipAdmin/notifications.server.ts:82-95 claims the message row before any external send and returns 'skipped' on 23505.
- **A pledge could be created in 'provisional' status when the proof file was never actually uploaded**
  - Evidence: src/lib/sponsorship/submission.server.ts:203-221 runs `verifyUploadedObjects` against the bucket before any DB write and outside the catch-all, throwing SubmissionValidationError (mapped to 400) rather than creating a pledge whose 'provisional' status implies proof that does not exist.
- **Donation-side webhook replay could double-credit or double-receipt**
  - Evidence: src/lib/donations/reconcile.server.ts:91-141 (reserveWebhookEvent with 23505 detection, a 5-minute lease and a processing_owner claim), backed by supabase/migrations/20260626202523_harden_webhook_event_processing.sql:1-6. Receipt issuance is atomic and idempotent per donation via public.issue_receipt (supabase/migrations/20260628120000_harden_receipt_and_payment_lifecycle.sql:27-29 unique partial index + 38-135 RPC).
- **Donation receipt amounts silently dropped cents**
  - Evidence: src/lib/donations/domain.ts:98-109 `centsToHkd` renders 2 decimals whenever `amountCents % 100 !== 0`, and is used by the receipt PDF (src/lib/donations/receipt-pdf.server.ts:37) and payments admin (src/components/admin/donations/PaymentsReconcile.tsx:192,246,298,312).

### Open (14)

**[BLOCKER] A SECOND month's sponsorship payment cannot be recorded. Once the first proof is approved the pledge is 'active', and every layer refuses further payments. The monthly model exists only as a label on the pledge amount — there is no period, cycle, or instalment entity at all.**

- File: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:72-74 — `if v_pledge.status not in ('pending_payment', 'needs_followup') then raise exception 'Sponsorship pledge is not eligible for a recorded payment'; end if;`. Mirrored at src/lib/sponsorshipAdmin/service.ts:34-37 (`RECORD_PAYMENT_ELIGIBLE_STATUSES = ["pending_payment","needs_followup"]`) and enforced again at service.ts:104-106 and :95-97, and in the UI at src/components/admin/sponsorship/pledgeReviewLogic.ts:56-58. Cancelling does not help: `cancelled` is also ineligible. No sponsorship_period/month/cycle/instalment table exists — `grep -riE "sponsorship_(period|month|cycle|assignment|allocation)|pledge_period|billing" src/ supabase/migrations/` returns only supabase/migrations/20260623160506_phase_2_donations_mvp.sql:55 `next_charge_at`, on the unrelated and unused recurring_mandate table.

**[BLOCKER] Pledge, payment, proof and review are collapsed into a single `sponsorship_pledge.status` column. One enum simultaneously encodes the supporter's commitment ('active'/'cancelled'), the payment state ('pending_payment'), and the reviewer's queue state ('provisional'/'needs_followup'), so the model cannot express 'active pledge whose month-3 payment is pending review'.**

- File: `supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql:9 — `status text not null default 'pending_payment' check (status in ('pending_payment','provisional','active','needs_followup','cancelled'))`. Each RPC mutates that one column as its only state output: record sets 'provisional' (20260829180000:103-105), review sets 'active' or 'needs_followup' (:187-193 and :203-205), cancel sets 'cancelled' (:264-266). `sponsorship_preference` is a ranked *wish list* (rank 1..10, unique per pledge), not an assignment — no column ever records which animal a sponsor was actually assigned (20260702130000:14-24).

**[BLOCKER] Sponsorship payments never become donations, so a sponsor can never be issued an IRD tax receipt, and sponsorship money is invisible to reconciliation, the payments admin, and CRM lifetime totals.**

- File: `supabase/migrations/20260628120000_harden_receipt_and_payment_lifecycle.sql`
- Phase: Phase 3
- Evidence: No sponsorship code path touches donation/payment/receipt: `grep -rn "sponsorship" src/lib/donations/` returns zero hits, and `grep -rni "receipt" src/lib/sponsorship/ src/lib/sponsorshipAdmin/` returns only test fixture filenames. The receipt model is bound 1:1 to a donation — supabase/migrations/20260628120000_harden_receipt_and_payment_lifecycle.sql:27-29 `create unique index receipt_one_issued_per_donation on public.receipt ((donation_ids[1])) where status='issued'` and the RPC signature `public.issue_receipt(p_donation_id uuid, ...)` at :38-44. CRM lifetime giving sums donations only: supabase/migrations/20260905162615_crm_complete_read_models.sql:40 `coalesce(sum(d.amount_cents) filter(where d.status='succeeded'),0) ... from public.donation d where d.supporter_id=s.id`. src/lib/crm/repository.server.ts:210 pulls pledge rows for the audit timeline only (`.select("id")`), never their amounts.

**[BLOCKER] There is no evidence the sponsorship schema or its admin-review RPCs exist in the deployed database; the migrations are explicitly flagged as never live-applied, and the repo's migration ledger has diverged from production.**

- File: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:5-6 header: 'NOT applied to the live database by the implementation PR; live apply is a separate, explicitly-confirmed operational step'. docs/superpowers/plans/2026-08-29-sponsorship-admin-review.md:1009: 'until it is applied ... the review view shows its error state.' The latest production preflight (docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json) records `20260702130000` and `20260829180000` as `applied: false`, alongside `20260628120000` (issue_receipt) and `20260630120000` — yet docs/evidence/legacy-import-20260906/membership-production-repair.json shows the catalog-membership migration was applied to production under a *renumbered* version `20260906173545` rather than the repo's `20260906162436`, so the ledger is not a reliable object-existence signal in either direction. The preflight's object-existence probe (docs/evidence/cms-payment-debug-20260906/schema-preflight.sql, the `to_regprocedure` block) covers only 5 CMS/CRM functions and never checks the sponsorship RPCs or tables. docs/development-owner-uat-status.md:8 lists sponsorship as 'NOT RUN. Intended payment linkage and staff operating workflow need sign-off'.

**[HIGH] A one-off recorded payment is rendered as a monthly amount. The same `amountLabel` that formats the pledge's monthly tier is applied to individual payment-proof amounts, appending '/月' to a single transaction.**

- File: `src/components/admin/sponsorship/PledgeDetailDrawer.tsx`
- Phase: Phase 3
- Evidence: src/components/admin/sponsorship/PledgeDetailDrawer.tsx:38-41 — `function amountLabel(amountCents: number) { const dollars = Math.round(amountCents / 100).toLocaleString("en-US"); return `HK$${dollars}/月`; }`. It is then called on proof amounts, not pledge amounts, at line 382 (`{amountLabel(pledge.currentProof.amountCents)}` in the review panel) and line 460 (`{amountLabel(proof.amountCents)}` in the proof-history list). A staff-recorded catch-up payment of HK$1,500 therefore displays as 'HK$1,500/月'.

**[HIGH] Cents are silently dropped on every sponsorship amount display. 123.45 survives storage but not rendering: the amount is integer-divided and rounded to whole dollars.**

- File: `src/components/admin/sponsorship/PledgeReviewLane.tsx`
- Phase: Phase 3
- Evidence: src/components/admin/sponsorship/PledgeDetailDrawer.tsx:39 and src/components/admin/sponsorship/PledgeReviewLane.tsx:30 both do `Math.round(amountCents / 100)`. For 12345 cents that is `Math.round(123.45)` = 123, rendered 'HK$123/月'. The value is stored correctly — src/components/admin/sponsorship/PledgeDetailDrawer.tsx:201 does `Math.round(Number(amountHkd) * 100)` (12345) against an `step="0.01"` input (line 333), and the column is `amount_cents integer` (20260702130000:36) — so the database holds 12345 while the reviewer approving it sees 123. The correct helper already exists and is used everywhere on the donations side: `centsToHkd` at src/lib/donations/domain.ts:98-109.

**[HIGH] The recorded/claimed payment amount is never reconciled against the pledge amount. Approving a proof flips the pledge to 'active' regardless of how much was actually paid — the sponsorship equivalent of the donation-side amount_mismatch guard is entirely absent.**

- File: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Phase: Phase 3
- Evidence: `review_sponsorship_payment_proof` (supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:130-225) reads the proof at :175-181 and sets `v_new_pledge_status := 'active'` at :189 without ever comparing `v_proof.amount_cents` to `v_pledge.amount_cents`. src/lib/sponsorshipAdmin/service.ts:130-148 `reviewProof` checks only `detail.status` and `currentProof.reviewStatus`. Compare the donation path, which does guard this: src/lib/donations/reconcile.server.ts:341-361 `if (payment.amount_cents !== payment.donation.amount_cents)` → audit `payment.amount_mismatch` + terminal `amount_mismatch` result, surfaced as HTTP 422 at reconcile.server.ts:708-716.

**[HIGH] The publicly-submitted proof amount is attacker-controlled and unvalidated against the pledge. A sponsor pledging HK$500/month can submit proofMetadata claiming any amount and the pledge is created 'provisional' on that basis.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 3
- Evidence: src/lib/sponsorship/schemas.ts:44-49 `sponsorshipPaymentProofMetadataSchema` validates only `amountCents: z.number().int().positive()`; it is never cross-checked against `resolveTierAmountCents` (schemas.ts:146-151). src/lib/sponsorship/submission.server.ts:259 sets `status = parsed.proof ? "provisional" : "pending_payment"` and :278-292 inserts the proof with the client's amount verbatim via `toPaymentProofInsert` (schemas.ts:179-197). The client supplies it at src/components/site/sponsorship/PledgeWizard.tsx:185 `amountCents: Math.round((Number(proofAmount) || 0) * 100)`. Note the route does re-derive `animalType` server-side (src/routes/api/sponsorships/pledges.ts:66-70) — the amount gets no equivalent treatment.

**[MEDIUM] The pledge status-email idempotency index over-blocks a legitimate correction cycle: the second and subsequent 'proof_recorded' / 'needs_followup' emails for the same pledge are silently swallowed as duplicates, so a sponsor whose corrected payment is recorded after a rejection is never told.**

- File: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:355-357 keys the unique index on `(supporter_id, (payload->>'reference'), (payload->>'event'))`. `reference` is `pledgeReference(pledge.id)` (src/lib/sponsorshipAdmin/service.ts:54), which is constant for the life of the pledge (src/lib/sponsorship/statusSummary.ts:3-6), and `event` is one of only four values (src/lib/sponsorship/emailTemplates.server.ts:118). The migration comment at :348-351 assumes each event fires at most once, but :10-13 of the same file explicitly designs for proofs accumulating across repeated record→reject cycles. On the second cycle src/lib/sponsorshipAdmin/notifications.server.ts:93 returns 'skipped' on 23505 and no email is sent; the service swallows it silently (service.ts:45-60 only logs on throw).

**[MEDIUM] No idempotency key on the admin record-payment API. The multipart POST has no client-supplied key and no dedupe on (pledge, payment_date, reference, amount) — it relies entirely on the pledge status flipping to 'provisional' inside the RPC.**

- File: `src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts`
- Phase: Phase 3
- Evidence: src/routes/api/admin/sponsorships/pledges/$id/proof.ts:27-32 exposes POST with no idempotency header/param; src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts:56-103 parses `payload` and `file` only; src/lib/sponsorshipAdmin/schemas.ts:32-47 `recordPledgePaymentSchema` has no key field. The only protection is the status re-check under `for update` at supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql:62-74. There is no uniqueness constraint on sponsorship_payment_proof beyond `unique (storage_bucket, storage_path)` (20260702130000:40), and the storage path is time-salted (`staff-${Date.now()}-...`, -recordPaymentUpload.ts:84), so it dedupes nothing. Contrast the donation path, which has a real key: reconcile.server.ts:91-141 keyed on (provider, provider_event_id).

**[MEDIUM] Replaying the public pledge submission with the same client-generated pledgeId returns HTTP 500 instead of the existing pledge, so a network retry looks like a server fault to the supporter.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 3
- Evidence: src/lib/sponsorship/submission.server.ts:261-268 inserts with the client-supplied `parsed.pledgeId` as the primary key; a duplicate raises 23505, which the blanket catch at :317-321 rewrites to `new Error("Failed to save sponsorship pledge")`. src/routes/api/sponsorships/pledges.ts:78-84 then classifies it as non-validation and returns 500. The pledgeId is otherwise a perfectly good idempotency key — it just is not treated as one.

**[MEDIUM] The sponsorship migration tests only string-match the SQL text; nothing executes the RPCs against a real Postgres, so behavioural regressions in the status guards or the review transition would pass CI.**

- File: `src/lib/supabaseMigrations.test.ts`
- Phase: Phase 3
- Evidence: src/lib/supabaseMigrations.test.ts:734-805 reads the file with `readMigrationBySuffix("_sponsorship_pledge_admin_review.sql")` and asserts with `expect(sql).toContain(...)` / regex over the raw text (e.g. :737, :740, :752-754, :773-779, :805). By contrast src/lib/crm/manualGift.database.test.ts:297 runs real SQL against a live database, so the pattern for doing this properly already exists in the repo.

**[LOW] The '/月' suffix and both proof-file validation messages are hardcoded Traditional Chinese in components that are otherwise fully i18n'd through useAdminPageCopy, so an English-locale admin sees mixed-language amounts and errors.**

- File: `src/components/admin/sponsorship/pledgeReviewLogic.ts`
- Phase: Phase 3
- Evidence: src/components/admin/sponsorship/PledgeDetailDrawer.tsx:40 returns `HK$${dollars}/月` while every other string in the component comes from `copy` / `pageCopy` (lines 114-123). Same at src/components/admin/sponsorship/PledgeReviewLane.tsx:31. src/components/admin/sponsorship/pledgeReviewLogic.ts:84 and :87 return '檔案格式不支援，請上載 JPG、PNG、WEBP 或 PDF 檔案' and '檔案大小超過上限（8MB）' as literals, surfaced at PledgeDetailDrawer.tsx:357-361.

**[LOW] Only the newest payment proof's file can be viewed. Earlier proofs in the history list render their metadata but offer no way to open the attached file, so a reviewer cannot re-examine a previously rejected proof.**

- File: `src/lib/sponsorshipAdmin/repository.server.ts`
- Phase: Phase 3
- Evidence: src/lib/sponsorshipAdmin/repository.server.ts:333-349 `getProofSigningInfo` takes the pledge id only and hard-codes `.order("created_at", { ascending: false }).limit(1)` — there is no per-proof-id variant. The route src/routes/api/admin/sponsorships/pledges/$id/proof-url.ts is keyed on the pledge, not the proof. Consequently `ProofPreview` is rendered only for `pledge.currentProof` (src/components/admin/sponsorship/PledgeDetailDrawer.tsx:384) while the history list at :438-474 shows only `proof.fileName` as text (:462-466).

### Must reuse, not reinvent (11)

- `centsToHkd` — `src/lib/donations/domain.ts`: The canonical cents→HKD formatter (line 98-109). It preserves cents only when present (`amountCents % 100 !== 0`) and is already the shared formatter for the receipt PDF (receipt-pdf.server.ts:37), the payments admin (PaymentsReconcile.tsx:192,246,298,312) and the public pledge wizard (PledgeWizard.tsx:321). Both sponsorship admin components must switch to it instead of their duplicated `Math.round(amountCents / 100)` helpers, and the '/month' suffix must become a caller decision rather than part of the formatter.
- `public.issue_receipt RPC + issueReceiptIfNeeded` — `supabase/migrations/20260628120000_harden_receipt_and_payment_lifecycle.sql (RPC, lines 38-135) and src/lib/donations/reconcile.server.ts (caller, ~line 222-283)`: The atomic allocate-number-and-insert-row receipt issuer, idempotent per donation, backed by the `receipt_one_issued_per_donation` unique partial index and `private.allocate_receipt_number`. Any sponsorship receipting work must route through this (by materialising sponsorship payments as donation rows, or by generalising p_donation_id to a payable reference) rather than minting a parallel receipt sequence — the IRD number sequence must stay single-source.
- `reserveWebhookEvent / markWebhookEventProcessed / releaseWebhookEventReservation` — `src/lib/donations/reconcile.server.ts`: The established idempotency primitive (lines 91-178): unique (provider, provider_event_id) insert, 23505 detection, a 5-minute lease with `processing_owner`, and explicit release on failure. Any sponsorship webhook or idempotent admin write should use this shape and the existing `webhook_event` table rather than inventing a second dedupe mechanism.
- `sendPledgeStatusUpdateEmail claim-before-send pattern` — `src/lib/sponsorshipAdmin/notifications.server.ts`: Lines 82-101 claim the `message` row before any external send and return 'skipped' on 23505. The pattern is right and should be kept; only the index key needs widening (add the proof id or an attempt counter to the payload and the unique index) so a correction cycle's repeat events are not misread as duplicates.
- `applySucceededPayment amount-mismatch guard` — `src/lib/donations/reconcile.server.ts`: Lines 341-361 show the house pattern for a payment whose amount disagrees with what was expected: write a `payment.amount_mismatch` audit row, return a terminal non-crediting result, and let the caller map it to 422 (lines 708-716). Sponsorship proof review needs exactly this rather than a new invention.
- `RECORD_PAYMENT_ELIGIBLE_STATUSES / assertRecordPaymentEligible / canRecordPayment` — `src/lib/sponsorshipAdmin/service.ts (lines 34-37, 93-99) and src/components/admin/sponsorship/pledgeReviewLogic.ts (lines 56-58)`: The single place the record-payment gate is expressed on the TS side, kept in lockstep with the RPC's own check. Introducing a period/instalment concept must update all three call sites plus migration 20260829180000:72-74 together — they are already deliberately mirrored and a partial change will diverge silently.
- `validateProofDescriptor and safeFileName` — `src/lib/sponsorship/schemas.ts (lines 132-144) and src/lib/publicUploads/signedUpload.server.ts (re-exported via src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts:25-27)`: Shared MIME/size validation and filename sanitisation for proof uploads, used by both the public wizard and the staff multipart route. The comment at -recordPaymentUpload.ts:21-24 records that a previous local copy drifted and reintroduced a bug — do not fork these again.
- `pledgeReference` — `src/lib/sponsorship/statusSummary.ts`: Lines 3-6 define the single human-facing pledge reference format ('SP-' + first 8 hex chars). It is depended on by the admin search parser (repository.server.ts:100-106, which relies on it being exactly the id's first dash-delimited segment), by the notification payload key (service.ts:54), and by the message idempotency index. Changing the format breaks all three.
- `donation_delivery_job worker (createDonationDeliveryWorker / createSupabaseDeliveryJobRepository)` — `src/lib/donations/deliveryJobs.server.ts`: The existing lease-claim/complete/fail/retry queue with exponential backoff and a retryable-vs-attention_required split (lines 37-104 and 158-203), plus the `claim_donation_delivery_job` and `retry_donation_delivery_job_with_audit` RPCs. If sponsorship approval gains side effects (receipt, acknowledgement), it should enqueue onto this machinery rather than performing fire-and-forget work in the request path as service.ts:45-60 does today.
- `private.allocate_receipt_number` — `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`: Lines 199-214: the single gap-free IRD receipt-number allocator backed by `receipt_sequence`, callable only from within a SECURITY DEFINER function owned by the schema owner. Sponsorship receipting must not add a second sequence.
- `buildConsentRows` — `src/lib/donations/domain.ts`: Lines 83-96 build the consent ledger rows, already reused by the sponsorship submission path (src/lib/sponsorship/submission.server.ts:18, 248-256) and protected by the `consent_dedup_unique` index (migration 20260630120000:42-43). New sponsorship entry points should keep using it.

### Open questions

- Do `public.sponsorship_pledge`, `sponsorship_preference`, `sponsorship_payment_proof` and the three admin-review RPCs actually exist in the deployed database? The repo cannot answer this. The ledger says no (production-schema-preflight.json: 20260702130000 and 20260829180000 both `applied: false`), the migration header and plan say they were deliberately never live-applied, but membership-production-repair.json shows production renumbering repo migrations on apply (20260906162436 → 20260906173545), so the ledger is unreliable in both directions. Needs a direct `to_regclass('public.sponsorship_pledge')` / `to_regprocedure('public.record_sponsorship_payment_proof(uuid,uuid,text,text,text,integer,text,text,integer,date,text)')` probe against production before anything in Phase 3 is called working.
- Production's migration ledger is non-contiguous in a way that breaks ordering assumptions: 20260630154259 is applied while 20260630120000 is not, and 20260803120000 is applied while 20260720100000 is not. A future `supabase db push` would replay the gaps out of order. Notably supabase/migrations/20260906162436_animal_catalog_membership.sql:64-65 uses a bare `DROP CONSTRAINT` (no IF EXISTS) on `public.sponsorship_preference`, which fails outright if 20260702130000 has not run first. Someone needs to reconcile the ledger before any further live apply.
- Is `public.issue_receipt` present in production? The preflight records 20260628120000 as not applied, and src/lib/donations/reconcile.server.ts:219 calls `client.rpc("issue_receipt", ...)` unconditionally on the receipt-eligible path. If the RPC is genuinely absent, every eligible donation reconciliation throws — which would make the donation receipt flow non-functional, not merely the sponsorship one. This is adjacent to my area but blocks any claim that receipts work at all.
- What is the intended monthly model? Nothing in the repo states whether a sponsorship is meant to generate a recurring charge (the unused `recurring_mandate` table at 20260623160506:47-58 suggests it was once contemplated), a monthly reminder to pay manually, or a single confirmation with informal ongoing payments. That decision determines whether the fix is a `sponsorship_period` table, a `recurring_mandate` link, or an instalment ledger. docs/development-owner-uat-status.md:8 explicitly defers this: 'Intended payment linkage and staff operating workflow need sign-off'.
- Should a sponsorship payment be receiptable under IRD Section 88? The receipt PDF text (src/lib/donations/receipt-pdf.server.ts:58) claims 'HK$100 or above may be tax deductible', and the standard tiers are HK$100/300/500 (src/lib/sponsorship/schemas.ts:13-17) — all at or above the threshold and all currently un-receiptable. If sponsorships are receiptable, the fix is structural (materialise a donation row per payment); if not, the admin UI should say so explicitly rather than leaving the gap silent.
- I labelled every finding 'Phase 3' because I was given no definition of Phases 1-6. The migration-ledger/live-apply findings in particular may belong to a deployment or operations phase rather than to Phase 3 proper.


## Phase 1/2 — Demonstration and test data inventory (demo content origin, production seed guards, public surfaces)

None of the seven named demo content items exist anywhere in the repository at c037cc1 — a full-repo grep finds 小白康復中 only in TypeScript test fixtures and plan docs, 豆豆/Lucky only as seeded *animal* names in supabase/seed.sql, and 阿橘需要助養 / 夏日領養日 / 七月慈善市集 / 六月救援報告 / 豆豆新生活更新 not at all. supabase/seed.sql inserts no content_item rows (its insert list stops at audit_log), and no migration or script seeds content_item, so all seven were created directly in the production database through the admin CMS; the 【示範】 prefix is a title convention only, since content_item (supabase/migrations/20260705120000_story_promotion_center.sql:1-23) has no is_demo/source column — unlike supporter rows which carry source='demo_seed' and a 'demo' tag. Two production guards do exist and work, but they guard the wrong things: scripts/seed-admin.js:85-91 hard-blocks the production project ref, and supabase/seed.sql:20-30 requires -v confirm=yes; neither touches content_item, and nothing in the content publish path (src/lib/content/lifecycle.service.ts:68, src/lib/content/service.ts) has any environment gate, so these items are publishable in production today and were published there. The public surfaces that carry them are the homepage featured band (src/routes/index.tsx:39,45,81), /stories wall + map + promotion grid (src/routes/stories.tsx:55-60), /stories/$slug with its full OG/Twitter card (src/routes/stories/$slug.tsx:34-63), /sitemap.xml (src/routes/sitemap[.]xml.ts:51,66-69), and three unauthenticated JSON endpoints (/api/stories, /api/stories/$slug, /api/stories/map). The parallel animal-side demo problem was resolved: 44 placeholder animals were retired and replaced by 248 legacy records in production (docs/evidence/legacy-import-20260906/animal-replacement-release-proposal.md:11,21 plus the applied-status note at profile-release-proposal.md:3), but no equivalent inventory or cleanup exists for content_item.

### Already addressed at this commit (7)

- **supabase/seed.sql could be run silently against the wrong (production) database**
  - Evidence: supabase/seed.sql:20-30 — `set local myvars.confirm = :'confirm';` followed by a DO block that raises 'Refusing to run supabase/seed.sql without explicit confirmation.' unless the value is 'yes'. The whole file is wrapped in `begin;` (line 1), so the exception aborts the transaction with zero rows written. The header comment at lines 5-12 is explicit that this does not detect which project is connected — it only prevents an unintentional run.
- **scripts/seed-admin.js could create/overwrite an admin account on the production Supabase project**
  - Evidence: scripts/seed-admin.js:51 `export const PRODUCTION_PROJECT_REF = "iihqjzilgawhfdhdevam";`, :53-61 `extractProjectRef` (lowercases the host first so a capitalised ref cannot fail open), :63-65 `isProductionProjectRef`, and :85-91 the hard `process.exit(1)` block inside `main()`. The entry-point guard at :194-199 means importing the module for tests runs no env reads or network calls. Unit tests exist at scripts/seed-admin.test.ts.
- **Supabase CLI auto-seeding would push demo data into any reset database**
  - Evidence: supabase/config.toml:65-77 — `[db.seed] enabled = false` with a comment explaining the CLI cannot supply the new `-v confirm=yes` flag, so automatic seeding during `supabase start`/`db reset` is turned off deliberately.
- **44 placeholder/demo animal records visible on the public catalogues**
  - Evidence: docs/evidence/legacy-import-20260906/animal-replacement-release-proposal.md:11 ('The user identified all 44 current animal records as placeholders') and :21 ('Placeholder records retired | 44'); docs/evidence/legacy-import-20260906/profile-release-proposal.md:3 records that the replacement and the 248-profile publication were subsequently authorised and applied; docs/evidence/legacy-import-20260906/live-photo-story-diagnosis.json confirms 248 active animals in production. Retirement is non-destructive via `retired_at` (supabase/migrations/20260906162436_animal_catalog_membership.sql:5,33-34) so foreign keys survive.
- **A fresh/restored database would have no adoption-guide document row, or would expose a placeholder publicly**
  - Evidence: supabase/migrations/20260718121000_seed_knowledge_guides.sql:20-40 — the fresh-database branch inserts its placeholder with `is_published = false` in both tables, with an in-file explanation that RLS (20260719223000_public_document_read_policies.sql) and the /knowledge listing both filter on is_published, so it can never be served to a visitor. This is the pattern any future demo-content seeding should copy.
- **scripts/restore-database.mjs could restore a demo/backup dump into a remote target**
  - Evidence: scripts/restore-database.mjs:4-5 and :24,:76,:85-89 — it positively confirms the resolved Docker endpoint is local and treats an undeterminable endpoint as 'not confirmed local', refusing to proceed.
- **scripts/verify-content-publishing.mjs could be pointed at a hosted target**
  - Evidence: scripts/verify-content-publishing.mjs:9-16 requires CMS_EDITOR_TEST_ALLOW_LOCAL_FIXTURES=1, :17-28 rejects any hostname that is not localhost/127.0.0.1/[::1], and :29-30 pins the exact loopback ports.

### Open (14)

**[BLOCKER] No demo/test-data inventory exists in the repository for content_item. The audit's seven published demo items appear nowhere in source; only one of them (豆豆新生活更新) is even named in a tracked document, so there is no enumerable list of what must be unpublished before cutover.**

- File: `docs/superpowers/audits/2026-09-05-hkscda-current-status.md`
- Phase: Phase 1
- Evidence: Full-repo grep (excluding node_modules/.git/.worktrees/.tanstack) for 阿橘需要助養, 夏日領養日, 七月慈善市集, 六月救援報告 returns zero matches anywhere. 豆豆新生活更新 appears only at docs/superpowers/audits/2026-09-05-hkscda-current-status.md:68. 小白康復中 appears only in test fixtures (src/lib/content/service.test.ts:26, src/components/site/stories/StoryWall.test.tsx:27, etc.) and docs/superpowers/plans/2026-07-05-story-promotion-center.md. supabase/seed.sql's insert list (lines 40,52,63,80,93,248,279,299,311,329,359,381,402,425,448,482,499,532,550) contains no content_item insert. docs/development-release-proposal.md:34 states the demo-content inventory is a future release step that has not run.

**[BLOCKER] The production demo-seed guard covers only two of the repo's write-capable seeding/import scripts. scripts/import-hkscda-animals.js — exposed as `npm run import:hkscda` — builds a service-role client from VITE_SUPABASE_URL with no project-ref check and no confirmation flag, so it writes scraped animal rows and public Storage objects straight into whatever project the env names.**

- File: `scripts/import-hkscda-animals.js`
- Phase: Phase 2
- Evidence: scripts/import-hkscda-animals.js:41-58 reads VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at module top level and calls createClient with no isProductionProjectRef check (contrast scripts/seed-admin.js:85-91). package.json:17 exposes it as `"import:hkscda": "node scripts/import-hkscda-animals.js"`. docs/superpowers/plans/2026-09-01-production-demo-seed-guard.md line 7 scopes the work to 'both of this repo's demo-seeding scripts', which excluded this one. The working tree's gitignored .env.local resolves VITE_SUPABASE_URL to https://iihqjzilgawhfdhdevam.supabase.co — the exact ref hardcoded as PRODUCTION_PROJECT_REF at scripts/seed-admin.js:51.

**[HIGH] content_item has no machine-readable demo marker, so demo content cannot be identified by query — only by the human-readable 【示範】 title prefix, which is itself the public-facing string. There is no column analogous to supporter.source='demo_seed'.**

- File: `supabase/migrations/20260705120000_story_promotion_center.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260705120000_story_promotion_center.sql:1-23 defines content_item with no source/is_demo/origin column; a grep for is_demo|is_sample|seed_source across supabase/migrations and src/lib returns nothing. Contrast supabase/seed.sql:282-287 where every demo supporter carries array['demo', ...] and 'demo_seed' in the source column. 【示範】 itself occurs in only three tracked files, all documentation (docs/superpowers/audits/2026-09-05-hkscda-current-status.md:68, docs/superpowers/plans/2026-07-15-stories-loading-performance.md:511, docs/superpowers/plans/2026-08-27-public-layout-integration-v4.md:389).

**[HIGH] scripts/import-hkscda-animals.js has no working idempotency: its upsert key column source_url does not exist in any migration, so every run takes the 'continuing without idempotent upsert' path and INSERTs duplicate animal rows. It also bypasses the reviewed animal-replacement transaction entirely (no fingerprint guard, no before-images, no rollback manifest, no audit rows).**

- File: `scripts/import-hkscda-animals.js`
- Phase: Phase 2
- Evidence: scripts/import-hkscda-animals.js:95-106 warns and returns false when the source_url column is missing, printing 'Continuing without idempotent upsert — duplicates may be created.'; :180-201 then skips the existing-row lookup and calls `.insert(record)` unconditionally. A grep for source_url across supabase/migrations/ returns zero matches — the column is only ever created by the manual ALTER TABLE suggested in the script's own docstring (:15-18). Contrast scripts/legacy-import/replacement_transaction.sql:16-19 (expected-ID and fingerprint guard), :23-27 (before-images + audit) and :42-72 (guarded rollback), none of which this script uses.

**[HIGH] No automated check anywhere asserts that public surfaces are free of demo-labelled content. There is no test, no verifier assertion, and no CI step that greps rendered public HTML or the published-content API for 【示範】 or other demo markers.**

- File: `docs/owner-uat-checklist.md`
- Phase: Phase 2
- Evidence: Grep for 【示範】 across the whole repo matches only three documentation files; there is no occurrence in src/, scripts/ or .github/. The nearest thing is a manual UAT prose instruction at docs/owner-uat-checklist.md:117 ('no leftover `hkscdagpt` demo content'), which is a human pass/fail field, and a suggested-but-not-wired grep at docs/superpowers/plans/2026-08-27-public-layout-integration-v4.md:389 that scans src/ only, never rendered output or database rows.

**[HIGH] The CI brand/a11y/performance fixture stubs read_published_content_snapshots to an empty result, so every CI run exercises the homepage featured-story band, /stories (wall, map, promotion grid) and /sitemap.xml's story section in their empty state only. No CI job has ever rendered a published content item, which is precisely why demo content on those surfaces went unnoticed.**

- File: `scripts/ci/supabase-fixture.mjs`
- Phase: Phase 2
- Evidence: scripts/ci/supabase-fixture.mjs:192-195 — `if (req.method === "POST" && path === "/rest/v1/rpc/read_published_content_snapshots") { json(res, 200, { total: 0, rows: [] }); return; }`. That RPC is the single source for every public content read (src/lib/content/repository.server.ts:716-719 readPublished, used by listPublicContent/listPublicStoriesPage/getPublicContentBySlug/listPublicMapStories at :749-775). The fixture does populate ANIMALS (:60-75) so animal routes are covered — content routes are not.

**[HIGH] Nothing in the content publish path is environment-aware. There is no production check, no demo-title rejection and no approval gate on publishContent/lifecycle.publish, so any of the seven demo items can be (re-)published to the live site today by any active staff/admin CMS user.**

- File: `src/lib/content/lifecycle.service.ts`
- Phase: Phase 2
- Evidence: src/lib/content/lifecycle.service.ts:68-73 `publish(command)` only parses identity + selection + idempotencyKey before delegating to the repository; src/lib/content/service.ts has no environment branch; a grep for NODE_ENV|VERCEL_ENV|import.meta.env.PROD|isProduction across src/lib/content returns zero matches (the only hit in src/lib/config.server.ts:21 merely reports nodeEnv). The database RPC public.publish_content_revision (supabase/migrations/20260905150012_content_revision_lifecycle.sql) applies no content-origin check either.

**[MEDIUM] The homepage 'featured story' band takes the single most recently published content item of ANY type and renders it under a hard-coded 救援故事 heading. A published event, charity_market or report (e.g. 七月慈善市集 or 六月救援報告) will be presented on the homepage as a rescue story. It also ignores the rescue_story_profile.is_featured flag the CMS exposes.**

- File: `src/routes/index.tsx`
- Phase: Phase 2
- Evidence: src/routes/index.tsx:39,45 — `getPublicStoriesPage().catch(() => null)` then `featuredStory: stories?.items?.[0] ?? null` with no type filter; :81 `<FeaturedStory story={featuredStory} />`. The ordering is `order by published_at desc nulls last,id` in supabase/migrations/20260905150012_content_revision_lifecycle.sql:511-513, so items[0] is simply the newest item of any of the four types (rescue_story, event, charity_market, report per supabase/migrations/20260705120000_story_promotion_center.sql:4). src/components/site/home/FeaturedStory.tsx:31 renders a fixed `<p className="eyebrow">救援故事</p>`. isFeatured is projected through at src/lib/content/publicStoriesPage.server.ts:38 but never read by any consumer.

**[MEDIUM] /sitemap.xml and /stories both silently truncate to the first 25 published content items, because loadPublicStoriesPage() passes an empty filter object and the shared schema defaults pageSize to 25 (hard-capped at 50). /stories has no pagination UI, so items beyond the 25th are unreachable from the site and absent from the sitemap.**

- File: `src/routes/sitemap[.]xml.ts`
- Phase: Phase 2
- Evidence: src/routes/sitemap[.]xml.ts:51 calls `loadPublicStoriesPage()` and :66-69 maps `storiesResult.value.items` to /stories/<slug> paths. src/lib/content/publicStoriesPage.server.ts:56 calls `service.listPublicStoriesPage({})`. src/lib/content/schemas.ts:52-54,64 — `boundedPageSize` catches to 25 and transforms with `Math.min(value, 50)`, and contentSearchSchema sets `pageSize: boundedPageSize.default(25)`. The SQL applies `limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))` (supabase/migrations/20260905150012_content_revision_lifecycle.sql:512-513). src/routes/stories.tsx:55-60 renders StoryWall/RescueMap/StoryContentGrid from that one page with no pager.

**[MEDIUM] Story detail pages emit full OG/Twitter summary_large_image cards built from the content title, so a demo item's 【示範】 title and cover image are what social platforms and link unfurlers cache. Nothing strips or gates a demo-labelled title at the metadata layer.**

- File: `src/routes/stories/$slug.tsx`
- Phase: Phase 2
- Evidence: src/routes/stories/$slug.tsx:36-37 derives pageTitle from `loaderData?.seoTitle ?? loaderData?.title`, then :49-60 emit og:title, og:description, og:image, og:url, twitter:card=summary_large_image, twitter:title, twitter:image, and :62 a self-canonical link. robots.txt (src/routes/robots[.]txt.ts:12-19) allows /stories and /stories/* — only /admin/, /api/, /adoption/apply and the three status-token prefixes are disallowed.

**[MEDIUM] Published content is also reachable through three unauthenticated JSON endpoints, so unpublishing checks that look only at rendered HTML pages will miss a surface. These return the same published snapshots as the pages.**

- File: `src/routes/api/stories.ts`
- Phase: Phase 1
- Evidence: src/routes/api/stories.ts:20-25 (GET -> listPublicStoriesPage), src/routes/api/stories/$slug.ts:20-25 (GET -> getPublicContent), src/routes/api/stories/map.ts:20-25 (GET -> listPublicMapStories). All three construct handlers whose requireContentAdmin throws 403 (:13-15 in each), i.e. the admin surface is closed but the public GET is open. robots.txt disallows /api/ for crawlers only; the endpoints remain publicly fetchable.

**[MEDIUM] Disabling Supabase CLI auto-seeding left no supported path to populate a fresh local/CI database with demo domain data. `supabase db reset` now yields an empty schema, and seed.sql must be applied by a hand-typed psql command against a connection string the tool cannot validate — the same manual step that could target production.**

- File: `supabase/config.toml`
- Phase: Phase 2
- Evidence: supabase/config.toml:66-77 sets `[db.seed] enabled = false` while `sql_paths = ["./seed.sql"]` remains (line 79), so the path is configured but never executed. package.json:6-25 has no seed:db / seed:data script — only `seed:admin`. supabase/seed.sql:13 documents the only invocation as `psql <connection-string> -v confirm=yes -f supabase/seed.sql`, and the file header at lines 5-12 concedes it 'does not detect which project is connected'.

**[MEDIUM] Seeded demo animals are identifiable only by a 'Demo：' prefix inside the internal notes field, with no structured marker, so a demo-record inventory cannot be run by query the way it can for supporters.**

- File: `supabase/seed.sql`
- Phase: Phase 1
- Evidence: supabase/seed.sql:106-107 ('Demo：已絕育，已打基本疫苗。' / 'Demo: desexed and core vaccinated.') and the same pattern at :122-123, :138-139, :155-156, :172-173, :190-191, :205-206, :221-222 — eight animals, all marked only in notes/notes_en. No tag, source or flag column is set on public.animals. Contrast supabase/seed.sql:282-287 where supporters set source='demo_seed' and tags array['demo', ...]. docs/superpowers/specs/2026-07-01-demo-seed-data-design.md:135 states the intent ('Keep demo records identifiable through names, emails, tags, or notes') but notes are not queryable as a contract.

**[LOW] articleSchema is defined but never used, so story detail pages ship no Article JSON-LD. Structured data is therefore not a surface that currently carries demo content — but it is also a missing SEO surface that will need the same demo-content discipline once wired.**

- File: `src/lib/schema.tsx`
- Phase: Phase 2
- Evidence: src/lib/schema.tsx:43-57 exports `articleSchema(title, description, datePublished, author)`. Grepping src for its use returns only the definition itself; the only renderJsonLd consumers are src/routes/report/adoption.tsx:8 and src/routes/report/audit.tsx:10 (datasetSchema) and src/routes/__root.tsx:24 (organizationSchema, websiteSchema). src/routes/stories/$slug.tsx renders no JSON-LD.

### Must reuse, not reinvent (11)

- `extractProjectRef / isProductionProjectRef / PRODUCTION_PROJECT_REF` — `scripts/seed-admin.js`: Lines 51-65. Already-tested (scripts/seed-admin.test.ts), side-effect-free exported helpers that normalise the host before matching so the guard cannot fail open. Any new guard on scripts/import-hkscda-animals.js, scripts/import-adoption-guide-drafts.mjs or a future demo-content inventory/cleanup script MUST import these rather than re-deriving a ref check. Note the module already uses the entry-point idiom at :194-199 so importing it is safe.
- `public.read_published_content_snapshots` — `supabase/migrations/20260905150012_content_revision_lifecycle.sql`: Lines 498-518. The single SQL source for every public content read — /stories, homepage featured band, /stories/$slug, /sitemap.xml and all three /api/stories endpoints go through it via readPublished. Any demo-content exclusion or inventory filter belongs here (or in the item's published state), not duplicated per-route. It is service_role-only, so callers must go through the repository.
- `readPublished + listPublicStoriesPage / getPublicContentBySlug / listPublicMapStories` — `src/lib/content/repository.server.ts`: Lines 716-775. The one repository seam every public content surface funnels through. New demo-inventory or exclusion work goes here rather than in routes, otherwise /api/stories and /sitemap.xml will diverge from the rendered pages.
- `loadPublicStoriesPage / createPublicStoriesPageReader / projectPublicStoriesPage` — `src/lib/content/publicStoriesPage.server.ts`: Lines 43-79. Already re-filters to status==='published' and narrows storyProfile to public fields; it is the shared entry point for both the homepage loader and the sitemap. Any pagination fix for the sitemap, or a type/is_featured-aware featured-story selector, should be added here so both consumers get it.
- `private.insert_content_revision with the 'legacy_backfill' operation` — `supabase/migrations/20260905150012_content_revision_lifecycle.sql`: Lines 402-417 plus the immutability trigger at :441-454. Every content_item status change already produces an immutable revision snapshot and an audit_log row. Unpublishing or archiving demo content MUST go through publish/restore/mutate_content_revision_with_audit RPCs rather than a direct UPDATE, or the published_revision_id pointer and audit trail desynchronise. lifecycle.sql.test.ts:35 pins the backfill string.
- `pg_temp.apply_animal_replacement / pg_temp.rollback_animal_replacement` — `scripts/legacy-import/replacement_transaction.sql`: The reviewed, session-local, all-or-nothing pattern proven on the 44-to-248 animal cutover: expected-ID set + row fingerprint precondition (:16-19), before-images into private.animal_replacement_row, audit rows per change, idempotent replay (:8-14) and a rollback that locks against concurrent FK checks (:49-61). A demo-content unpublish/replacement should be built as the content equivalent of this, not as ad-hoc UPDATEs.
- `supabase/config.toml [db.seed] disabled-with-rationale block` — `supabase/config.toml`: Lines 65-79. The canonical record of why CLI auto-seeding is off. Any change to how demo data reaches a local/CI database must update this comment, because it is the only place explaining that `supabase start` will not fail on the seed guard.
- `scripts/ci/supabase-fixture.mjs PostgREST-shaped fixture server` — `scripts/ci/supabase-fixture.mjs`: Read-only, fixed-ID, no-PII local HTTP fixture already routed for read_published_content_snapshots at :192-195 (currently returning an empty result). Populating that one branch with clearly-labelled synthetic content — following the existing animal convention at :52 ('此為本機驗證的動物故事，不代表真實動物') — is the cheapest way to give /stories, the homepage band and the sitemap real CI coverage. Its SHA is hashed into the verifier run context (scripts/verify-public-brand.mjs:90-94), so changes are traceable.
- `Fresh-database placeholder pattern in seed_knowledge_guides` — `supabase/migrations/20260718121000_seed_knowledge_guides.sql`: Lines 20-40. The established convention for demo/placeholder rows that must exist for schema invariants but must never be publicly servable: insert with is_published=false, and rely on the RLS policy plus the public listing filter as two independent barriers. Any future demo content seeding should follow this rather than inventing a new marker.
- `Loopback-only target guard in verify-content-publishing.mjs` — `scripts/verify-content-publishing.mjs`: Lines 9-30. An opt-in env flag plus strict hostname/protocol/port validation that refuses any non-loopback target. This is the right template for a read-only demo-content inventory script that must never accidentally write, and a stronger model than seed.sql's confirm-only gate.
- `toPublicContentDetail / snapshotSummary / snapshotMapPoint` — `src/lib/content/repository.server.ts`: Lines 542-565, 671-713. The projection layer that strips internal updates, internal addresses and unsafe CTA hrefs, and that gates map points on type==='rescue_story' && showOnMap. Any type-aware featured-story selection or demo exclusion should reuse these predicates instead of adding parallel filtering in components.

### Open questions

- Where exactly did the six unnamed demo content items come from? The repository has no record of them at all — only 豆豆新生活更新 is named (audit line 68). The remaining six titles in the task brief must have come from a live production database read, not from this commit. A read-only production query of public.content_item (id, slug, type, title, status, published_at, created_by) is required before any unpublish plan can be written, and that query is outside this read-only source audit.
- Do the seven items actually carry the 【示範】 prefix, or is that prefix only on 豆豆新生活更新? The audit quotes the prefix for exactly one item. If the other six lack it, title-based identification will not work at all and a per-item owner decision is unavoidable.
- Is the production content_revision backfill complete for these items? The legacy_backfill loop (20260905150012:405-416) raises 'Cannot backfill content revision without active actor' if no active staff/admin row exists. Whether it ran cleanly against production, and whether all seven now have a non-null published_revision_id, is unverified from source.
- Which production migration version corresponds to 20260905150012_content_revision_lifecycle.sql? Two prior migrations are documented as having mismatched production timestamps (20260907011009 -> 20260906181657 and 20260906173545 -> 20260906162436, per profile-release-proposal.md:3,15). The same mapping question applies here and must be checked before any content-side migration is proposed.
- Were any of the seven demo items ever crawled and indexed? If a 【示範】 story URL is in a search index or has a cached social card, unpublishing produces a 404 (src/routes/stories/$slug.tsx:31 throws notFound) with no redirect strategy. Whether a 410/redirect plan is needed is an owner/SEO decision.
- Does production still contain the demo supporter/adopter/donation/adoption_case rows from supabase/seed.sql (the 30000000-*/31000000-*/40000000-*/50000000-* fixed-ID families)? They are queryable via source='demo_seed', but nothing in the repo records whether they were ever applied to or removed from production — unlike the animals, whose retirement is documented.
- Is .env.local pointing at the production project the intended local development setup? It is correctly gitignored (.gitignore:15,19-22) and therefore not a repository defect, but it makes every unguarded env-reading script in scripts/ a production-write path, which materially changes the severity of the import-hkscda-animals.js finding. This is a workstation-configuration question for the owner, not a source fix.


## Phase 1 — Public identity protection and anonymous private-field exposure

Phase 1's hardening landed for the donation and volunteer paths only. public.resolve_public_supporter_identity (supabase/migrations/20260905144848_public_supporter_identity_claims.sql:89-102) resolves identity with "on conflict (email) do nothing", so those two flows can no longer overwrite an existing supporter's name/phone/language/source, and they write only opt_out rows to public.consent while staging unverified opt-ins in the service-role-only supporter_consent_intent table. The sponsorship pledge flow was never migrated: src/lib/sponsorship/submission.server.ts:227-243 still does a raw .upsert({name,email,phone,language,source},{onConflict:"email"}) with the service-role client from an unauthenticated public endpoint, and lines 247-257 insert opt_in consent rows directly, so an unverified public form can both rewrite a stranger's supporter record and flip their prior opt-out. The public animal projection itself IS an explicit allowlist (src/lib/animals/publicProfile.ts:75-95 builds a fixed object and nulls notes/notes_en), but the underlying queries are select("*") against the anon client, and public.animals still carries a role-unrestricted "public read available" SELECT policy plus a table-wide anon SELECT grant with no column-level restriction, so anon can read every column of every available animal (including internal notes/notes_en) straight off the PostgREST Data API. Every other public-submission table (supporter, consent, donation, payment, sponsorship_*, volunteer_registration, adoption_application_*, public_status_token, supporter_consent_intent) has anon explicitly revoked. All of this is source-level evidence only; nothing read here proves these migrations are applied to the deployed database.

### Already addressed at this commit (7)

- **An unverified public submission could overwrite an existing supporter's name/phone/language/source (donation and volunteer paths)**
  - Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:89-102 — insert into public.supporter (...) values (...) on conflict (email) do nothing; returning id; when nothing is returned it re-selects the existing id and returns kind='existing'. No UPDATE path exists, so canonical fields are never touched. src/lib/supporters/publicIdentity.server.ts:41-46 is the only caller shape, and src/lib/donations/supabase.server.ts:14-18 plus src/lib/volunteers/repository.server.ts:262,353-355 route those two flows through it.
- **Unverified public opt-in could flip an existing supporter's opt-out (donation and volunteer paths)**
  - Evidence: src/lib/donations/service.ts:149-156 and src/lib/volunteers/service.ts:211-221 both call buildConsentRows(...).filter((row) => row.status === "opt_out"), so only opt-outs reach public.consent. Requested opt-ins are staged as snapshot columns (donation.consent_email_requested / consent_whatsapp_requested, migration 20260905144848:23-24, 36-38) and materialised into public.supporter_consent_intent by the record_public_consent_intents trigger (migration 20260905144848:109-155).
- **anon could execute the identity resolver or read pending consent evidence**
  - Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:53-55 (supporter_consent_intent: enable RLS, revoke all from public/anon/authenticated, grant select,insert to service_role only) and :106-107 (revoke all on function resolve_public_supporter_identity from public, anon, authenticated; grant execute to service_role). Asserted in src/lib/supporters/publicIdentity.database.test.ts:121-128 via has_function_privilege/has_table_privilege.
- **Public adoption application could overwrite an existing supporter or adopter profile**
  - Evidence: src/lib/adoptions/repository.server.ts:1186-1194 ensurePublicApplicationSupporter = findActiveSupporterByEmail(...) ?? createPublicApplicationSupporter(...) — find-then-insert, no UPDATE. Same shape for the profile at :1231-1240 (findAdopterProfileBySupporterId ?? createAdopterProfile). src/lib/publicAdoption/submission.server.ts writes no supporter or consent rows at all.
- **Public animal projection was a pass-through that leaked internal columns**
  - Evidence: src/lib/animals/publicProfile.ts:75-95 returns a hand-built object listing exactly the public fields, with notes: null and notes_en: null at :85-86; public_profile is re-parsed through a field allowlist plus a URL/email/phone/angle-bracket sanitiser at :11-45. src/lib/animals/publicProfile.test.ts:45-53 asserts notes and notes_en come back null. All three public detail routes (src/routes/animals/cat_.$id.tsx:14, dog_.$id.tsx:14, src/routes/sponsors_.$id.tsx:14) and both listings go through it.
- **The DB accepted arbitrary payloads into animals.public_profile**
  - Evidence: supabase/migrations/20260906181657_animal_public_profile.sql:2-38 adds private.is_valid_animal_public_profile(jsonb) enforcing the same eight-key allowlist, length caps and the no-URL/no-@/no-phone rules as the TS sanitiser, wired as CHECK constraint animals_public_profile_valid; the column COMMENT at :39 states no staff notes/contacts/attachments.
- **anon retained grants on donor-PII and public-submission tables**
  - Evidence: supabase/migrations/20260628130000:31-35 and 20260628140000:18-22 revoke all on supporter, consent, supporter_role, donation, payment from anon; 20260628150000:19-20 revokes anon writes on animals and all on adoption_applications; 20260701185227:145-150 revokes adoption_application_detail/photo/animal_preference/visit_preference/intake_item from anon and public_status_token from anon+authenticated; 20260702130000:70-72 revokes sponsorship_pledge/preference/payment_proof from anon; 20260704165600:233 revokes volunteer_registration from anon+authenticated. I scanned every create-policy block in supabase/migrations/**: apart from animals, the only policies that reach anon are the intentional published-content ones (volunteer_activity status='published', document_assets/site_document_slots/annual_reports is_published=true).

### Open (8)

**[BLOCKER] An unverified public sponsorship pledge overwrites an existing supporter's name, phone, language and source. The public form is the only input; there is no verification of email ownership.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 1
- Evidence: src/lib/sponsorship/submission.server.ts:227-243: await client.from("supporter").upsert({ name: parsed.payload.contact.supporterName, email: parsed.payload.contact.email, phone: parsed.payload.contact.phone, language: parsed.payload.language, source: "sponsorship_pledge_form" }, { onConflict: "email" }).select("id").single(). On email conflict Postgres UPDATEs every listed column. The caller is an unauthenticated POST handler using the service-role client, which bypasses RLS entirely: src/routes/api/sponsorships/pledges.ts:27 (POST), :54 (createSupabaseServiceClient()), :71 (persistSponsorshipPledge). This is exactly what resolve_public_supporter_identity was written to prevent (20260905144848:89-91 'do nothing'), and it violates the invariant the integration test asserts for the other flows (src/lib/supporters/publicIdentity.database.test.ts:103-112 expects name/phone/language/source/tags unchanged after an unverified claim).

**[BLOCKER] An unverified public sponsorship pledge writes an opt_in consent row directly into public.consent, flipping a supporter's prior opt-out. Donations and volunteers were fixed to write only opt_out rows and stage opt-ins as intents; sponsorship was not.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 1
- Evidence: src/lib/sponsorship/submission.server.ts:247-257 calls client.from("consent").insert(buildConsentRows({...})) with NO .filter((row) => row.status === "opt_out") — compare src/lib/donations/service.ts:155 and src/lib/volunteers/service.ts:220 which do filter. buildConsentRows (src/lib/donations/domain.ts:89-95) emits status: consents[channel] ? "opt_in" : "opt_out" for both channels. Effective consent is the latest row per channel: src/lib/adoptions/repository.server.ts:1020-1038 (order timestamp desc then latestConsentByChannel) and src/lib/crm/repository.server.ts:234-238 (same ordering). The current behaviour is locked in by src/lib/sponsorship/submission.server.test.ts:317-343, which asserts the opt_in row is inserted.

**[HIGH] The anon role can read every column of public.animals through the PostgREST Data API, including the internal notes / notes_en columns the application itself treats as non-public. RLS restricts rows, never columns, and no column-level grants exist.**

- File: `supabase/migrations/20260906162436_animal_catalog_membership.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260906162436_animal_catalog_membership.sql:33-34 — CREATE POLICY "public read available" ON public.animals FOR SELECT USING (status='available' AND retired_at IS NULL AND (adoption_eligible OR sponsorship_eligible)) — has no TO clause, so it applies to PUBLIC including anon. supabase/migrations/20260628150000_revoke_residual_anon_write_grants.sql:19 deliberately keeps anon SELECT (revokes only insert/update/delete/truncate/references/trigger), and src/lib/supabaseMigrations.test.ts:200-207 locks that in ("SELECT is intentionally omitted from the animals revoke"). The columns exposed include notes and notes_en (supabase/migrations/20260611162942_create_animals_table.sql:9, src/types/animal.ts:31-32) plus the raw public_profile jsonb. That these are non-public is proven by the app's own projection nulling them: src/lib/animals/publicProfile.ts:85-86. I grepped every migration for column-level grants (grant select ( / revoke select () and for views — there are none, so there is no narrower surface anon is restricted to. The anon key is shipped to browsers (src/lib/supabase.ts:5-17, VITE_SUPABASE_ANON_KEY), so this is directly reachable as GET /rest/v1/animals?select=*.

**[MEDIUM] Public animal reads use select("*") rather than an explicit column allowlist, so every internal column is pulled into the SSR process and any future internal column is automatically in scope for the anon key. The TS projection is the only thing stopping serialisation.**

- File: `src/lib/animals/publicListing.server.ts`
- Phase: Phase 1
- Evidence: src/lib/animals/publicListing.server.ts:16-17 — supabase.from("animals").select("*") using the anon client imported at :2 (import { supabase } from "../supabase"), and src/lib/animals/publicAnimal.functions.ts:21 — supabase.from("animals").select("*").eq("id", data.id). Contrast the correct pattern in the same area: src/lib/animals/eligibility.server.ts:12 selects "id,type,status,adoption_eligible,sponsorship_eligible,retired_at", and src/routes/sitemap[.]xml.ts:48 selects "id,type,adoption_eligible,sponsorship_eligible".

**[MEDIUM] The sponsorship supporter upsert has no deleted_at guard, so an unverified public pledge silently rewrites a soft-deleted (erasure-requested) supporter's canonical fields. Every other write path guards this.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 1
- Evidence: src/lib/sponsorship/submission.server.ts:230-239 has no deleted_at condition. Compare src/lib/adoptions/repository.server.ts:1160-1161 (.eq("email", email).is("deleted_at", null)) and supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:69-72 (on conflict(email) do update ... where supporter.deleted_at is null, then 'if not found then raise manual_gift_supporter_unavailable'). src/lib/supporters/publicIdentity.database.test.ts:82,103-112 establishes that a deleted supporter's canonical row must survive an unverified public claim.

**[MEDIUM] Public adoption supporter resolution is a non-atomic find-then-insert that is blind to soft-deleted rows, so a submission from a soft-deleted supporter's email always 500s, and two concurrent first-time submissions race on the unique index.**

- File: `src/lib/adoptions/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/adoptions/repository.server.ts:1156-1165 findActiveSupporterByEmail filters .is("deleted_at", null), but the uniqueness it races against is unconditional: supabase/migrations/20260623160506_phase_2_donations_mvp.sql:19 — email citext not null unique (I grepped all migrations; there is no partial unique index on supporter). So the miss at :1191 falls through to createPublicApplicationSupporter (:1167-1184), the INSERT raises 23505, and src/lib/api/submit-application.functions.ts:197-218 turns it into a generic "Failed to save application". resolve_public_supporter_identity solves both problems atomically with on conflict do nothing, but the adoption path does not use it.

**[LOW] The database contract cannot currently express a sponsorship submission, so migrating sponsorship onto the safe identity/consent path needs a schema change as well as a code change.**

- File: `supabase/migrations/20260905144848_public_supporter_identity_claims.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:85-87 rejects any source other than 'donation_form' or 'volunteer_registration_form'; :45-46 constrains supporter_consent_intent.source to the same two values and submission_type to ('donation','volunteer_registration'). 'sponsorship_pledge_form' appears nowhere in supabase/migrations/** (grep returns only src/lib/sponsorship/submission.server.ts:236,251).

**[LOW] public.message, public.manual_gift_request and public.donation_delivery_job never revoke Supabase's default anon grants — they rely solely on RLS default-deny, the exact 'single-policy-away landmine' migration 20260628140000 was written to remove.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 1
- Evidence: grep across supabase/migrations/** finds no 'revoke ... on public.message ... from anon' (message only gets 'alter table public.message enable row level security' at 20260623160506:257 and one authenticated-only policy: "staff can read messages" ... for select to authenticated using private.has_admin_role(...)). manual_gift_request and donation_delivery_job (20260905155357:27) grant only to service_role but never revoke anon. The bootstrap-grant problem is documented in the repo itself at supabase/migrations/20260628140000_revoke_residual_anon_grants.sql:4-10 ("Supabase's project bootstrap additionally grants ALL privileges to anon on public tables by default... confirmed live"). Not exploitable today (no anon-applicable policy), so this is surplus privilege rather than an open read.

### Must reuse, not reinvent (8)

- `createPublicIdentityRepository / public.resolve_public_supporter_identity` — `src/lib/supporters/publicIdentity.server.ts (RPC in supabase/migrations/20260905144848_public_supporter_identity_claims.sql:62-107)`: The canonical non-overwriting public identity resolver: normalises name/email/phone, validates language and source, and uses on conflict (email) do nothing so canonical supporter data is never touched. Sponsorship must be moved onto this instead of its own upsert; do not write a second resolver.
- `supporter_consent_intent + record_public_consent_intents trigger` — `supabase/migrations/20260905144848_public_supporter_identity_claims.sql:40-60, 109-155`: The existing staging surface for unverified opt-ins (service_role only, RLS on, unique per submission_type/submission_id/channel). A sponsorship fix should add 'sponsorship_pledge_form'/'sponsorship_pledge' to its source and submission_type CHECKs and add consent_*_requested snapshot columns to sponsorship_pledge, rather than inventing a new table.
- `buildConsentRows + the opt_out-only filter convention` — `src/lib/donations/domain.ts:83-96, used at src/lib/donations/service.ts:149-156 and src/lib/volunteers/service.ts:211-221`: The established rule is that a public form may only ever write opt_out rows to public.consent. Reuse buildConsentRows with the same .filter((row) => row.status === "opt_out") in sponsorship; the helper itself is fine, only the missing filter is the bug.
- `projectPublicAnimal / parsePublicAnimalProfile` — `src/lib/animals/publicProfile.ts:11-95`: The single public-boundary projection for animals (explicit field list, notes nulled, sanitised profile text, birthday-derived age). Any new public animal read must go through it rather than returning rows; keep the shape in sync with private.is_valid_animal_public_profile.
- `private.is_valid_animal_public_profile` — `supabase/migrations/20260906181657_animal_public_profile.sql:2-38`: The DB-side mirror of the public-profile allowlist, already wired as the animals_public_profile_valid CHECK. Extend this function rather than adding a parallel validation if the public field set changes.
- `readEligibleAnimals` — `src/lib/animals/eligibility.server.ts:5-24`: The in-repo example of an explicit column list plus isPublicAnimalMember re-check for animal reads; use this pattern when replacing the select("*") calls in publicListing.server.ts and publicAnimal.functions.ts.
- `supabaseMigrations.test.ts grant/policy assertions` — `src/lib/supabaseMigrations.test.ts (e.g. :139-147, :192-207, :274, :312)`: Where role-grant and RLS-policy invariants are asserted by string-matching migration files. Any anon-grant narrowing on animals must update the assertion at :200-207 that currently pins 'SELECT is intentionally omitted from the animals revoke'.
- `crm_public_identity.sql acceptance fixture + publicIdentity.database.test.ts` — `src/lib/supporters/publicIdentity.database.test.ts:28-128 (SQL at supabase/tests/crm_public_identity.sql)`: The existing real-Postgres harness proving canonical-data preservation, concurrent-claim convergence and anon privilege denial. Extend these cases to cover sponsorship and adoption rather than adding a new fixture; note the suite is skipped unless CRM_TEST_ALLOW_LOCAL_FIXTURES=1.

### Open questions

- Deployment state is unverified: nothing I read proves 20260905144848 (identity RPC, supporter_consent_intent) or 20260906162436 / 20260906181657 (animals policy, public_profile CHECK) are applied to the production database. The only checks in-repo are string matches over migration files (src/lib/supabaseMigrations.test.ts) plus a real-Postgres suite that is skipped unless CRM_TEST_ALLOW_LOCAL_FIXTURES=1 (src/lib/supporters/publicIdentity.database.test.ts:6,28).
- Has anyone confirmed live, via information_schema.role_table_grants, which columns/tables anon actually holds SELECT on today? Migration 20260628140000:4-10 says the bootstrap grant-all to anon was confirmed live once; tables created after it (message, manual_gift_request, donation_delivery_job, content_*, supporter_consent_intent aside) were never re-audited that way.
- Are animals.description / description_en intended to be public unsanitised? projectPublicAnimal passes them straight through (src/lib/animals/publicProfile.ts:83-84) while every public_profile text field is run through the publicText URL/email/phone/angle-bracket filter. If they are staff free-text they deserve the same treatment.
- Is reusing a soft-deleted supporter intentional for sponsorship too? The donation/volunteer contract explicitly accepts it (publicIdentity.database.test.ts:82-112 inserts deleted_at=now() and still resolves to that id, keeping canonical fields), but the adoption path deliberately refuses (deleted_at is null filter) and then hard-fails on the unique index. The three paths currently disagree.
- Should the sponsorship supporter record even be created before payment proof is reviewed, or should it follow the donation pattern of snapshotting contact fields onto the submission row (donation.contact_name/contact_email/contact_phone, migration 20260905144848:18-24) and only touching public.supporter through the RPC?


## Phase 1 — CRM supporter detail reads + manual gift / donation delivery jobs

The supporter detail read is a single fail-fast composition: repository.getSupporterDetail does one PostgREST select on supporter, then the crm_supporter_summary RPC, then a donation select that embeds donation_delivery_job(id,status), then five parallel selects (payment, receipt, consent, message, audit_log), then adoption and volunteer context — and every one of them rethrows on error, so any missing object 500s the whole page and the UI collapses it to a single "Could not load supporter." box with no per-section degradation. The summary half of the baseline failure is genuinely fixed in the deployed DB: the approved production repair 20260906062155 shipped 20260905162615_crm_complete_read_models.sql (crm_read_supporters / crm_supporter_summary / crm_export_donations), per repair-sources.json and proposed-read-repair.sql:1243-1276. The delivery half is not: 20260905155357_crm_manual_gift_delivery_jobs.sql was deliberately excluded from that repair, so donation_delivery_job, manual_gift_request and the three RPCs are still absent, the embed at repository.server.ts:207 still yields PGRST200, and manual gift creation/retry still yield PGRST202 — the detail page fails for exactly this reason today. Worse, applying that migration alone is insufficient: it writes donation.contact_* columns that only 20260905144848 creates (also unapplied and also excluded), and those same columns are read by PAYMENT_WITH_DONATION_SELECT, which gates every receipt and acknowledgement. The SQL itself is sound where it exists — record_manual_gift_with_audit is properly transactional and replay-safe via a reserved request id plus canonical-jsonb digest, and claim_donation_delivery_job is a correct single conditional UPDATE with lease fencing — but there is no backfill or trigger, so historical succeeded payments get no auto-created delivery or receipt jobs, and there is no cron or queue screen, so a job that ends pending or retryable is only ever advanced by a human opening that one supporter, while manualGiftDelivery.http.server.ts:32-40 reports every delivery infrastructure error as the benign status "pending".

### Already addressed at this commit (6)

- **Supporter detail read depended on a missing crm_supporter_summary RPC**
  - Evidence: src/lib/crm/readModel.server.ts:59 calls client.rpc("crm_supporter_summary"). docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json:12-15 recorded public.crm_read_supporters as exists:false on 2026-09-06, but docs/evidence/cms-payment-debug-20260906/production-repair-result.md states migration 20260906062155_cms_payment_read_compatibility_repair was applied to production after explicit approval, and docs/evidence/cms-payment-debug-20260906/repair-sources.json lists 20260905162615_crm_complete_read_models.sql as one of its six sources. proposed-read-repair.sql:1243-1276 contains private.crm_supporter_summary, public.crm_supporter_summary and public.crm_read_supporters verbatim. So the summary/list/export RPC half of the detail read is now satisfied in the deployed DB.
- **Delivery-job metadata was not discoverable after a page refresh (crm-package2 outstanding gate)**
  - Evidence: src/lib/crm/repository.server.ts:44-47 (DonationRow.donation_delivery_job), :121 (mapDonation sets deliveryJob), :207 (embed in the donation select); src/lib/crm/types.ts:51-54 (DonationHistoryRow.deliveryJob); src/components/admin/crm/SupporterDetail.tsx:299-305 renders DonationDeliveryAction for any donation carrying a job; src/components/admin/crm/DonationDeliveryAction.tsx:16-25 posts to /api/admin/donations/delivery/<id>/retry and invalidates ["crm-supporter", supporterId]. The source-level gate listed in docs/evidence/crm-package2/checkpoint.md is closed.
- **Manual gift write was non-transactional / non-idempotent**
  - Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:57-62 reserves the request id with `insert ... on conflict do nothing` then `select ... for update`, compares the sha256 digest of the canonical jsonb payload, and returns the previously recorded donation/payment/deliveryJob with replayed:true. Lines 74-88 put consent, donor role, donation, payment, audit_log and the delivery job in the same function body (one transaction). A concurrent duplicate blocks on the unique index and then replays rather than double-inserting.
- **claim_donation_delivery_job could double-claim a job**
  - Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:101-106 is a single conditional UPDATE (status in pending/retryable with next_attempt_at due, or processing with an expired lease) returning payment_id/attempts; under READ COMMITTED a competing claim re-evaluates the predicate after the row lock is released and gets zero rows. Line 21's check constraint keeps (status='processing') in sync with lease_owner/lease_until, and line 98-100 rejects a null/past/over-10-minute lease. src/lib/donations/deliveryJobs.server.ts:186 maps the empty claim to {kind:"busy"}.
- **Unknown supporter id produced a 500 instead of a 404**
  - Evidence: supabase/migrations/20260905162615_crm_complete_read_models.sql:46-49 — public.crm_supporter_summary is a scalar SQL function whose inner select returns no rows for a missing supporter, so it yields NULL; src/lib/crm/readModel.server.ts:63 returns that as null; src/lib/crm/repository.server.ts:203 returns null; src/lib/crm/http.server.ts:98-100 turns null into a 404 {error:"Supporter not found"}.
- **No receipt path at all for a succeeded gift without a delivery job**
  - Evidence: src/components/admin/crm/SupporterDetail.tsx:150-156 canIssueReceipt (succeeded + receiptRequested + no existing receipt) and :306-318 render an "Issue receipt" button posting to /api/admin/receipts, independent of donation_delivery_job. Historical/legacy succeeded donations therefore have an operator-driven receipt path even though no migration backfills delivery jobs for them.

### Open (15)

**[BLOCKER] Supporter detail read hard-depends on the donation_delivery_job table via a PostgREST embed with no fallback, and that table is still absent from the deployed database. This is the live cause of the failing detail page.**

- File: `src/lib/crm/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/repository.server.ts:207 `.select("*,donation_delivery_job(id,status)")` and :212 `if (donationResult.error) throw donationResult.error;`. The only definition of the table is supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:9-22, which docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json:218-222 records as applied:false and which docs/evidence/cms-payment-debug-20260906/repair-sources.json omits from the six files in the only approved production repair (20260906062155). grep of docs/evidence/cms-payment-debug-20260906/proposed-read-repair.sql returns zero matches for donation_delivery_job. A missing embedded relation yields PGRST200, which this code rethrows.

**[BLOCKER] record_manual_gift_with_audit, claim_donation_delivery_job and retry_donation_delivery_job_with_audit are still absent from the deployed database, so recording a manual gift and retrying a delivery both fail at runtime.**

- File: `src/lib/crm/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/repository.server.ts:360 `client.rpc("record_manual_gift_with_audit", ...)`; src/lib/donations/deliveryJobs.server.ts:53 `client.rpc("claim_donation_delivery_job")` and :101 `client.rpc("retry_donation_delivery_job_with_audit")`. All three are defined only in supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:32, :95, :111 — a file excluded from the applied repair per docs/evidence/cms-payment-debug-20260906/repair-sources.json, and grep of proposed-read-repair.sql returns zero matches for all three names. docs/evidence/cms-payment-debug-20260906/production-repair-result.md closes with 'unrelated identity/manual-gift/volunteer write gaps remain outside this approved scoped repair.'

**[HIGH] Applying 20260905155357 alone will not fix manual gifts: the RPC writes donation.contact_name/contact_email/contact_phone/contact_language, columns created only by the separately unapplied 20260905144848. The whole receipt/acknowledgement path selects the same columns, so a 42703 would break delivery even after the delivery migration lands.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:81-82 inserts into donation(...,contact_name,contact_email,contact_phone,contact_language,...). Those columns are added by supabase/migrations/20260905144848_public_supporter_identity_claims.sql:18-22 (`add column if not exists contact_name text` etc.); grep across supabase/migrations shows no other file defines them. 20260905144848 is applied:false in docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json:210-213 and is not in repair-sources.json. src/lib/donations/reconcile.server.ts:183-184 PAYMENT_WITH_DONATION_SELECT reads all four columns, and it is used by findPaymentById (:208), findPaymentByIdMaybe (:222) and issueReceiptForDonation (:750) — so even the manual 'Issue receipt' fallback on the detail page fails while those columns are absent.

**[HIGH] Nothing ever polls the delivery queue. Jobs only advance during the synchronous HTTP create/retry request, so a job left pending or retryable sits forever unless a staff member happens to open that specific supporter and click retry.**

- File: `src/lib/crm/manualGiftDelivery.composition.server.ts`
- Phase: Phase 1
- Evidence: createDonationDeliveryWorker is constructed in exactly one place, src/lib/crm/manualGiftDelivery.composition.server.ts:14, used only by the POST handlers in src/routes/api/admin/donations/manual.ts:6 and src/routes/api/admin/donations/delivery/$jobId/retry.ts:8. vercel.json contains no `crons` key and there is no scheduler route under src/routes/api. The schema provisions for a poller that does not exist: supabase/migrations/20260905155357:17 next_attempt_at and :28 `create index donation_delivery_due_idx ... where status in ('pending','retryable','processing')`, and src/lib/donations/deliveryJobs.server.ts:193-195 computes an exponential retryAt that nothing reads. grep for 'delivery' across src/components/admin and src/routes/admin returns only the five CRM files, so there is also no stuck-delivery queue screen.

**[HIGH] Delivery infrastructure failures are reported to the operator as the benign status 'pending'. A missing table, revoked grant or stale PostgREST cache is indistinguishable from a queued job, and because nothing polls the queue the gift is silently never delivered.**

- File: `src/lib/crm/manualGiftDelivery.http.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/manualGiftDelivery.http.server.ts:32-40 — `try { const result = await deps.run(jobId); ... } catch { return "pending"; }`. The bare catch swallows every error class from the worker (claim RPC missing, lease constraint violation, storage failure). The response at :52 then returns HTTP 201 with deliveryStatus 'pending'. Same masking on the retry path at :64.

**[MEDIUM] No section isolation in the supporter detail read: every one of the nine sub-queries rethrows, so a single missing DB object takes down donations, payments, receipts, consents, messages, audit, adoption, volunteer and the timeline together, and the page renders one generic error box instead of degrading.**

- File: `src/lib/crm/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/repository.server.ts:212-213 and :251-255 (five consecutive `if (...Result.error) throw ...`); src/lib/crm/adoptionContext.server.ts:167-170 `queryRows` throws on any error and loadSupporterAdoptionContext at :376 awaits six such calls; src/lib/volunteers/repository.server.ts:509 `if (error) throw error`. The exported fallback src/lib/crm/adoptionContext.server.ts:160 `emptySupporterAdoptionContext` is never referenced anywhere in src/ (grep returns only its own definition). Client side, src/components/admin/crm/SupporterDetail.tsx:199-206 collapses any failure into `{copy.loadError}` ('Could not load supporter.').

**[MEDIUM] The API 500 body is a fixed generic string, so schema drift (PGRST200/PGRST202/42703), auth faults and data faults are indistinguishable to an operator; diagnosis requires Vercel log archaeology, which is exactly how the baseline incident had to be found.**

- File: `src/lib/crm/http.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/http.server.ts:58-59 `console.error(error); return jsonResponse({ error: "Could not process CRM request" }, { status: 500 });` — the PostgREST code/message is logged server-side only. src/lib/crm/manualGiftDelivery.http.server.ts:27 does the same with 'Could not process manual gift request'. docs/evidence/cms-payment-debug-20260906/README.md records that the original diagnosis required reading Vercel logs at 20:33Z to recover the PGRST202 detail.

**[MEDIUM] Dead pre-RPC manual-donation path still ships and is still part of the CrmRepository contract, inviting a future caller to bypass the transactional RPC.**

- File: `src/lib/crm/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/crm/service.ts:143-151 createManualDonation now calls only repo.recordManualGift, yet the contract at src/lib/crm/service.ts:49-54 still requires insertManualDonation and completeManualDonationSideEffects, implemented at src/lib/crm/repository.server.ts:378-380 and :382-401 (three separate non-transactional inserts into donation, payment and audit_log). src/lib/crm/manualDonation.ts:4 buildManualDonationRecords is referenced only by service.ts:3/:19 for a type alias. src/lib/crm/http.server.ts:133-144 createManualDonation is mounted by no route: src/routes/api/admin/supporters.ts:19-20 mounts only listSupporters/createSupporter, and src/routes/api/admin/donations/manual.ts:6 uses the delivery composition instead.

**[MEDIUM] After a failed manual-gift submit the dialog keeps the same requestId while letting the operator edit the amount or reference, so the corrected resubmit is rejected as a payload conflict with a raw untranslated English string and no recovery affordance.**

- File: `src/components/admin/crm/ManualDonationDialog.tsx`
- Phase: Phase 1
- Evidence: src/components/admin/crm/ManualDonationDialog.tsx:96 `const requestId = useRef(crypto.randomUUID())`; it is only regenerated inside resetForm (:115-123), which is reached only from the success view's onDone (:199-204). The error branch at :288-289 renders `mutation.error.message` and leaves the form mounted with all fields editable. A changed payload then trips supabase/migrations/20260905155357:59 `raise exception 'manual_gift_payload_conflict'`, which src/lib/crm/repository.server.ts:366-368 maps to HTTP 409 {error:"requestId payload conflict"}; src/lib/admin/session.ts:67-71 surfaces that bare string verbatim, bypassing the localized copy table.

**[MEDIUM] Durable delivery only covers gifts recorded as already-succeeded. A manual gift recorded as pending and later reconciled on the payments screen never gets a delivery job, so its receipt and acknowledgement run inline with no durable retry and no retry button on the supporter detail page.**

- File: `src/lib/donations/reconcile.server.ts`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:87 creates the job only `if p_input->>'paymentStatus'='succeeded'`. The later reconcile path src/lib/donations/reconcile.server.ts:696 reconcileManualPayment -> :709 applySucceededPayment -> :371 completeDonationSideEffects runs receipt+acknowledgement inline and never inserts into donation_delivery_job (grep for donation_delivery_job across src/ matches only deliveryJobs.server.ts, crm/repository.server.ts and tests). Because src/components/admin/crm/SupporterDetail.tsx:299 gates the retry control on `donation.deliveryJob`, such a gift shows no retry control at all.

**[MEDIUM] No migration or trigger backfills delivery jobs for historical succeeded payments, so applying 20260905155357 will not auto-create pending jobs (good: no mass re-send) but also leaves every pre-existing succeeded gift permanently outside the durable delivery/retry surface.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql is 128 lines and contains no INSERT INTO donation_delivery_job SELECT, no `create trigger` and no backfill block; the only insert is the conditional one at :87 inside record_manual_gift_with_audit. Consequently src/lib/crm/repository.server.ts:121 `deliveryJob: row.donation_delivery_job ?? null` yields null for all historical rows and the retry UI is unreachable for them; only the separate manual 'Issue receipt' button (SupporterDetail.tsx:306-318) remains, and that path is itself blocked by the missing contact_* columns described above.

**[LOW] Retry backoff is off by one attempt because the claim RPC returns the post-increment attempt count.**

- File: `src/lib/donations/deliveryJobs.server.ts`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:101-106 — the UPDATE sets `attempts=j.attempts+1` and RETURNING on an UPDATE yields the new row, so a first claim on a fresh job (attempts 0) returns attempts=1. src/lib/donations/deliveryJobs.server.ts:194 then computes `Math.min(60, 2 ** claim.attempts) * 60000`, giving a 2-minute first retry delay instead of the intended 1 minute and capping at 60 minutes one attempt early.

**[LOW] The CRM receiptNeeded flag and filter can never clear: it is true if any donation ever requested a receipt, regardless of donation status or whether the receipt was already issued.**

- File: `supabase/migrations/20260905162615_crm_complete_read_models.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905162615_crm_complete_read_models.sql:40 `coalesce(bool_or(d.receipt_requested),false) receipt` over all donations for the supporter with no status predicate and no join to public.receipt; the same helper backs the list filter at :10-13. This faithfully ports the previous TypeScript behaviour (`git show 4c9cdda:src/lib/crm/repository.server.ts:433 receiptNeeded: donations.some((donation) => donation.receipt_requested)`), so it is a carried-over semantic rather than a regression, but the 'receipt needed' worklist filter is unusable for finding outstanding receipts.

**[LOW] The manual_gift_request idempotency ledger has no retention or cleanup and its rows are never expired.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 1
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:1-8 defines manual_gift_request with created_at but no TTL, no partial index on age and no cleanup function; line 27 grants only select/insert/update to service_role (no delete), so nothing can prune it. Every manual gift attempt, including ones whose transaction later succeeded, leaves a permanent row.

**[LOW] Repository/production migration-ledger drift: the applied production repair has no file in supabase/migrations, so the remaining CRM migration cannot be shipped by a plain `supabase db push` and the repo is not a faithful description of the deployed schema.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 1
- Evidence: docs/evidence/cms-payment-debug-20260906/production-repair-result.md records 'migration history records 20260906062155_cms_payment_read_compatibility_repair', but `ls supabase/migrations/ | grep -c 20260906062155` returns 0. docs/evidence/cms-payment-debug-20260906/repair-proposal.md additionally states the ledger has 18 entries of which only 12 match the 52 repository versions, with 40 repository versions unrecorded and 6 remote-only versions listed in production-schema-preflight.json:240-263. Any Phase 1 remediation must apply 20260905144848 and 20260905155357 as a scoped, guarded one-off, not a bulk replay.

### Must reuse, not reinvent (9)

- `createCrmReadModel` — `src/lib/crm/readModel.server.ts`: Sole boundary for supporter summary/list/export reads; it only speaks RPC (crm_read_supporters, crm_export_donations, crm_supporter_summary) and deliberately never touches PostgREST tables (the test fake at readModel.server.test.ts:16 throws 'Row-capped query forbidden' on .from()). New summary fields belong in the SQL functions, not in a new client query.
- `private.crm_matching_supporters / private.crm_supporter_summary` — `supabase/migrations/20260905162615_crm_complete_read_models.sql`: Canonical filter predicate and summary projection shared by list, export and detail. Any new CRM filter or summary field must extend these two private helpers so list/export/detail stay consistent; they already exist in the deployed DB via the 20260906062155 repair.
- `record_manual_gift_with_audit` — `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`: The only sanctioned manual-gift write path: request-id reservation, payload digest, actor role check, supporter resolve/upsert, consent, donor role, donation, payment, audit and delivery job in one transaction. Do not resurrect the per-table TS inserts in repository.server.ts:382-401.
- `createSupabaseDeliveryJobRepository / createDonationDeliveryWorker / createDonationDeliveryHandler` — `src/lib/donations/deliveryJobs.server.ts`: Complete claim/complete/fail/retry lease machinery and error classification already exist. A background poller must drive these, not write a second worker; DeliveryJobRepository (line 23) is the interface to implement against.
- `retrySucceededDonationSideEffects / issueReceiptIfNeeded / completeDonationSideEffects` — `src/lib/donations/reconcile.server.ts`: Idempotent receipt-number allocator plus acknowledgement dedupe; deliveryJobs.server.ts:129 already routes through it. Any new delivery or backfill path must reuse it so a retry after a PDF/storage crash re-uses the same receipt number.
- `createManualGiftDeliveryComposition` — `src/lib/crm/manualGiftDelivery.composition.server.ts`: Wires service client, delivery repository, worker, CRM service and treasurer auth for both the manual-gift POST and the retry POST. Any new delivery endpoint should extend this composition rather than assemble its own client/worker.
- `assembleSupporterTimeline` — `src/lib/crm/timeline.ts`: Merges donations, payments, receipts, consents, messages, audit, adoption and volunteer into the single ordered timeline the detail page renders (repository.server.ts:279-288). New history sources must be fed through it, not rendered separately.
- `buildConsentRowsForUpdate / latestConsentByChannel` — `src/lib/crm/consent.ts`: Encodes the consent ledger tie-break (timestamp desc, opt_out wins, id desc) that the SQL summary at 20260905162615:37-38 mirrors; changing one without the other silently desynchronises UI and search.
- `fetchAdminJson / AdminApiError` — `src/lib/admin/session.ts`: Single admin fetch boundary with bearer token and structured {error:{code,message,fields}} handling (line 62-72, 81-102). New CRM error envelopes should use the structured object form so the client gets a code instead of a bare English string.

### Open questions

- No read-only production check exists at commit c037cc1. The claim that donation_delivery_job / manual_gift_request / record_manual_gift_with_audit / claim_donation_delivery_job / retry_donation_delivery_job_with_audit are still absent rests on (a) docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json (2026-09-06, applied:false for 20260905155357), (b) repair-sources.json excluding that file from the only approved production repair, and (c) production-repair-result.md's closing sentence that manual-gift write gaps remain outstanding. A fresh service-role metadata query (to_regclass('public.donation_delivery_job'), to_regprocedure('public.record_manual_gift_with_audit(uuid,uuid,jsonb)')) should confirm before any remediation plan is written.
- Do donation.contact_name/contact_email/contact_phone/contact_language exist in production? They are only created by 20260905144848_public_supporter_identity_claims.sql:18-22, which was not in the applied repair. If absent, PAYMENT_WITH_DONATION_SELECT (src/lib/donations/reconcile.server.ts:183-184) fails with 42703 and ALL receipt/acknowledgement/reconcile traffic is broken today — far wider than Phase 1.
- Does PostgREST resolve donation -> donation_delivery_job as one-to-one (object) or one-to-many (array)? The unique constraint on donation_id (migration line 11) should force an object, and src/lib/crm/repository.server.test.ts:321 asserts the object shape against a fake client, but no test exercises the array shape. If it degraded to [], `donation.deliveryJob &&` (SupporterDetail.tsx:299) is truthy for an empty array and DonationDeliveryAction would POST to /api/admin/donations/delivery/undefined/retry.
- The audit baseline phrase 'two supporter detail pages failed' is ambiguous: the repo has exactly one detail route (src/routes/admin/supporters/$id.tsx) plus the list route. Most likely two sampled supporter ids on the same route; worth confirming against the original probe so the fix's acceptance criteria match.
- Is the production migration ledger entry 20260906062155_cms_payment_read_compatibility_repair intended to stay file-less? There is no supabase/migrations/20260906062155*.sql, so `supabase migration list` shows remote-only drift and the remaining CRM migration cannot be shipped by a naive `supabase db push`.


## Phase 3 — Consent states and the role/permission matrix

The consent model is a two-value, append-only ledger: public.consent stores (supporter_id, channel, status, source, timestamp) with a CHECK constraint permitting only 'opt_in' and 'opt_out' for channels 'email' and 'whatsapp' (20260623160506_phase_2_donations_mvp.sql:37-46). 'Unknown' has no representation - it is inferred from row absence and surfaces as a null on SupporterSummary, so it cannot be filtered, exported or distinguished from an explicit refusal. buildConsentRowsForUpdate (src/lib/crm/consent.ts:32-50) correctly writes only the channels present in the update, but the sole caller, ConsentEditor.tsx:60-64, always posts both booleans and derives each from `=== \"opt_in\"`, so every save fabricates an admin-sourced decision for the untouched channel and re-stamps the surviving one with a fresh timestamp and source 'admin_manual' - clobbering the provenance that latestConsentByChannel and private.crm_supporter_summary report as current. Separately, public opt-in ticks land in public.supporter_consent_intent (20260905144848) which nothing in src/ ever reads, so consent captured on the donation and volunteer forms never becomes consent state. The role matrix is exactly three roles - staff, treasurer, admin - over fifteen access areas in src/lib/admin/access.ts:40-72; both audit claims hold: staff lack 'supporters' (line 41-53, pinned by access.test.ts:18) and treasurer lacks 'sponsorshipReview' (line 54, with SPONSORSHIP_REVIEW_ROLES = ['staff','admin'] in sponsorshipAdmin/schemas.ts:63 and matching staff/admin-only RLS on sponsorship_pledge and sponsorship_payment_proof). Sync across layers is manual: one unit test (access.test.ts:92-99) ties sponsorshipReview to its API roles and nothing ties the other fourteen areas; RLS is materially wider than the app for supporter PII and consent, where policies still admit 'staff' and permit in-place UPDATE of ledger rows - behaviour the RLS suite asserts as correct (moneyPii.rls.test.ts:702-780). Admin wording does expose raw codes: SupporterList.tsx:87-91/146-149 prints opt_in/opt_out verbatim and timeline.ts:245-247 renders 'email consent opt_in' plus 'Source: admin_manual' untranslated, even though a correct bilingual map already exists in SupporterProfileSidebar.tsx:31-35. 'legacy_backfill' is a content-revision author kind (20260905150012:412), not consent, and is not shown in any admin UI; 'draft' is properly localised in ContentManagement.tsx:51-55.

### Already addressed at this commit (10)

- **Role matrix, nav filtering and page gating are duplicated ad-hoc across routes**
  - Evidence: src/lib/admin/access.ts:40-72 (ROLE_ACCESS), :74-97 (NAV_ITEM_AREAS), :105-147 (canRoleAccessAdminArea / filterAdminNavItemIdsByRole / canRoleAccessAdminNavItem) is now a single module; src/lib/admin/session.ts:135-144 requireAdminPageAccess is the one gate, and every non-layout admin route calls it (verified: only access-denied.tsx, login.tsx, reset-password.tsx and children of gated layout routes /admin/applications, /admin/content lack their own call). src/components/admin/AdminLayout.tsx:156 filters ADMIN_NAV_ITEMS through canRoleAccessAdminNavItem.
- **UI area and API route roles for sponsorship review can drift silently**
  - Evidence: src/lib/sponsorshipAdmin/schemas.ts:63 exports SPONSORSHIP_REVIEW_ROLES; src/routes/api/admin/sponsorships/pledges/-handlers.ts:19 consumes it (requireAdmin(request,[...SPONSORSHIP_REVIEW_ROLES],client)); src/lib/admin/access.test.ts:92-99 asserts canRoleAccessAdminArea(role,"sponsorshipReview") === SPONSORSHIP_REVIEW_ROLES.includes(role) for all three roles. This one area has a real cross-layer sync assertion.
- **Future-dated consent timestamps could permanently win latest-consent resolution**
  - Evidence: src/lib/crm/schemas.ts:144-155 rejects any timestamp more than 5 minutes in the future, with an inline comment naming the exact attack (a stale opt-in overriding a later genuine opt-out).
- **Opt-in could beat a same-timestamp opt-out depending on row order**
  - Evidence: src/lib/crm/consent.ts:5-10 sorts by timestamp desc, then Number(b.status==="opt_out") - Number(a.status==="opt_out"), then id desc, so opt_out wins ties; supabase/migrations/20260905162615_crm_complete_read_models.sql:37-38 uses the identical ordering (order by c.timestamp desc,(c.status='opt_out') desc,c.id desc) in private.crm_supporter_summary, and :15-17 in the list filter. src/lib/crm/consent.test.ts:89-100 pins the tie behaviour in both input orders.
- **Replayed consent writes append duplicate ledger rows**
  - Evidence: supabase/migrations/20260630120000_donation_lifecycle_integrity.sql:33-43 de-dupes history then creates consent_dedup_unique on (supporter_id, channel, status, source, "timestamp"); src/lib/crm/repository.server.ts:348-357 upserts with onConflict:"supporter_id,channel,status,source,timestamp", ignoreDuplicates:true.
- **Anonymous PostgREST clients could read/write supporter PII and the consent ledger**
  - Evidence: supabase/migrations/20260628130000_harden_role_grants_drop_stale_policy.sql:31-35 revokes select,insert on supporter/consent/supporter_role/donation/payment from anon; 20260628140000_revoke_residual_anon_grants.sql:19 revokes all on public.consent from anon. supabase/rls-tests/moneyPii.rls.test.ts:683-695 proves anon can neither select nor insert consent.
- **RLS policy text was never behaviourally verified**
  - Evidence: supabase/rls-tests/moneyPii.rls.test.ts exercises anon / no-admin-row / staff / treasurer / admin against admin_user, supporter, donation, payment, receipt, consent, recurring_mandate; package.json:12 defines test:rls and .github/workflows/ci.yml:251 runs `bun run test:rls` in CI (not merely skipped locally).
- **Admin role names shown to users as raw codes**
  - Evidence: src/components/admin/access/AccessManagement.tsx:83-87 and :125-129 map staff/treasurer/admin to 職員/司庫/管理員 and Staff/Treasurer/Admin; :88-96 and :130-138 translate audit action codes (admin_user.role_update etc.).
- **Content status 'draft' leaking as a raw code in the content admin**
  - Evidence: src/components/admin/content/ContentManagement.tsx:51-55 maps draft/published/archived to 草稿/已發布/已封存 and :186-187 / :312 render only the mapped label.
- **Manual-gift consent writes could clobber an unspecified channel**
  - Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:76-78 only inserts a consent row when p_input#>>array['consents',v_channel] is not null, and src/components/admin/crm/ManualDonationDialog.tsx:133-143 omits `consents` from the payload entirely, so the manual-gift path never fabricates a channel decision.

### Open (15)

**[BLOCKER] The consent editor cannot express 'unknown' and always writes BOTH channels on every save, fabricating consent decisions the supporter never made and overwriting the provenance of the ones they did**

- File: `src/components/admin/crm/ConsentEditor.tsx`
- Phase: Phase 3
- Evidence: src/components/admin/crm/ConsentEditor.tsx:48-49 initialises two booleans as `emailConsent === "opt_in"` / `whatsappConsent === "opt_in"`, so a null (never-asked) channel is indistinguishable from an explicit opt_out in the UI. Lines 60-64 then unconditionally POST `{source:"admin_manual", email, whatsapp}` - both keys always present. src/lib/crm/consent.ts:32-50 writes a row for every key that is `!== undefined`, so toggling only the email switch also appends a whatsapp row: a previously-null whatsapp becomes a fabricated `opt_out` sourced 'admin_manual', and a genuine `opt_in` obtained from 'donation_form' on 2026-01-01 is re-stamped as source 'admin_manual' with today's timestamp, which is what latestConsentByChannel (consent.ts:4-16) and private.crm_supporter_summary then report as the current consent provenance.

**[BLOCKER] Public opt-in ticks are captured in a write-only table and never become consent state - no code path promotes or even reads them**

- File: `supabase/migrations/20260905144848_public_supporter_identity_claims.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:40-55 creates public.supporter_consent_intent (granted select,insert to service_role only); :128-145 the record_public_consent_intents trigger and :209-231 resolve_public_supporter_identity write into it from the donation form and volunteer registration form. `grep -rn "supporter_consent_intent" src/` returns exactly one hit, src/lib/supporters/publicIdentity.database.test.ts:117, a test. No repository, service, handler, migration or UI reads the table, and private.crm_supporter_summary (20260905162615:37-38) computes emailConsent/whatsappConsent from public.consent only. A donor who ticks 'email me updates' therefore shows as consent 'Not set' to admins forever.

**[BLOCKER] The consent ledger is only append-only in application code; RLS lets staff, treasurer and admin UPDATE ledger rows in place, and the RLS suite asserts this as correct behaviour**

- File: `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`
- Phase: Phase 3
- Evidence: supabase/migrations/20260623160506_phase_2_donations_mvp.sql:301-305 creates `"staff can update consents" on public.consent for update to authenticated using (private.has_admin_role(array['staff','treasurer','admin']))` with no column restriction and no immutability trigger (grep for triggers on public.consent finds only record_public_consent_intents on donation/volunteer_registration). :262 grants select,insert,update,delete on all public tables to authenticated and 20260628130000 deliberately does not revoke it for consent (lines 53-59). supabase/rls-tests/moneyPii.rls.test.ts:702-730 proves staff can flip a row to opt_out, and :749-780 proves treasurer and admin can too, with read-back. So any signed-in admin holding a browser JWT (src/lib/supabase.ts:11-17, anon key + user session) can rewrite a legal consent record's status directly through PostgREST, bypassing buildConsentRowsForUpdate entirely.

**[BLOCKER] RLS is materially wider than the app role matrix for supporter PII and consent: staff are denied the supporters area in UI and API but RLS still admits them**

- File: `src/lib/admin/access.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.ts:41-53 omits "supporters" from the staff set; src/routes/api/admin/supporters.ts:11, supporters/$id.ts:14 and supporters/$id/consents.ts:14 all gate on requireAdmin(request,["treasurer","admin"],client); src/routes/admin/supporters.tsx:11 and supporters/$id.tsx:10 gate on requireAdminPageAccess("supporters"). But supabase/migrations/20260623160506_phase_2_donations_mvp.sql:281-284 ("staff can read supporters"), :287-292 ("staff can update supporters") and :296-305 (consent select+update) all use array['staff','treasurer','admin']. moneyPii.rls.test.ts:340-356 and :702-730 confirm staff really can select and update supporter rows and consent rows. A staff-role browser session can therefore read every supporter's name/email/phone and mutate consent directly against PostgREST, which is exactly what the app layer is trying to prevent.

**[HIGH] 'unknown' is not a representable consent state - the DB constraint permits only opt_in/opt_out, so absence of a row is overloaded to mean both 'never asked' and 'no record'**

- File: `src/lib/crm/types.ts`
- Phase: Phase 3
- Evidence: supabase/migrations/20260623160506_phase_2_donations_mvp.sql:37-46 defines public.consent with `status text not null check (status in ('opt_in','opt_out'))`; src/lib/crm/types.ts:4 mirrors it as `consentStatuses = ["opt_in","opt_out"]`. Source and timestamp ARE per-row (columns source text not null, timestamp timestamptz not null default now(); consent.ts:24-30 populates both). But unknown surfaces only as a null on SupporterSummary.emailConsent/whatsappConsent (types.ts:31-32), and src/lib/crm/schemas.ts:92 (`consentStatus: z.enum(consentStatuses).optional()`) plus 20260905162615:15-18 make it impossible to filter or export the 'never asked' cohort - the SQL filter is an `exists(...)` over consent rows, so a supporter with no rows can never be selected.

**[HIGH] Raw enum codes opt_in / opt_out are rendered verbatim to admins in the supporter list and timeline, in both languages**

- File: `src/components/admin/crm/SupporterList.tsx`
- Phase: Phase 3
- Evidence: src/components/admin/crm/SupporterList.tsx:87-91 renders `{copy.email} {s.emailConsent ?? "-"} / {copy.whatsapp} {s.whatsappConsent ?? "-"}` in the desktop consent column and :146-149 repeats it in the mobile card - the value printed is literally "opt_in"/"opt_out", and unknown collapses to "-". src/lib/crm/timeline.ts:245-247 builds `title: \`${consent.channel} consent ${consent.status}\`` and `description: \`Source: ${consent.source}\``, rendered unchanged by src/components/admin/crm/SupporterTimeline.tsx:100-113 (item.title and item.description are printed as-is); the status pill uses timelineStatus (SupporterTimeline.tsx:69-72) whose map (lines 25-31, 47-53) has no opt_in/opt_out keys, so it falls through to `?? status` and prints the raw code a second time. The same file's audit rows print log.action raw (timeline.ts:261). Contrast SupporterProfileSidebar.tsx:31-35/59-62, which has the correct bilingual map and is not reused.

**[HIGH] Confirmed: treasurers cannot review sponsorship pledges, including the payment proofs that are finance evidence**

- File: `src/lib/admin/access.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.ts:54 - `treasurer: new Set(["payments","supporters"])` - no sponsorshipReview. src/lib/sponsorshipAdmin/schemas.ts:63 `SPONSORSHIP_REVIEW_ROLES = ["staff","admin"]`, consumed at src/routes/api/admin/sponsorships/pledges/-handlers.ts:19. RLS agrees: supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql:74-77, :84-87 and :102-107 gate sponsorship_pledge, sponsorship_payment_proof and the proof storage objects on array['staff','admin']. The exclusion is consistent across all three layers (so it is a role-design decision, not a bypass), but the finance role is locked out of reviewing money evidence, and src/routes/admin/index.tsx:50 additionally makes pledge review reachable only from /admin?section=sponsor - which getAdminAreaForLocation maps to "animals" (access.ts:117-119), an area treasurer also lacks, so there is no route by which a treasurer could ever reach it even if the area were granted.

**[HIGH] Confirmed: staff have no supporters permission, so the operational role cannot see or fix the supporter/consent records their own workflows create**

- File: `src/lib/admin/access.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.ts:41-53 - the staff set lists animals, adoptionCases, manualIntake, coordinatorTasks, adopters, coordinatorReports, volunteerManagement, payments, contentManagement, sponsorshipReview, faqManagement - and omits "supporters" (and coordinatorStatuses, governanceManagement, accessManagement). src/lib/admin/access.test.ts:18 pins this as expected (`canRoleAccessAdminArea("staff","supporters")).toBe(false)`) and :88 pins the nav result (`filterAdminNavItemIdsByRole(itemIds,"treasurer")).toEqual(["payments","supporters"])`). Staff therefore cannot open /admin/supporters or the ConsentEditor at all, so the only people who can correct a consent record are treasurer and admin.

**[HIGH] Only one of the fifteen access areas has an automated UI<->API role-consistency check; the other fourteen can drift silently**

- File: `src/lib/admin/access.test.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.test.ts:92-99 asserts sponsorshipReview against SPONSORSHIP_REVIEW_ROLES. No equivalent exists for the other fourteen AdminAccessArea values (access.ts:15-30). The drift is already visible: area "payments" is granted to staff (access.ts:49) and the list endpoints agree (src/routes/api/admin/payments.ts:16 and finance/activity.ts:15 allow ["staff","treasurer","admin"]), but the write endpoints do not (payments/$id/reconcile.ts:20 and receipts.ts:32 require ["treasurer","admin"]); and src/routes/admin/payment-methods.tsx:10 gates on area "payments" while its API (payment-methods/-handlers.ts:35) allows ["staff","treasurer","admin"] - one coarse area spanning three different role sets, reconciled only by hand-written per-action helpers (src/lib/donations/adminPayments.ts:147-175).

**[MEDIUM] getAdminAreaForLocation is dead code for every path except /admin, has no branch for two live admin routes, and fails open to 'animals' on anything unmapped**

- File: `src/lib/admin/access.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.ts:113-135. The only production caller is src/routes/admin/index.tsx:28, which always passes pathname:"/admin", so the eleven `pathname.startsWith(...)` branches at lines 120-133 are exercised only by src/lib/admin/access.test.ts:42-61. There is no branch for /admin/payment-methods (whose route gates on "payments", src/routes/admin/payment-methods.tsx:10) or /admin/access-denied, and line 134 returns "animals" for any unrecognised path - a fail-open default that silently grants staff and admin while denying treasurer, instead of failing closed. The function reads like a router-wide mapping but duplicates area strings that each route already hardcodes.

**[MEDIUM] Consent write and its audit entry are two separate non-transactional calls, so the ledger can advance with no audit trail**

- File: `src/lib/crm/service.ts`
- Phase: Phase 3
- Evidence: src/lib/crm/service.ts:126-140: `await repo.insertConsentRows(rows)` then `await repo.insertAuditLog({... action:"consent.append" ...})`. If the audit insert fails the consent rows are already committed and there is no compensating delete - the legal record changes with nothing recording who changed it. Compare the manual-gift path, supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:76-87, which does the consent insert and the audit_log insert inside one SECURITY DEFINER function (one transaction).

**[MEDIUM] Behavioural RLS coverage exists for 7 of 69 RLS-enabled tables; the sponsorship tables that carry this phase's role matrix are untested**

- File: `supabase/rls-tests/moneyPii.rls.test.ts`
- Phase: Phase 3
- Evidence: 69 distinct `alter table public.<t> enable row level security` statements across supabase/migrations/; supabase/rls-tests/ contains a single file, moneyPii.rls.test.ts, covering admin_user, supporter, donation, payment, receipt, consent, recurring_mandate (docs/rls-testing.md 'Scope' section states this explicitly). sponsorship_pledge, sponsorship_payment_proof, sponsorship_preference and supporter_consent_intent - the tables that decide who may review money evidence and where public opt-ins land - have no behavioural test. Migration text is not proof that the deployed policies match.

**[MEDIUM] No test asserts that every ADMIN_NAV_ITEMS id has a NAV_ITEM_AREAS entry, so a new nav item silently disappears for all roles**

- File: `src/components/admin/adminNav.test.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/access.ts:137-147 - both filterAdminNavItemIdsByRole and canRoleAccessAdminNavItem return false when NAV_ITEM_AREAS[itemId] is undefined. src/components/admin/adminNav.test.ts asserts active-state routing and bilingual labels for every item (lines 133-140) but never asserts area coverage. The two lists happen to agree today (22 ids in ADMIN_NAV_ITEMS, 22 keys in NAV_ITEM_AREAS), so this is a missing guard rather than a present bug - and the failure mode is a nav item invisible to every role including admin, with no error.

**[LOW] The access-denied redirect passes an area code in the URL that the destination route neither validates nor uses**

- File: `src/lib/admin/session.ts`
- Phase: Phase 3
- Evidence: src/lib/admin/session.ts:138-141 throws `redirect({to:"/admin/access-denied", search:{area}} as never)` - the `as never` cast exists because the route has no matching search schema. src/routes/admin/access-denied.tsx:25-31 declares no validateSearch and the component (lines 41-60) never reads it, so the raw area code (e.g. "sponsorshipReview", "coordinatorStatuses") is shown in the address bar while the page gives an untargeted generic message.

**[LOW] The supporters CSV export emits raw consent codes and collapses unknown to an empty cell**

- File: `src/lib/crm/csv.ts`
- Phase: Phase 3
- Evidence: src/lib/crm/csv.ts:48-49 headers email_consent/whatsapp_consent, :65-66 emit `row.emailConsent` / `row.whatsappConsent` unchanged - literal opt_in/opt_out, and an empty string when null. The export is reachable by treasurer and admin (src/routes/api/admin/exports/supporters[.]csv.ts via createCrmHandlers.exportSupporters, http.server.ts:146-157), so the file handed to finance/marketing distinguishes neither the enum wording nor 'never asked' from 'no value'.

### Must reuse, not reinvent (12)

- `AdminAccessArea / ROLE_ACCESS / canRoleAccessAdminArea` — `src/lib/admin/access.ts`: The single source of truth for which role may open which admin area. Any new admin surface must add an AdminAccessArea here and a NAV_ITEM_AREAS entry (lines 74-97) rather than hardcoding role checks in a component.
- `requireAdminPageAccess(area, queryClient)` — `src/lib/admin/session.ts`: The only correct way to gate an admin route (lines 135-144). It resolves the identity through the shared react-query cache and redirects to /admin/access-denied. Do not re-implement role checks in beforeLoad.
- `requireAdmin(request, allowedRoles, client)` — `src/lib/admin/session.server.ts`: The only API-side role gate (lines 14-24). Every /api/admin route must call it; it also handles pending-invite activation and disabled users.
- `SPONSORSHIP_REVIEW_ROLES + the assertion in src/lib/admin/access.test.ts:92-99` — `src/lib/sponsorshipAdmin/schemas.ts`: The established pattern for keeping an API route's role list and a UI access area in lockstep: export the role tuple once, consume it in -handlers.ts, and assert equality with canRoleAccessAdminArea in access.test.ts. Every other area needs this same treatment - copy it, do not invent a second mechanism.
- `buildConsentRowsForUpdate / latestConsentByChannel` — `src/lib/crm/consent.ts`: buildConsentRowsForUpdate is the append-only ledger row builder and already emits rows only for channels explicitly present in the update - callers must send a partial ConsentUpdate rather than always both channels. latestConsentByChannel is the canonical latest-wins resolver (timestamp desc, opt_out wins ties, id desc).
- `private.crm_supporter_summary / private.crm_matching_supporters` — `supabase/migrations/20260905162615_crm_complete_read_models.sql`: The SQL that computes emailConsent/whatsappConsent (lines 37-38) and the consentChannel/consentStatus filter (lines 15-18). Its ordering must stay byte-for-byte equivalent to latestConsentByChannel; any change to the tiebreak has to be made in both places.
- `private.has_admin_role(text[])` — `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`: The only RLS role predicate (lines 177-190); it also enforces status='active'. New policies must use it rather than querying admin_user inline.
- `insertConsentRows + consent_dedup_unique` — `src/lib/crm/repository.server.ts`: Lines 348-357: the replay-safe write path for the consent ledger (upsert onConflict on the full natural key, ignoreDuplicates). New consent writers must go through it, not a bare insert.
- `RLS behavioural harness (createRoleUser, five-client matrix, read-back assertions)` — `supabase/rls-tests/moneyPii.rls.test.ts`: The fixture-seeding and role-client pattern to copy when extending behavioural RLS coverage to the other 62 RLS-enabled tables. Note the read-back convention: a blocked UPDATE returns error:null with 0 rows, so asserting on error alone is insufficient (see the comment at lines 733-748).
- `PROFILE_COPY.consentStatuses (opt_in/opt_out/none, zh+en)` — `src/components/admin/crm/SupporterProfileSidebar.tsx`: The only existing bilingual consent-status label map (lines 31-35, 59-62) plus consentLabel() at line 128. Extract and reuse it for SupporterList and the timeline instead of adding a third copy.
- `roles / actionLabels copy maps` — `src/components/admin/access/AccessManagement.tsx`: Lines 83-96 and 125-138: the established bilingual label maps for admin role codes and audit action codes. Reuse for any new surface that shows a role or an audit action.
- `canReconcile / canIssueReceipt / canVoidReceipt` — `src/lib/donations/adminPayments.ts`: Lines 147-175: the per-action role predicates used to hide treasurer-only buttons inside the staff-visible payments page. This is the existing answer to 'one coarse area, several API role sets' and should be followed for any new mixed-permission page.

### Open questions

- Is treasurer's exclusion from sponsorshipReview a deliberate product decision (sponsorship review is treated as an adoption/animal workflow, not a finance workflow) or an oversight? It is currently consistent across UI, API and RLS, so changing it is a three-layer change, not a one-line fix.
- Is staff's exclusion from the supporters area deliberate (PII minimisation) or an oversight? If deliberate, the RLS policies on public.supporter and public.consent that still admit 'staff' should be narrowed to match; if accidental, access.ts and the API routes should be widened. The two layers currently disagree and that disagreement is untested.
- Was supporter_consent_intent intended as a durable audit trail only, or as a staging table that some later job promotes into public.consent? Nothing in src/ reads it, so today a public opt-in tick never becomes a consent state.
- Does the deployed database actually match supabase/migrations/? All RLS claims here are read from migration SQL; only the 7 tables covered by moneyPii.rls.test.ts have behavioural proof, and that proof runs against a local stack, not production.
- Should `unknown` become a first-class consent status (a third value in the check constraint plus an explicit 'never asked' row), or stay as row-absence with the UI given a tri-state control? The answer determines whether the fix is a migration or a component change.


## Phase 5 — Calendar views, scheduled jobs, notification outbox

There is exactly one piece of real job infrastructure in the repo: `donation_delivery_job` (table + `claim_donation_delivery_job` / `retry_donation_delivery_job_with_audit` RPCs in supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql) driven by `createDonationDeliveryWorker` in src/lib/donations/deliveryJobs.server.ts. It is a correct, well-tested, leased, idempotent state machine (pending|retryable -> processing -> complete|retryable|attention_required) with an injectable clock and owner, and both of its HTTP entry points are authenticated twice (bearer token + `admin_user` role via `requireAdmin`, then a second role check inside each SECURITY DEFINER RPC). What does not exist is any scheduler: `vercel.json` has no `crons` key, there is no pg_cron/pg_net, no `scripts/` job runner, and no API route that sweeps due work. `next_attempt_at` is written by the worker (deliveryJobs.server.ts:86) and read only by the claim RPC — no application code ever queries for due jobs, so the `donation_delivery_due_idx` index serves a sweeper that was never built. The only trigger is an admin's own HTTP request (POST /api/admin/donations/manual, POST /api/admin/donations/delivery/$jobId/retry), and delivery jobs are only ever created for manual gifts (migration line 87) — webhook/online donations get no durable retry row at all. The `public.message` table is the notification outbox (queued|sent|delivered|failed) but has no dispatcher; every Resend send is inline in the request path across five separate hand-rolled implementations of varying quality. There is no calendar of any kind: `src/components/ui/calendar.tsx` exists but is imported by zero files, `date-fns` is a dependency with zero imports in `src`, and all scheduling UI is native `<input type="datetime-local">`. Timezone handling is display-only `Intl` formatting pinned to Asia/Hong_Kong in 14 files, while every datetime-local parse/serialize path uses the browser's local zone instead.

### Already addressed at this commit (10)

- **No durable, leased, idempotent job model for donation delivery side effects**
  - Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:9-28 creates public.donation_delivery_job with status check ('pending','processing','complete','retryable','attention_required'), attempts, lease_owner, lease_until, next_attempt_at, error_code, plus constraint donation_delivery_lease check ((status='processing') = (lease_owner is not null and lease_until is not null)) and index donation_delivery_due_idx on (status,next_attempt_at). src/lib/donations/deliveryJobs.server.ts:159-203 implements the worker around it.
- **Job claim races / double-processing**
  - Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:95-107 claim_donation_delivery_job does one conditional UPDATE (status in ('pending','retryable') and next_attempt_at<=now(), OR status='processing' and lease_until<=now()) and RETURNs payment_id/attempts only if it won. Lease bounds are validated (line 98: must be >now() and <=now()+10 minutes); the worker requests 5 minutes (deliveryJobs.server.ts:184).
- **A worker that lost its lease can still overwrite a newer worker's result**
  - Evidence: src/lib/donations/deliveryJobs.server.ts:73-75 and 92-94 both guard with .eq("status","processing").eq("lease_owner", owner) and return false when no row matched; src/lib/donations/deliveryJobs.server.test.ts:72 'lost lease cannot report completion or overwrite newer worker'.
- **Job entry points unauthenticated**
  - Evidence: src/lib/crm/manualGiftDelivery.composition.server.ts:20 wires requireTreasurer = requireAdmin(request, ["treasurer","admin"], client); src/lib/admin/session.server.ts:31-54 requires a Bearer token, validates it with client.auth.getUser, and rejects missing/disabled/pending admin_user rows. Both RPCs re-check independently: migration lines 44-46 (manual_gift_forbidden) and 115-117 (delivery_retry_forbidden).
- **No injectable clock in the job/notification layer**
  - Evidence: src/lib/donations/deliveryJobs.server.ts:40 (repository `now = () => new Date()`), :162 and :166 (worker `now?: () => Date`), :164 injectable `owner`; src/lib/donations/notifications.server.ts:30,75 and src/lib/volunteers/notifications.server.ts:12,75 both accept `now`. Test src/lib/donations/deliveryJobs.server.test.ts:108 'lease uses injected clock and distinct owner'.
- **Duplicate donation acknowledgement emails on webhook redelivery**
  - Evidence: supabase/migrations/20260630120000_donation_lifecycle_integrity.sql:26-28 creates partial unique index message_donation_ack_unique on message(supporter_id,(payload->>'donationId')) where kind='donation_acknowledgement'; src/lib/donations/notifications.server.ts:95-149 claims the row BEFORE any external work, treats 23505 as the loss branch, skips sent/delivered, reclaims a stale queued row only after a 5-minute lease, and reclaims a failed row with a guarded failed->queued transition.
- **Duplicate volunteer registration confirmation emails**
  - Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:1-17 pre-checks for existing duplicates then creates message_volunteer_registration_unique; src/lib/volunteers/notifications.server.ts:89-137 mirrors the donation claim/lease/reclaim protocol.
- **Message lease logic silently broken by a stale updated_at**
  - Evidence: supabase/migrations/20260623160506_phase_2_donations_mvp.sql:167-175 defines public.set_updated_at() and lines 218-243 attach a `set_updated_at` BEFORE UPDATE trigger to public.message, so the queued->queued reclaim at notifications.server.ts:121-128 genuinely refreshes the lease.
- **Resend SDK resolving with {error} instead of throwing gets recorded as sent (donation + volunteer + pledge-status paths)**
  - Evidence: src/lib/notifications/provider.server.ts:36-49 createResendMailProvider converts {error} into a typed rejection and classifies permanent vs retryable codes (lines 23-34); src/lib/sponsorshipAdmin/notifications.server.ts:115-122 explicitly checks result.error before marking sent.
- **Scheduled datetimes stored without zone information**
  - Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:6-7 starts_at/ends_at are timestamptz with check (ends_at is null or ends_at >= starts_at); supabase/migrations/20260627110000_coordinator_task_timeline.sql:10 due_at timestamptz; supabase/migrations/20260701185227_public_adoption_journey_phase_1.sql:82 due_at timestamptz not null.

### Open (21)

**[BLOCKER] There is no scheduler of any kind. No Vercel cron, no pg_cron, no job-runner script, no API job route. The only way any queued work ever runs is an admin hitting an HTTP endpoint.**

- File: `vercel.json`
- Phase: Phase 5
- Evidence: vercel.json (full file, 14 lines) contains only $schema/installCommand/buildCommand/git — no "crons" key. `grep -rn "cron" src scripts supabase vercel.json` returns only unrelated hits (brand.acronym). `grep -rn "pg_cron|pg_net" supabase` returns nothing. `find src/routes/api -name "*.ts"` lists no job/worker/cron route. .env.example has no CRON_SECRET/JOB_SECRET.

**[BLOCKER] next_attempt_at backoff is computed and persisted but never acted on. No application code ever queries for due jobs, so a job in 'retryable' waits forever until a human clicks Retry.**

- File: `src/lib/donations/deliveryJobs.server.ts`
- Phase: Phase 5
- Evidence: src/lib/donations/deliveryJobs.server.ts:193-195 computes retryAt = timestamp + min(60, 2**attempts) minutes and :86 writes it to next_attempt_at. `grep -rn "next_attempt_at|nextAttemptAt" src` (excluding tests) returns ONLY deliveryJobs.server.ts:69,86 — both writes. The supporting index donation_delivery_due_idx (migration 20260905155357 line 28) has no reader.

**[BLOCKER] public.message is an outbox with no dispatcher. Rows left in 'queued' (no RESEND_API_KEY) or 'failed' (provider rejection) are never retried or drained by anything.**

- File: `src/lib/donations/notifications.server.ts`
- Phase: Phase 5
- Evidence: `grep -rn 'from("message")' src` (excluding tests) returns 26 hits across 6 files; every one is an insert/update inside a request handler or a per-supporter CRM read (src/lib/crm/repository.server.ts:240). No query selects message rows by status for sending. src/lib/donations/notifications.server.ts:151-154 and src/lib/volunteers/notifications.server.ts:139 return "queued" and leave the row with no follow-up.

**[BLOCKER] The entire delivery-job schema is unverified against any deployed database — it has only ever been applied to a disposable local stack, so donation_delivery_job / claim_donation_delivery_job / retry_donation_delivery_job_with_audit may not exist in production.**

- File: `docs/development-release-proposal.md`
- Phase: Phase 5
- Evidence: docs/development-release-proposal.md line 3 'Status: concrete local candidate; production release NO-GO ... No deployment, production migration, provider activation or cutover was performed.' and the migration section: 'All seven migrations applied successfully to the unique disposable hkscda-completion-20260905 stack (DB55322/API55321)', item 3 being 20260905155357_crm_manual_gift_delivery_jobs.sql. Same doc lists 'approved provider sandbox/end-to-end settlement and delivery' as still open, so Resend delivery is also unproven.

**[HIGH] donation_delivery_job rows are only created for manual gifts. Online/webhook donations have no durable retry row, so their acknowledgement retry depends entirely on the payment provider's redelivery schedule and is permanently stranded once the provider stops retrying.**

- File: `src/lib/donations/reconcile.server.ts`
- Phase: Phase 5
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:87 is the only insert into donation_delivery_job, inside record_manual_gift_with_audit. `grep -rn "donation_delivery_job" src` shows no insert anywhere in application code. src/lib/donations/reconcile.server.ts:321-323 throws "Donation acknowledgement delivery failed" so the webhook event is left unprocessed for provider redelivery — the only retry mechanism for online gifts.

**[HIGH] No calendar view exists at all — not month, week, day, or list. The shadcn Calendar component is dead code and date-fns is an unused dependency.**

- File: `src/components/ui/calendar.tsx`
- Phase: Phase 5
- Evidence: `grep -rn "ui/calendar" src` returns nothing (exit 1) — src/components/ui/calendar.tsx (177 lines, wraps react-day-picker) is imported by zero files. `grep -rn "date-fns" src` returns nothing despite date-fns ^4.1.0 in package.json dependencies. Every other 'Calendar' hit in src is a lucide icon (src/components/admin/adminNav.ts:4,148 CalendarDays on the 義工 nav link). All date entry is native <input type="date"|"datetime-local"> (22 occurrences).

**[HIGH] No date-range query support for scheduled entities. Admin activity listing is offset-paginated and ordered by starts_at desc with only status/type/title filters — a calendar view has no read model to build on.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 5
- Evidence: src/lib/volunteers/repository.server.ts:274-285 listActivities: .order("starts_at",{ascending:false}).range(from, from+pageSize-1) with filters only for input.status, input.type, input.q (ilike on title). No gte/lte on starts_at. The public path (line 269) hardcodes .gte("starts_at", new Date().toISOString()).

**[HIGH] Volunteer activity scheduling parses and displays datetimes in the BROWSER's timezone, not Asia/Hong_Kong, contradicting the Asia/Hong_Kong convention used in 14 other files.**

- File: `src/components/admin/volunteers/VolunteerManagement.tsx`
- Phase: Phase 5
- Evidence: src/components/admin/volunteers/VolunteerManagement.tsx:46-48 `function toIsoFromLocal(value){ return new Date(value).toISOString(); }` applied to the datetime-local value at lines 219-220; :50-52 `formatDateTime` uses toLocaleString("zh-HK", {dateStyle,timeStyle}) with NO timeZone option. An admin in a non-HK zone creates an activity at the wrong instant. Compare src/components/admin/adoptions/taskPanelLogic.ts:71-76 which pins timeZone: "Asia/Hong_Kong".

**[HIGH] sendPledgeConfirmationEmail ignores the Resend result object, so an API-level rejection (bad key, rate limit, invalid recipient) is recorded as status='sent'.**

- File: `src/lib/sponsorship/submission.server.ts`
- Phase: Phase 5
- Evidence: src/lib/sponsorship/submission.server.ts:397 `await emails.send({...});` with no capture of the return value; only a thrown exception is caught at :404. Line 412 then unconditionally sets status:"sent". The sibling file src/lib/sponsorshipAdmin/notifications.server.ts:115-122 documents and fixes exactly this ('Resend's SDK resolves with { error } ... instead of throwing') — the fix was never applied here.

**[HIGH] sendAdoptionConfirmationEmail has the identical ignored-result bug — a rejected send is recorded as 'sent'.**

- File: `src/lib/publicAdoption/submission.server.ts`
- Phase: Phase 5
- Evidence: src/lib/publicAdoption/submission.server.ts:437-443 `await emails.send({ from, to, replyTo, subject, html });` discards the result; catch at :444 only handles throws; :450-453 unconditionally updates status:"sent", sent_at. No MailProvider abstraction, no idempotencyKey.

**[HIGH] sendPledgeStatusUpdateEmail treats every 23505 as 'skipped' with no status inspection, so a pledge status email stuck in 'queued' or left 'failed' can never be resent — the unique index permanently blocks retry.**

- File: `src/lib/sponsorshipAdmin/notifications.server.ts`
- Phase: Phase 5
- Evidence: src/lib/sponsorshipAdmin/notifications.server.ts:92-96: `if ((messageError as {code?:string}).code === "23505") return "skipped";` — no findMessage/status check, no stale-lease reclaim, no failed->queued transition. Contrast src/lib/donations/notifications.server.ts:106-146 which inspects the existing row and reclaims stale-queued and failed rows.

**[HIGH] Only 3 of the 5+ message kinds have a uniqueness guard. sponsorship_pledge_confirmation and adoption_confirmation have no partial unique index, so a retried submission sends duplicate emails and writes duplicate outbox rows.**

- File: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Phase: Phase 5
- Evidence: `grep -rn "create unique index" supabase/migrations/*.sql | grep -i message` returns exactly three: message_donation_ack_unique (20260630120000:26), message_pledge_status_update_unique (20260829180000:355), message_volunteer_registration_unique (20260905144848:15). Neither src/lib/sponsorship/submission.server.ts:377-386 nor src/lib/publicAdoption/submission.server.ts:417-426 relies on any conflict — both treat any insert error as a plain failure (:387-390 / :427-430).

**[HIGH] No operator queue or alerting for stuck delivery jobs. A job in 'attention_required', 'retryable', or orphaned 'processing' is visible only by opening the one supporter's CRM profile.**

- File: `src/lib/crm/repository.server.ts`
- Phase: Phase 5
- Evidence: src/lib/crm/repository.server.ts:207 `.select("*,donation_delivery_job(id,status)")` scoped by `.eq("supporter_id", id)` is the only read of the table outside the worker. There is no /api/admin/donations/delivery list route (see the full src/routes/api listing) and no admin nav entry for a delivery queue (src/components/admin/adminNav.ts).

**[HIGH] The HTTP layer swallows every worker/store error and reports it to the operator as 'pending', which — with no sweeper — is indistinguishable from silent permanent loss.**

- File: `src/lib/crm/manualGiftDelivery.http.server.ts`
- Phase: Phase 5
- Evidence: src/lib/crm/manualGiftDelivery.http.server.ts:31-40: `catch { /* The durable job already exists; a transient worker/store error must not undo the gift response. */ return "pending"; }`. The comment's premise (a durable job that something will pick up) is false because nothing sweeps pending jobs.

**[MEDIUM] Coordinator task panel displays due/scheduled times in Asia/Hong_Kong but renders the edit field in browser-local time — the same value shows two different wall-clock times in read vs edit mode.**

- File: `src/components/admin/adoptions/taskPanelLogic.ts`
- Phase: Phase 5
- Evidence: src/components/admin/adoptions/taskPanelLogic.ts:71-76 taskDateTimeFormatter pins timeZone "Asia/Hong_Kong" and is used by formatTaskDateTime (:129-143), while isoToDatetimeLocal (:108-117) computes `date.getTime() - date.getTimezoneOffset()*60000` (browser zone) and datetimeLocalToIso (:119-127) does `new Date(value).toISOString()` (browser zone). Round-trip is instant-preserving but the two renderings disagree for any non-HK admin.

**[MEDIUM] Three notification senders bypass the MailProvider abstraction and send raw through the Resend SDK with no idempotencyKey, so provider-side dedup is lost on any retry.**

- File: `src/lib/sponsorshipAdmin/notifications.server.ts`
- Phase: Phase 5
- Evidence: src/lib/sponsorshipAdmin/notifications.server.ts:26-29 `return new Resend(apiKey).emails;` and :108-114 send() with no idempotencyKey; src/lib/sponsorship/submission.server.ts:397-403 same; src/lib/publicAdoption/submission.server.ts:437-443 same. Compare src/lib/donations/notifications.server.ts:174 `idempotencyKey: \`donation-acknowledgement-${input.donationId}\`` and src/lib/volunteers/notifications.server.ts:147.

**[MEDIUM] Non-injectable clocks in the notification/scheduling paths, breaking the repo-wide `now?: () => Date` convention and making time-dependent behaviour untestable.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 5
- Evidence: src/lib/sponsorshipAdmin/notifications.server.ts:131 `sent_at: new Date().toISOString()`; src/lib/sponsorship/submission.server.ts:412 same; src/lib/publicAdoption/submission.server.ts:452 same; src/lib/volunteers/repository.server.ts:269 `.gte("starts_at", new Date().toISOString())` inside listPublishedActivities. None of these four accept a `now` dependency.

**[MEDIUM] No attempt cap and no dead-letter state. attempts increments without bound and the admin retry RPC resets status but not attempts, so each manual retry starts from an ever-larger backoff.**

- File: `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`
- Phase: Phase 5
- Evidence: supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql:102 `attempts=j.attempts+1` with only `check (attempts >= 0)` at line 14 — no max. Line 118 retry_donation_delivery_job_with_audit sets status/next_attempt_at/error_code/lease_* but leaves attempts untouched. src/lib/donations/deliveryJobs.server.ts:194 `Math.min(60, 2 ** claim.attempts)` therefore saturates at the 60-minute cap permanently.

**[MEDIUM] Heavy side effects (receipt PDF generation + storage upload + Resend send) run inline inside the admin's POST request with no serverless timeout budget configured. A timeout strands the job in 'processing' until its 5-minute lease expires, recoverable only by a human.**

- File: `src/routes/api/admin/donations/manual.ts`
- Phase: Phase 5
- Evidence: src/lib/crm/manualGiftDelivery.composition.server.ts:16 `deliver: createDonationDeliveryHandler(client)` -> src/lib/donations/deliveryJobs.server.ts:129 retrySucceededDonationSideEffects -> src/lib/donations/reconcile.server.ts:299-324 completeDonationSideEffects (issueReceiptIfNeeded + sendDonationAcknowledgement), invoked synchronously from the route at src/routes/api/admin/donations/manual.ts:6. vercel.json has no "functions" block and therefore no maxDuration override.

**[MEDIUM] A second, parallel notification model (recipient_notification_draft) exists that is manual copy-paste only and never reaches the message outbox or any provider — two unreconciled notification systems.**

- File: `src/lib/content/types.ts`
- Phase: Phase 5
- Evidence: src/lib/content/types.ts:38 `notificationDraftStatuses = ["draft","copied","sent_manually","dismissed"]`; src/lib/content/repository.server.ts:1074 inserts into recipient_notification_draft; the only mutation route is PATCH /api/admin/content/notification-drafts/$id (status update). No code path moves a draft into public.message or calls a MailProvider.

**[MEDIUM] Notification drafts are generated for every adopter contact without consulting the consent ledger.**

- File: `src/lib/content/repository.server.ts`
- Phase: Phase 5
- Evidence: src/lib/content/repository.server.ts:599-621 buildRecipient composes name/email/phone from supporter and adoption_case rows with no consent lookup; `grep -n "consent|opt_in|opt_out" src/lib/content/repository.server.ts` returns zero hits, while public.consent (supporter_id, channel, status) is the ledger used elsewhere (e.g. migration 20260905155357 lines 75-80).

### Must reuse, not reinvent (10)

- `createDonationDeliveryWorker / createSupabaseDeliveryJobRepository / DonationDeliveryError` — `src/lib/donations/deliveryJobs.server.ts`: The only correct job state machine in the repo: claim-with-lease, injectable now() and owner(), exponential backoff capped at 60 min, retryable vs attention_required classification, owner-guarded complete/fail. Any new scheduled job (calendar reminders, outbox dispatch) must be built on this worker shape and its DeliveryJobRepository interface (lines 23-37), not a new one. Its test suite (deliveryJobs.server.test.ts, 13 cases incl. busy/lost-lease/crash-after-PDF) is the contract.
- `claim_donation_delivery_job(uuid,uuid,timestamptz)` — `supabase/migrations/20260905155357_crm_manual_gift_delivery_jobs.sql`: Lines 95-107: the atomic single-UPDATE claim that already implements due-time gating (next_attempt_at<=now()) and expired-lease stealing (status='processing' and lease_until<=now()), plus lease-bound validation (<=10 min). A sweeper should select due ids from donation_delivery_due_idx and then call THIS function per job rather than inventing new claim SQL. Note it claims by explicit job id — a batch/next-due variant is the missing piece, not a replacement.
- `createResendMailProvider / MailProvider / ProviderResult` — `src/lib/notifications/provider.server.ts`: The single place that normalizes Resend's resolve-with-{error} behaviour into {kind:'rejected', code, retryable} and classifies permanent codes (permanentRejectionCodes, lines 23-34). The three senders that bypass it (sponsorship submission, sponsorshipAdmin, publicAdoption submission) are exactly where the ignored-result bugs live; any outbox dispatcher must go through this interface.
- `sendDonationAcknowledgement claim/lease/reclaim protocol` — `src/lib/donations/notifications.server.ts`: Lines 88-149 are the reference implementation of outbox idempotency: insert the message row BEFORE external work, rely on a partial unique index for the 23505 loss branch, skip sent/delivered, reclaim stale-queued only after ACKNOWLEDGEMENT_RETRY_LEASE_MS, and reclaim failed with a guarded transition. Copy this, do not re-derive it. src/lib/volunteers/notifications.server.ts:89-137 is the already-existing second instance.
- `public.message table + set_updated_at trigger + partial unique indexes` — `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`: Lines 131-141 define the outbox (status queued|sent|delivered|failed, jsonb payload, sent_at); lines 218-243 attach the set_updated_at trigger that makes the updated_at-based lease sound. New message kinds MUST add a partial unique index on (payload->>'<key>') where kind='...' following the three existing ones, or they get duplicate sends.
- `requireAdmin / getAdminUserFromRequest` — `src/lib/admin/session.server.ts`: Lines 14-24 / 26-54: the only authentication gate for admin API routes (Bearer token -> auth.getUser -> admin_user role/status). Any job-trigger or calendar API route must use it, and any SECURITY DEFINER job RPC must additionally re-check admin_user the way migration 20260905155357 lines 44-46 and 115-117 do.
- `The `now?: () => Date` dependency convention` — `src/lib/crm/service.ts`: Line 62/69 (`createCrmService({ repo, now = () => new Date() })`) is the house pattern, used in ~20 modules (adoptions/service.ts:164,206; content/service.ts:110,211; documents/service.ts:78,114; donations/service.ts:97,139; etc.). There is NO shared clock module — new scheduling code should follow this convention rather than introduce one, or introduce one and migrate all of them deliberately.
- `taskDateTimeFormatter (Intl.DateTimeFormat pinned to Asia/Hong_Kong)` — `src/components/admin/adoptions/taskPanelLogic.ts`: Lines 71-76 plus formatTaskDateTime (:129-143) is the closest thing to a canonical HK-time renderer; the same timeZone:'Asia/Hong_Kong' literal is repeated in 13 other files (adminPageCopy.ts:1087, AccessManagement.tsx:149, publicImpact.ts, publicProfile.ts, ...). A calendar view should extract and reuse one formatter plus a proper HK-anchored datetime-local parse/serialize pair — the parse side (isoToDatetimeLocal/datetimeLocalToIso, :108-127) is browser-zone and must NOT be copied as-is.
- `createManualGiftDeliveryComposition` — `src/lib/crm/manualGiftDelivery.composition.server.ts`: Lines 11-26 show the established composition-root shape for wiring a service client + job repository + worker + handlers behind a route. A cron/sweeper entry point should follow the same composition pattern and reuse this exact wiring rather than instantiating a second worker.
- `public.volunteer_activity indexes (status, starts_at) and (type, starts_at)` — `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`: Lines 59 and 62 already index the columns a month/week/day calendar range query needs; a calendar read model should add gte/lte on starts_at to listActivities (src/lib/volunteers/repository.server.ts:274-285) and use these indexes rather than adding new ones.

### Open questions

- Which platform is intended to host the scheduler? vercel.json has no crons and there is no pg_cron/pg_net extension in any migration, so the decision (Vercel Cron + a bearer-secret route, Supabase pg_cron + pg_net, or an external runner) is unmade. This determines whether a new job entry point needs a CRON_SECRET-style env var added to .env.example and the environmentContract test.
- Is public.message intended to become the single outbox, or is recipient_notification_draft (manual copy-paste, statuses draft/copied/sent_manually/dismissed) a deliberate second track? The two models are currently unreconciled and nothing moves a draft into message.
- Should online/webhook donations get donation_delivery_job rows too? Today only record_manual_gift_with_audit creates them (migration line 87), so the durable retry surface exists for the rarest payment path and not the common one.
- What is the intended calendar subject — volunteer_activity (starts_at/ends_at), adoption_followup.due_at, adoption_intake_item.due_at, or all three on one surface? No read model aggregates them and adminNav has no calendar entry.
- Confirm against the real deployed database whether donation_delivery_job, claim_donation_delivery_job and retry_donation_delivery_job_with_audit actually exist. docs/development-release-proposal.md states these migrations were applied only to a disposable local stack and that no production migration was performed, so every claim about job behaviour in production is source-only.
- Is RESEND_API_KEY actually set in the deployed environment? Both notification paths silently return 'queued' and never send when it is absent (donations/notifications.server.ts:151-154, volunteers/notifications.server.ts:139), and the release doc lists provider activation as an unresolved external gate — so 'queued' rows could be accumulating with no dispatcher to drain them.
- What is the Vercel function maxDuration for these routes? Manual-gift creation runs PDF generation, storage upload and an email send inline; vercel.json sets no functions config, so the effective limit and the resulting orphaned-'processing' risk are unknown.


## Phase 4 — Volunteer rules engine (tiers, credentials, terms, sessions, capacity, attendance)

What exists at c037cc1 is a single-activity sign-up module, not a volunteer rules engine. The data model is exactly two tables — `public.volunteer_activity` and `public.volunteer_registration` (supabase/migrations/20260704165600_volunteer_activity_management_v1.sql) — plus consent columns and an 18-arg RPC wrapper added by 20260905144848, and three atomic-write RPCs added by 20260905163900. There is no VolunteerProfile entity (volunteer identity is a single row in `supporter_role` with role='volunteer'), no tier concept of any kind (`新手義工`/`恆常義工`/`資深義工` appear nowhere in the repository), no course/credential entity, no versioned volunteer terms or acceptance evidence (the public form collects only marketing email/WhatsApp consent), no session templates or role quotas, no daily-20 limit, no waitlist queue/promotion/hold, and no attendance ledger — attendance is two mutable columns (`attendance_status`, `volunteer_hours`) on the registration row with no history. Capacity is literally one integer: `capacity integer not null check (capacity > 0)`, consumed by summing `participant_count` over `status='approved'`. The concurrency story is the one genuinely solid part: `create_volunteer_registration`, `set_volunteer_registration_status_with_audit` and `update_volunteer_activity_with_audit` all take `pg_advisory_xact_lock(hashtextextended(activity_id,0))` first, then the activity row `for update`, then the registration row — a consistent lock order with optimistic-concurrency (`expectedUpdatedAt`) on the staff paths. Against that, the attendance path and the activity create/clone paths bypass all of it, and the TypeScript rules engine in `src/lib/volunteers/rules.ts` is computed and then thrown away by the repository, so two divergent copies of the decision logic exist with only the SQL one actually deciding anything.

### Already addressed at this commit (7)

- **Concurrent registration/approval could overbook capacity — no lock ordering or transactional guard**
  - Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:97-106 — `create_volunteer_registration` does `perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text, 0));` then `select * into v_activity from public.volunteer_activity where id = p_activity_id for update;` before summing approved participants. supabase/migrations/20260905163900_volunteer_atomic_approval.sql:8-14 — `set_volunteer_registration_status_with_audit` takes the SAME advisory lock on the activity first, then the activity row `for update`, then the registration row `for update`, and re-sums `participant_count` under the lock before allowing 'approved' (`if v_used+v_registration.participant_count>v_activity.capacity then return jsonb_build_object('kind','capacity_full')`). The file's own header comment states the ordering rule: "Staff status transitions use the public-submission activity lock before any row locks." `update_volunteer_activity_with_audit` (same file, lines 26-30) follows the identical order.
- **Staff status/activity edits had no optimistic concurrency and could clobber a concurrent change**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:12 and :31 compare `v_registration.updated_at<>p_expected_updated_at` / `v_activity.updated_at<>p_expected_updated_at` and return `{'kind':'conflict'}`; src/lib/volunteers/repository.server.ts:236-256 (`requireUpdated`) maps `conflict`/`capacity_full` to HTTP 409 and `not_found` to 404 with `cache-control: no-store`; src/lib/volunteers/repository.server.test.ts:29-60 asserts no follow-up write or hydration happens after a conflict.
- **Status update wrote its audit_log row in a second PostgREST call that could fail after the mutation committed**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:17 — the `insert into public.audit_log(...) values(p_actor_user_id,'volunteer_registration.status_update',...)` happens inside the same function/transaction as the `update public.volunteer_registration`. Same pattern at line 39 for `volunteer_activity.update`.
- **Capacity counters were computed from a row-limited PostgREST read and could under-count**
  - Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:44-51 defines `public.volunteer_activity_counts(uuid[])` returning per-activity approved/pending/waitlisted sums; src/lib/volunteers/repository.server.ts:176-200 (`loadActivityCounts`) calls that RPC instead of paging registration rows. The migration comments it: "Counts used for refreshed capacity are complete even beyond the API row limit."
- **Public volunteer registration endpoint had no abuse controls**
  - Evidence: src/routes/api/volunteer/registrations.ts:20-35 enforces `enforceRateLimit(ip, { prefix: "volunteer", max: 5, window: "1 m" })` returning 429 with `retry-after`; src/routes/api/volunteer/-handlers.ts:27-33 wires `verifyPublicRegistration` to `verifyTurnstile(...)`, and src/lib/volunteers/http.server.ts:84-87 returns 403 when it fails.
- **Confirmation email could be sent twice for one registration**
  - Evidence: supabase/migrations/20260905144848_public_supporter_identity_claims.sql:15-17 creates `message_volunteer_registration_unique` on `(payload ->> 'registrationId')` where kind = 'volunteer_registration_confirmation'; src/lib/volunteers/notifications.server.ts:88-135 claims the row by insert, treats 23505 as "already claimed", and re-claims only after a 5-minute `DELIVERY_LEASE_MS` lease expires.
- **Marketing consent was written as an opt-in on submission rather than as a recorded request**
  - Evidence: src/lib/volunteers/service.ts:206-217 only persists `buildConsentRows(...).filter((row) => row.status === "opt_out")`; the opt-in request lands in `public.supporter_consent_intent` (supabase/migrations/20260905144848_public_supporter_identity_claims.sql:40-52, `requested_status text not null default 'opt_in' check (requested_status = 'opt_in')`) via the wrapper RPC at lines 208-230 and the `record_public_consent_intents` trigger at lines 154-156.

### Open (23)

**[BLOCKER] No VolunteerProfile entity exists. A volunteer is only a `supporter_role` row, and the link from a registration to a supporter is nullable and severable.**

- File: `supabase/migrations/20260623160506_phase_2_donations_mvp.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260623160506_phase_2_donations_mvp.sql:29-35 — `create table if not exists public.supporter_role (supporter_id uuid ..., role text not null check (role in ('donor','adopter','volunteer','foster')), primary key (supporter_id, role))`. That is the entire volunteer identity model; src/lib/volunteers/repository.server.ts:357-363 `ensureSupporterRole` just upserts `{supporter_id, role}`. There is no table, column or type holding join date, tier, credentials, terms acceptance, or cumulative attendance. supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:26 — `supporter_id uuid references public.supporter(id) on delete set null`, so deleting a supporter orphans their entire service history.

**[BLOCKER] The three tiers 新手義工 / 恆常義工 / 資深義工 are not modelled anywhere — no column, no table, no enum, no evaluator, no monthly assessment job.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: Repo-wide ripgrep for `新手義工|恆常義工|資深義工` over all tracked files returns "No matches found". Ripgrep for `volunteer_tier|volunteer_profile` over supabase/migrations returns nothing. The only `tier` identifiers in src/ are sponsorship amounts (src/components/site/sponsorship/PledgeWizard.tsx:77 `const tiers: MonthlyTier[] = ["100","300","500","custom"]`). Consequently none of the confirmed rules exist: no cumulative-verified-attendance counter, no ≥10 promotion trigger, no per-month attendance check, no 2-year anniversary evaluation, no reminder generation.

**[BLOCKER] No course-completion credential entity. The evening-session training gate and its required verbatim Chinese refusal string do not exist in source.**

- File: `src/routes/volunteer.tsx`
- Phase: Phase 4
- Evidence: No table in supabase/migrations/ holds a credential, certification or course completion (grep for `credential|training|course` over supabase/migrations returns only unrelated `adoption_rules_care_topics.sql`). The required product string 「本時段僅限已修畢社教化訓練班之義工報名」 appears nowhere in src/. The only training reference in the whole volunteer surface is static marketing prose: src/routes/volunteer.tsx:514 — `"完成基本培訓後，即可開始義工服務。協會會為所有義工提供持續支援及指導。"` — which promises a training step the system cannot record or enforce.

**[BLOCKER] Volunteer terms are not versioned and no acceptance evidence is captured. The public form collects only marketing consent.**

- File: `src/lib/volunteers/schemas.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/schemas.ts:111-114 — the only consent block in `publicRegistrationSchema` is `consents: z.object({ email: z.boolean().default(false), whatsapp: z.boolean().default(false) })`. src/routes/volunteer.tsx:102-103 and :434-450 render exactly two checkboxes (`volunteer-email-consent`, `volunteer-whatsapp-consent`) — there is no terms checkbox, defaulted-unchecked or otherwise, and `emailConsent` in fact defaults to `true`. `public.volunteer_registration` (supabase/migrations/20260704165600:24-48 plus the two consent columns added at 20260905144848:36-38) has no terms_version, content hash, acceptance timestamp or source column. `supporter_consent_intent` is constrained to marketing channels only: `channel text not null check (channel in ('email','whatsapp'))` (20260905144848:44).

**[BLOCKER] Activity capacity is a single integer. There are no session templates, no role quotas, no separate visitor/volunteer counts, no protected core seats, and no minimum-staffing concept.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:11 — `capacity integer not null check (capacity > 0)`. The entire capacity rule is `p_participant_count > greatest(0, v_activity.capacity - v_approved_participants)` (same file, line 159) where `v_approved_participants` is `sum(participant_count)` over `status='approved'` (lines 153-157). `registration_modes text[] ... check (registration_modes <@ array['individual','group'])` (line 15) is the only role-ish field and it is a mode, not a quota. Ripgrep over src/ for `role_quota|roleQuota|session_template|sessionTemplate|policy_version|policyVersion` returns "No files found". None of Morning A / Morning B / Afternoon / Evening caps (max 9, strict 12 with 6 experienced reserved, max 3, strict 8) can be expressed.

**[BLOCKER] No daily-20 limit of any kind, in either counting interpretation.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: Ripgrep over src/ for `daily_limit|dailyLimit` returns "No files found"; no migration in supabase/migrations/ contains a per-date constraint or per-person-per-day aggregate. The only quantity checked at registration time is the single activity's capacity (supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:153-162). A volunteer may be approved for an unlimited number of same-day activities.

**[BLOCKER] The waitlist is a dead terminal status: no queue position, no seat hold, no expiry, and nothing ever promotes a waitlisted registration when a seat frees up.**

- File: `src/lib/volunteers/rules.ts`
- Phase: Phase 4
- Evidence: `status ... check (status in ('pending','approved','waitlisted','rejected','cancelled'))` (supabase/migrations/20260704165600:28) is the whole mechanism — the table has no position, hold, hold_expires_at or promoted_at column. supabase/migrations/20260704165600:160-162 assigns `'waitlisted'` on overflow and nothing reads it back. A repo-wide grep for `waitlist` across src/lib/volunteers/, src/components/admin/volunteers/ and src/components/site/volunteer/ yields only enum members, labels (`waitlisted: "候補中"`, volunteerAdminLogic.ts:39), counters and the `allow_waitlist` flag — zero promotion logic. Cancelling an approved registration silently reopens a seat that no waitlisted person is offered.

**[BLOCKER] No attendance ledger. Attendance is two mutable, overwritable columns on the registration row, with no per-session record, no verification state, and no correction history.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:29 `attendance_status text not null default 'not_marked' check (attendance_status in ('not_marked','attended','completed','no_show'))` and line 42 `volunteer_hours numeric(6,2)`. There is no `volunteer_attendance` table (ripgrep `attendance_ledger|attendanceLedger` over src/ → "No files found"). Because attendance lives on the registration row and one registration may cover N participants (`participant_count`), a group of 12 produces exactly one attendance fact, so no per-person cumulative attendance — the input every tier rule needs — can ever be derived.

**[BLOCKER] Every admin volunteer surface depends on three RPCs added by the most recent volunteer migration, which the baseline record flags as possibly unapplied to the deployed database. If so, listing activities fails outright, not just admin writes.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 1
- Evidence: src/lib/volunteers/repository.server.ts:176-186 calls `volunteer_activity_counts` from `loadActivityCounts`, which is on the path of `listPublishedActivities` (:262-271), `listActivities` (:273-291), `getActivity` (:213-222) and `hydrateRegistrations` (:224-240) — i.e. the anonymous public activity list too, with `if (error) throw error`. :312-321 calls `update_volunteer_activity_with_audit`; :454-462 calls `set_volunteer_registration_status_with_audit`. All three are defined only in supabase/migrations/20260905163900_volunteer_atomic_approval.sql, which docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md §5 names as one of four migrations present in source whose database objects the audit observed to be absent, concluding "migrations not applied to the deployed Supabase project". That deployment state was NOT independently verified here — this is a source-level dependency claim plus the recorded drift finding, not a verified production fact.

**[HIGH] The TypeScript rules engine's decision is computed and then silently discarded; the SQL function re-decides with different rules, so two divergent copies of the rule set exist and only the untested one runs in production.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/service.ts:223-234 computes `const decision = decideVolunteerRegistrationStatus({activity, draft: input, now: now()})` and passes `status: decision.status, statusReason: decision.reason` into `repo.createRegistration`. src/lib/volunteers/repository.server.ts:374-395 then builds the RPC argument list and never passes `input.status` or `input.statusReason` — the RPC has no such parameters (supabase/migrations/20260905144848:157-175). The DB recomputes at supabase/migrations/20260704165600:129-170 with a materially different age rule: SQL uses only `v_activity.min_age`, while rules.ts:44-47 uses `Math.max(PUBLIC_INDIVIDUAL_MIN_AGE, activity.minAge ?? 0)` with `PUBLIC_INDIVIDUAL_MIN_AGE = 21` (types.ts:21). Conversely SQL has two branches TS lacks (`registration_mode`/organisation/participant_count manual-review fallbacks, lines 138-148). The divergence is invisible to the suite because src/lib/volunteers/service.test.ts uses a fake repo that honours the TS decision (see the `resolves.toMatchObject({status:"approved"})` assertion at line 176).

**[HIGH] Marking attendance destroys any recorded volunteer hours, and the admin UI provides no way to enter hours in the first place.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/schemas.ts:88 — `volunteerHours: numberFromInput(z.number().min(0).max(24)).nullable().optional().default(null)`, so an omitted field parses to `null` (not `undefined`). src/lib/volunteers/repository.server.ts:470-480 writes `volunteer_hours: input.volunteerHours` unconditionally, so `null` is sent and the column is cleared. Both admin call sites send only the status: src/components/admin/volunteers/VolunteerManagement.tsx:277-280 `body: JSON.stringify({ attendanceStatus: "completed" })` and src/components/admin/volunteers/VolunteerRegistrationDetail.tsx:36-41 `body: JSON.stringify({ attendanceStatus })`. Grepping src/components and src/routes for `volunteerHours|義工時數` finds only the read-only display at VolunteerRegistrationDetail.tsx:97, so hours can never be set through the UI and any hours set by other means are wiped on the next attendance click.

**[HIGH] The attendance write path bypasses every guarantee the approval path has: no optimistic concurrency, no activity lock, and a non-atomic audit row written after the mutation commits.**

- File: `src/lib/volunteers/repository.server.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/repository.server.ts:470-484 is a bare `client.from("volunteer_registration").update({...}).eq("id", ...)` — unlike `updateRegistrationStatus` at :454-469 it calls no `*_with_audit` RPC, passes no `expectedUpdatedAt`, and takes no advisory lock. src/lib/volunteers/schemas.ts:86-90 (`adminAttendanceUpdateSchema`) has no `expectedUpdatedAt` field at all, unlike `adminRegistrationStatusSchema` at :80-84. The audit row is a separate PostgREST insert afterwards: src/lib/volunteers/service.ts:308-313. AGENTS.md states this exact rule ("Write that row inside a `*_with_audit` RPC, not as a second PostgREST call"), and src/lib/adminRouteAuditing.test.ts:9 scopes its enforcement to `["animals","animal_profile_internal","animal_match"]` only, so nothing catches this.

**[HIGH] No uniqueness constraint prevents the same supporter registering repeatedly for the same activity; each duplicate consumes capacity.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:63-74 creates only non-unique indexes (`volunteer_registration_activity_status_idx`, `volunteer_registration_supporter_idx`, `volunteer_registration_status_created_idx`); the only `unique` in the table is `status_token_hash text not null unique` (line 44). `create_volunteer_registration` (lines 76-215) performs no duplicate check. Since `resolve_public_supporter_identity` dedupes supporters by email (20260905144848:89-101), one person submitting the form N times produces N registrations against the same supporter and consumes N seats.

**[MEDIUM] Activity create and clone also write their audit rows non-atomically over the service-role connection.**

- File: `src/lib/volunteers/service.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/repository.server.ts:302-310 (`createActivity`) and :322-355 (`cloneActivity`) are plain `.insert(...)` calls; the matching `repo.insertAuditLog` calls happen afterwards in src/lib/volunteers/service.ts:147-155 and :173-181. If the audit insert fails, the activity exists unaudited and the caller sees a 500. Contrast `updateActivity` (repository.server.ts:312-321) which correctly routes through `update_volunteer_activity_with_audit`.

**[MEDIUM] The server does not enforce the attendance rule the UI enforces: attendance can be marked on an activity that has not started yet.**

- File: `src/lib/volunteers/rules.ts`
- Phase: Phase 4
- Evidence: src/components/admin/volunteers/volunteerAdminLogic.ts:104-117 (`canMarkAttendance`) requires `startsAt.getTime() <= now().getTime()` and documents why ("Marking attendance on a pending or future booking records something that did not happen"). The server-side check, src/lib/volunteers/rules.ts:72-79 (`validateAttendanceTransition`), only checks `registrationStatus !== "approved"` and never looks at the activity start time. A direct PATCH to /api/admin/volunteers/registrations/:id/attendance marks a future session attended.

**[MEDIUM] Every staff status transition overwrites `status_reason` with the literal 'manual_review', destroying the original decision reason, and approval does not re-check that the activity is still published and in the future.**

- File: `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260905163900_volunteer_atomic_approval.sql:16 — `update public.volunteer_registration set status=p_status,status_reason='manual_review',...`. A row that was `waitlisted/capacity_full` or `pending/guardian_details_required` loses that provenance the moment staff touch it. The same function checks only capacity before allowing `'approved'` (line 15); it never tests `v_activity.status='published'` or `v_activity.starts_at > now()`, both of which the creation path does check (20260704165600:134-136), so staff can approve into a `cancelled`, `closed` or already-past activity.

**[MEDIUM] The registration detail screen ignores the transition-gating and label helpers written for it, rendering raw English enum values as buttons and offering every transition unconditionally.**

- File: `src/components/admin/volunteers/VolunteerRegistrationDetail.tsx`
- Phase: Phase 4
- Evidence: src/components/admin/volunteers/VolunteerRegistrationDetail.tsx:106-127 maps over the literal arrays `["approved","waitlisted","rejected","cancelled"]` and `["attended","completed","no_show"]` and renders `{status}` / `{attendanceStatus}` as the button text. It imports `registrationStatusLabels` and `attendanceStatusLabels` (lines 6-10) and uses them for display at :72 and :78, but not on the buttons. It never calls `availableRegistrationTransitions`, `isDestructiveTransition` or `canMarkAttendance` — the exact regression src/components/admin/volunteers/volunteerAdminLogic.ts:67-90 documents as already fixed ("The old UI rendered all three buttons unconditionally"). It also offers `cancelled`, which `availableRegistrationTransitions` never returns for any state.

**[MEDIUM] The registrant confirmation email interpolates the raw English database status into Chinese copy, and no email is ever sent when staff subsequently change the status.**

- File: `src/lib/volunteers/notifications.server.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/notifications.server.ts:41-44 — `subject: \`HKSCDA 義工登記 ${registration.status}\`` and `<p>目前狀態：<strong>${escapeHtml(registration.status)}</strong></p>`, producing "HKSCDA 義工登記 waitlisted" / 「目前狀態：pending」. The Chinese labels needed already exist at src/components/admin/volunteers/volunteerAdminLogic.ts:36-42. Separately, src/lib/volunteers/service.ts:277-293 (`updateRegistrationStatus`) sends no notification at all, so an approved or rejected volunteer is never told — they must revisit the status-token URL.

**[MEDIUM] Group enquiry admin updates have no optimistic concurrency and write audit non-atomically; the domain also has no http.server.ts, with handlers living in the route file.**

- File: `src/lib/groupEnquiries/repository.server.ts`
- Phase: Phase 4
- Evidence: src/lib/groupEnquiries/repository.server.ts:181-190 — bare `.update(toUpdate(input)).eq("id", id)` with no `expectedUpdatedAt`; src/lib/groupEnquiries/service.ts:96-105 writes the audit row in a separate `repo.insertAuditLog` call after `repo.update` has already committed. src/lib/groupEnquiries/schemas.ts has no expectedUpdatedAt field. Layering: src/lib/groupEnquiries/http.ts is 5 lines of constants, and `createAdminGroupEnquiryHandlers` is defined inline in src/routes/api/admin/volunteers/group-enquiries.ts:66-115, contrary to the documented route -> -handlers.ts -> lib/<domain>/http.server.ts chain.

**[MEDIUM] Group enquiries and group volunteer registrations are two unlinked intake paths; group enquiries never reach a supporter record.**

- File: `supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql:1-25 — `public.group_enquiries` has `contact_email citext not null` but no `supporter_id` column and no FK to `public.supporter`, unlike `volunteer_registration.supporter_id`. src/lib/groupEnquiries/service.ts:76-82 (`submitPublicEnquiry`) never calls `resolvePublicIdentity` or `ensureSupporterRole`, so a school that enquires and later registers a group appears as two unrelated records with no shared identity.

**[LOW] The staff-read RLS policies on both volunteer tables are inert: table privileges are revoked from `authenticated` in the same migration that creates policies `to authenticated`.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:230-232 — `revoke all on public.volunteer_activity from authenticated; revoke all on public.volunteer_registration from anon, authenticated; revoke all on public.volunteer_registration from authenticated;` — followed at lines 241-252 by `create policy "staff can read volunteer activities" ... to authenticated using (private.has_admin_role(array['staff','admin']))` and the equivalent for registrations. RLS policies cannot grant privileges, so these two policies can never be exercised. No later migration re-grants (grep for `grant` on these tables across supabase/migrations/ finds only the service_role and anon grants in this same file). Harmless today because admin reads go through the service-role API, but it is dead security surface that misrepresents the access model.

**[LOW] `public_status_token.entity_type` was widened to accept 'volunteer_registration' but nothing ever writes a volunteer row there — volunteer tokens live on the registration row instead, diverging from the adoption and sponsorship patterns.**

- File: `supabase/migrations/20260704165600_volunteer_activity_management_v1.sql`
- Phase: Phase 4
- Evidence: supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:257-261 adds `check (entity_type in ('adoption_application','sponsorship_pledge','volunteer_registration'))`. Grepping src/ for `public_status_token` yields writers only in src/lib/publicAdoption/submission.server.ts:302 and src/lib/sponsorship/submission.server.ts:298 — never volunteers. Volunteers store `status_token_hash text not null unique` / `status_token_expires_at` directly on `volunteer_registration` (same migration, lines 44-45), read back at src/lib/volunteers/repository.server.ts:441-452, so the shared token table's revocation and expiry handling does not apply to them.

**[LOW] The anonymous activities endpoint exposes internal moderation configuration and pending/waitlist counts.**

- File: `src/lib/volunteers/http.server.ts`
- Phase: Phase 4
- Evidence: src/lib/volunteers/http.server.ts:78-82 returns `service.listPublishedActivities()` unfiltered, and src/lib/volunteers/repository.server.ts:80-104 (`toActivity`) builds the full `VolunteerActivitySummary`, which per src/lib/volunteers/types.ts:32-42 and :64-74 includes `autoApprove`, `minAge`, `underagePolicy`, `pendingParticipants` and `waitlistedParticipants`. Any anonymous caller of GET /api/volunteer/activities learns which activities auto-approve and how many applications are queued.

### Must reuse, not reinvent (10)

- `pg_advisory_xact_lock(hashtextextended(activity_id::text, 0)) -> activity FOR UPDATE -> registration FOR UPDATE` — `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`: This is the established lock order for every seat-moving operation, and the create RPC (20260704165600:97-106) already follows it. Waitlist promotion, seat holds, the 48-hour release job, daily-20 checks and role-quota checks must acquire the SAME advisory lock on the activity first, or they will deadlock against the existing three functions.
- `set_volunteer_registration_status_with_audit / update_volunteer_activity_with_audit` — `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`: The canonical `*_with_audit` shape: actor authorisation via `public.admin_user ... status='active' and role in ('staff','admin')`, `p_expected_updated_at` optimistic concurrency returning `{'kind':'conflict'}`, capacity revalidation under lock, and the audit_log insert inside the same transaction. New tier/credential/terms/attendance writes must extend or copy this rather than adding PostgREST updates plus a follow-up audit insert.
- `requireUpdated` — `src/lib/volunteers/repository.server.ts`: Lines 236-256 map RPC result kinds (`not_found` -> 404, `conflict`/`capacity_full` -> 409) into a `Response` with a Chinese operator message and `cache-control: no-store`. Any new rule outcome (policy_unresolved, tier_ineligible, credential_required, daily_limit_reached) should be added here so error shape and caching stay consistent; src/lib/volunteers/errorContract.test.ts guards this contract.
- `volunteer_activity_counts(uuid[])` — `supabase/migrations/20260905163900_volunteer_atomic_approval.sql`: Already aggregates approved/pending/waitlisted participant sums server-side to avoid the PostgREST row limit. Role-quota and visitor-vs-volunteer counters belong as additional `filter (where ...)` aggregates in this function, not as extra round trips from `hydrateActivities`.
- `resolve_public_supporter_identity(jsonb) + createPublicIdentityRepository` — `supabase/migrations/20260905144848_public_supporter_identity_claims.sql`: The email-keyed, non-destructive supporter upsert (lines 62-104) used by src/lib/volunteers/repository.server.ts:352-355. A VolunteerProfile must hang off the supporter id this returns; do not introduce a second identity resolution path, and note `source` is constrained to `('donation_form','volunteer_registration_form')` so any new entry point needs that check widened.
- `supporter_consent_intent + record_public_consent_intents trigger` — `supabase/migrations/20260905144848_public_supporter_identity_claims.sql`: Lines 40-52 and 110-156 establish the "requested, not granted" consent pattern with a `unique (submission_type, submission_id, channel)` idempotency key. Volunteer terms acceptance is a DIFFERENT concept (it must be immutable evidence with a version and content hash) and must not be folded into this table, whose check constrains channel to email/whatsapp and requested_status to 'opt_in' — but the immutability/idempotency shape is the right model to copy.
- `decideVolunteerRegistrationStatus / validateAttendanceTransition` — `src/lib/volunteers/rules.ts`: The single intended pure-rules entry point (service.ts:223) and the place the master plan's "no separate entry point may decide a rule independently" requirement should land. Before adding tiers/credentials/daily limits, resolve the fact that its output is currently discarded by repository.server.ts:374-395 — either make the RPC accept the decided status or delete the TS copy; adding a third divergent copy would be worse.
- `availableRegistrationTransitions / isDestructiveTransition / canMarkAttendance / registrationStatusLabels / attendanceStatusLabels` — `src/components/admin/volunteers/volunteerAdminLogic.ts`: Lines 36-117 already encode transition gating, destructive-action styling, the Chinese operator vocabulary and the started-activity attendance rule, and are covered by volunteerAdminLogic.test.ts. VolunteerRegistrationDetail.tsx must consume these instead of its inline English arrays, and the server-side attendance rule should be lifted from `canMarkAttendance` into rules.ts rather than reimplemented.
- `createVolunteerHandlers + createHandlers dependency wiring` — `src/lib/volunteers/http.server.ts`: The handler factory takes `requireVolunteerAdmin`, `service` and `verifyPublicRegistration` as arguments (lines 13-17), which is what lets the public wiring hard-fail admin access (`src/routes/api/volunteer/-handlers.ts:24-26` throws 403) while the admin wiring injects `requireAdmin(request, ['staff','admin'], client)`. New volunteer endpoints (session listing, terms acceptance, credential admin) must be added to this factory, not written inline in route files the way group enquiries were.
- `enforceRateLimit + verifyTurnstile pairing` — `src/routes/api/volunteer/registrations.ts`: Lines 20-35 plus src/routes/api/volunteer/-handlers.ts:27-33 are the established public-write abuse gate (5/min per IP, then Turnstile, then the handler). Any new public volunteer endpoint (terms acceptance, waitlist opt-in, cancellation by token) must reuse this exact pairing.

### Open questions

- docs/superpowers/specs/hkscda-volunteer-policy-decisions.md exists in the working tree but is UNTRACKED (`git status --porcelain` shows `?? docs/superpowers/specs/hkscda-volunteer-policy-decisions.md`; `git log` on the path is empty) and is therefore NOT part of the audit baseline c037cc1 — it appears to have been created by a concurrent session sharing this worktree. I used it only to identify what the plan requires. Its 'Consolidated activation blockers' table asserts that "D06's total-12 invariant is CONFIRMED and enforced today" — that is false against the code at c037cc1, where no session-capacity concept exists at all. Confirm which document is authoritative before treating any of its status lines as implementation state.
- The working tree is NOT clean at the time of this audit: 24 modified tracked files (content/stories/admin-content surfaces and supabase/migrations/20260705120000_story_promotion_center.sql) plus 2 untracked paths, from another session. No file under src/lib/volunteers/, src/lib/groupEnquiries/, src/components/admin/volunteers/ or the volunteer routes/migrations is modified, so every finding above is read against the committed c037cc1 content — but re-check `git status` before committing anything here.
- Whether supabase/migrations/20260905163900_volunteer_atomic_approval.sql and 20260905144848_public_supporter_identity_claims.sql are actually applied to the deployed Supabase project (ref iihqjzilgawhfdhdevam) was not verified — this session made no database connection. If the 18-argument `create_volunteer_registration` overload from 20260905144848 is missing, every public volunteer registration fails at PostgREST function resolution, since src/lib/volunteers/repository.server.ts:374-395 passes p_consent_email_requested/p_consent_whatsapp_requested which the original 16-argument signature does not accept. Resolve this before any Phase 4 work is scoped as 'additive'.
- The public age floor of 21 (PUBLIC_INDIVIDUAL_MIN_AGE, types.ts:21) is enforced only by the Zod superRefine in schemas.ts:148-158, which produces a 400 'Invalid volunteer registration request' rather than a recorded rejected registration. The rules.ts branch that would produce `{status:'rejected', reason:'minimum_age_not_met'}` for an under-21 individual (rules.ts:49-51) is therefore unreachable in production, and the SQL function has no 21-year rule. Confirm whether under-21 individual applications should be rejected-with-record (auditable, notifiable) or refused at the form boundary before building the tier/credential gates on top of the same decision path.
- The activity type vocabulary is `('volunteer_shift','group_activity','cleaning_day')` (20260704165600:3) and the public page advertises six unrelated role categories in hardcoded JSX (src/routes/volunteer.tsx:20-46: 暫托家庭/貓舍義工/狗舍義工/TNR義工/領養日義工/專業義工). Neither vocabulary maps to the plan's four sessions (Morning A/B, Afternoon, Evening). Whether the existing `volunteer_activity` rows are migrated into session templates or superseded by a new table determines whether Phase 4 is additive or a data migration.
- Whether existing `volunteer_registration` rows carry any usable attendance history for seeding tiers. `attendance_status` is per-registration, not per-person, and a group registration with participant_count=12 yields one row — so cumulative per-person attendance cannot be reconstructed from current data. Confirm that tiers start from zero for everyone (the policy doc's D04 says 'do not bulk-recalculate historical tiers'), because there is no alternative.


## Repository gates, CI and test infrastructure

At c037cc1 the repository has a single workflow (.github/workflows/ci.yml) with five jobs: `verify` (install → typecheck → `bun test --isolate` → lint → build → routeTree parity) and four dependent jobs — `brand-verify` (blocking), plus `a11y-verify`, `rls-matrix` and `performance-verify`, all three still `continue-on-error: true`. I measured the suite myself on this checkout: 1969 pass / 86 skip / 0 fail, 6020 expect() calls, 2055 tests across 322 tracked test files in 74.6s — which matches the repo's own baseline record in docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md, and contradicts CLAUDE.md/AGENTS.md, which still claim "~1090 tests, ~193 files, a few seconds". I then ran the seven database-backed files in isolation and proved that **all 86 skips come from exactly those files** (40 RLS + 18 CRM manual gift + 4 public identity + 1 content read + 17 CMS lifecycle + 5 media lifecycle + 1 reconciliation), so every test that touches a real Postgres is inert in the blocking gate. Only `rls-matrix` runs any of them in CI, and it is non-blocking and starts an unpinned `bunx supabase` CLI that is absent from package.json and bun.lock. The two structural guards do real work but are pure string/regex scans of SQL and source text (`readFileSync`, no database): supabaseMigrations.test.ts enforces pinned `search_path` on every `security definer` function and ties authenticated-write grants to a hand-maintained audited/exempt table list; adminRouteAuditing.test.ts requires any server-side file that mutates animals/animal_profile_internal/animal_match to write an audit_log row, and pins the two animal admin routes to their `*_with_audit` RPCs.

### Already addressed at this commit (6)

- **Audit gap #4: "success paths skip upload of performance/a11y artifacts. Retain machine-readable baseline results on success so regressions can be compared."**
  - Evidence: .github/workflows/ci.yml:143-149, :222-228, :331-337 — all three `Upload ... artefacts` steps now carry `if: always()` with `if-no-files-found: ignore`, so brand/a11y/performance artefacts are uploaded on success as well as failure. scripts/verify-public-brand.mjs:84-96 additionally stamps every retained JSON with a `measurementContext` (schemaVersion, commit from `git rev-parse HEAD`, worktreeDirty, fixtureId, fixtureSha256 of scripts/ci/supabase-fixture.mjs, baseURL, mode), and :677-694 always writes `run-context.json` in a `finally` block — machine-readable and comparable across runs.
- **brand-verify was masked as success by continue-on-error, so a real brand failure could not fail CI**
  - Evidence: .github/workflows/ci.yml:57-66 — the job comment records the promotion ("continue-on-error is removed so a real failure here is reported as a real failure, not masked as success") and the `brand-verify:` job at :63-67 has `needs: verify` and `timeout-minutes: 20` with no `continue-on-error` key, unlike a11y-verify (:158), rls-matrix (:237) and performance-verify (:267).
- **Stale committed routeTree.gen.ts could ship routes that existed but were not registered (the PR #60 defect)**
  - Evidence: .github/workflows/ci.yml:54-55 — `- name: Route tree is current` / `run: git diff --exit-code -- src/routeTree.gen.ts`, placed immediately after the build step that regenerates it.
- **Bun toolchain drift could turn PRs red with no repository change**
  - Evidence: .github/workflows/ci.yml:19-27 — `oven-sh/setup-bun@v2` with `bun-version: 1.3.14` pinned in all five jobs (:25-27, :70-72, :162-164, :241-243, :272-274), with an explicit rationale comment. Matches bunfig.toml:1-3 `minimumReleaseAge = 86400`.
- **Plain whole-file `includes("audit_log")` in the admin-route audit guard passed on an explanatory comment, so it could not fail for the regression it existed to catch**
  - Evidence: src/lib/adminRouteAuditing.test.ts:60-72 — `writesAuditLog()` now requires `queryChains(source, "audit_log").some((chain) => chain.includes(".insert("))`, and :41-52 `queryChains()` cuts each `.from("<table>")` chain at the next `.from(` so table name and mutation method can no longer be matched independently across a whole file.
- **The `security definer` / `search_path` scan anchored on a line that was exactly "security definer", silently skipping the inline `language sql security definer as $$` form**
  - Evidence: src/lib/supabaseMigrations.test.ts:434-462 — now iterates `sql.matchAll(/create\s+(?:or\s+replace\s+)?function\b([\s\S]*?)\bas\s+\$/gi)` over the whole create-function header and accepts either `public, pg_temp` or `''`, reporting `${fileName}:${line}` on failure. Attribute order is explicitly handled.

### Open (25)

**[BLOCKER] Every database-backed test in the repository is skipped by the blocking gate. I measured this directly: `bun test --isolate` on this checkout gives 1969 pass / 86 skip / 0 fail, and running only the seven DB-dependent files gives 1 pass / 86 skip — i.e. 100% of the suite's skips are the database tests, and the only test that runs in those files is a pure URL-validation unit test.**

- File: `.github/workflows/ci.yml`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: Per-file measured skips: supabase/rls-tests/moneyPii.rls.test.ts 0 pass/40 skip; src/lib/crm/manualGift.database.test.ts 1 pass/18 skip; src/lib/supporters/publicIdentity.database.test.ts 0/4; src/lib/content/lifecycle.integration.test.ts 0/17; src/lib/content/mediaLifecycle.integration.test.ts 0/5; src/lib/content/contentRead.integration.test.ts 0/1; scripts/content-media-reconciliation-local.integration.test.ts 0/1. Sum = 86. Gate is .github/workflows/ci.yml:37-38 `- name: Test` / `run: bun test --isolate`.

**[BLOCKER] No CI job sets the env vars the CRM and CMS database suites require, so 46 of the 86 skipped tests never execute in any automated context at all. Grep across the whole repo finds CRM_TEST_ALLOW_LOCAL_FIXTURES only in scripts/verify-crm-authenticated.mjs, the two test files themselves, and docs/evidence/* — never in .github/workflows/ci.yml.**

- File: `src/lib/content/lifecycle.integration.test.ts`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: src/lib/crm/manualGift.database.test.ts:25-28 requires `CRM_TEST_ALLOW_LOCAL_FIXTURES === "1" && CRM_TEST_DATABASE_URL`; src/lib/supporters/publicIdentity.database.test.ts:5-8 additionally hard-requires the exact string `postgresql://postgres:postgres@127.0.0.1:55322/postgres`; src/lib/content/lifecycle.integration.test.ts:13-14 and contentRead.integration.test.ts:3-16 require `CMS_LIFECYCLE_TEST_DATABASE_URL` + `CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES=1`; mediaLifecycle.integration.test.ts:15-32 also needs `CMS_MEDIA_TEST_URL` + `CMS_MEDIA_TEST_SERVICE_ROLE_KEY`; scripts/content-media-reconciliation-local.integration.test.ts:6 needs `CONTENT_MEDIA_RECONCILIATION_LOCAL_TEST=1` and :37-43 reads the git-ignored file `supabase/.temp/completion-local/start.raw.log`. None of these names appear anywhere in .github/workflows/ci.yml (54 migrations, 5 jobs, 337 lines read in full).

**[BLOCKER] The only CI job that applies migrations to a real Postgres is still non-blocking, so nothing blocking proves a new migration even replays on a fresh database. This is the audit's gap #3, unchanged at c037cc1.**

- File: `.github/workflows/ci.yml`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: .github/workflows/ci.yml:237 `continue-on-error: true` on `rls-matrix`, whose steps are :247-248 `bunx supabase start` (which applies every migration — supabase/config.toml:58-60 `[db.migrations] enabled = true`) and :250-251 `bun run test:rls`. a11y-verify carries the same flag at :158 and performance-verify at :267. docs/superpowers/audits/2026-09-05-hkscda-current-status.md:232 recorded this as an open gap and it is still open.

**[HIGH] The rls-matrix job resolves the Supabase CLI at run time from npm with no pinned version, directly contradicting the deliberate Bun pin two jobs above it. `supabase` is in neither package.json nor bun.lock, so `bunx` fetches whatever is latest that hour.**

- File: `.github/workflows/ci.yml`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: .github/workflows/ci.yml:248 `run: bunx supabase start` and :255 `run: bunx supabase stop`. `grep -nE '^\s+"supabase":' bun.lock` returns nothing and package.json has no `supabase` entry in dependencies (:27-88) or devDependencies (:89-111). Contrast .github/workflows/ci.yml:19-27, whose comment argues at length against installing "whatever Bun shipped that hour".

**[HIGH] `bun run typecheck` does not typecheck scripts/. tsconfig.json's `include` lists only src, vite.config.ts, eslint.config.js and supabase/rls-tests — yet `bun test` loads and executes 7 test files under scripts/, and those import 3 non-test TypeScript modules from the same directory. Type errors in that code ship without any gate seeing them.**

- File: `tsconfig.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: tsconfig.json:2-8 `"include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts", "eslint.config.js", "supabase/rls-tests/**/*.ts"]`. Untypechecked but executed by `bun test`: scripts/content-media-reconciliation-local.test.ts, scripts/content-media-reconciliation-local.integration.test.ts, scripts/import-adoption-guide-drafts.test.ts, scripts/reconcile-content-media.test.ts, scripts/seed-admin.test.ts, scripts/verify-admin-performance.test.ts, scripts/ci/supabase-fixture.test.mjs. Untypechecked non-test .ts: scripts/content-media-reconciliation-local.ts, scripts/reconcile-content-media.ts, scripts/build-protected-forms-fixture.ts, scripts/check-cod-config.ts, scripts/verify-admin-local.ts, scripts/verify-local-restore.ts, plus scripts/fixtures/*.ts(x).

**[HIGH] `bun run lint` does not lint scripts/ either, so the same 16 tracked TypeScript files plus 18 verify-*.mjs scripts and scripts/ci/*.mjs get neither ESLint rules nor the prettier/prettier check that gates the rest of the tree. AGENTS.md:25 describes this command as running "over the whole tree", which it does not.**

- File: `package.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: package.json:14 `"lint": "eslint src eslint.config.js vite.config.ts supabase/rls-tests"` — four explicit paths, none of them `scripts`. eslint.config.js:23-51 further scopes all real rules to `files: ["**/*.{ts,tsx}"]`, so even if scripts/ were passed, the .mjs verifiers would only ever be checked by the trailing `eslintPluginPrettier` at :52.

**[HIGH] The RLS harness fails open: when the local stack is unreachable the entire file is skipped and the suite reports success. In the non-blocking rls-matrix job this compounds — if `bunx supabase start` half-succeeds or binds a different port, `bun run test:rls` still exits 0 having asserted nothing, and the job is `continue-on-error` anyway.**

- File: `supabase/rls-tests/moneyPii.rls.test.ts`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: supabase/rls-tests/moneyPii.rls.test.ts:54-55 `const reachable = await isLocalStackReachable(); if (!reachable) warnSkipOnce();` and :114 `describe.skipIf(!reachable)(...)`. I observed the skip path live: "Skipping RLS behavioral tests: local Supabase stack not reachable at http://127.0.0.1:55321" with `0 pass / 40 skip` and exit code 0. docs/rls-testing.md:9-10 states this behaviour is intentional for plain `bun test`, but ci.yml:250-251 uses the same harness as the CI assertion with no reachability precondition.

**[HIGH] Skip growth is unbounded and invisible. Unenforced database coverage more than doubled since the audit baseline (40 skips → 86) with no gate objecting, because nothing asserts a maximum skip count or a minimum executed-test count.**

- File: `.github/workflows/ci.yml`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: docs/superpowers/plans/2026-09-05-hkscda-astra-completion.md:47 records the audit baseline as "1,778 pass / 40 database-dependent skips / 0 fail"; my measured run at c037cc1 is 1969 pass / 86 skip / 0 fail. The plan at :51 requires "named transaction/RLS/concurrency tests to execute without skips", but .github/workflows/ci.yml:37-38 runs `bun test --isolate` with no `--bail`, no skip threshold and no post-step parsing of the summary line.

**[MEDIUM] The lint gate never fails on warnings — there is no `--max-warnings` anywhere — so ESLint warnings accumulate without bound. The repo's own baseline record measures 40 of them at this commit.**

- File: `eslint.config.js`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: package.json:14 has no `--max-warnings` flag; `grep -n 'max-warnings' package.json .github/workflows/ci.yml eslint.config.js` returns nothing. eslint.config.js:48 sets `"react-refresh/only-export-components": ["warn", ...]` — warn, not error. docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md records `bun run lint` exit 0 with "0 errors, 40 warnings (all react-refresh/only-export-components)".

**[MEDIUM] CLAUDE.md and AGENTS.md both state the test gate is "~1090 tests, ~193 files, a few seconds". The measured reality at this exact commit is 2055 tests across 322 files in 74.6s — roughly 2x the tests and ~25x the wall time. Any agent budgeting on the documented figure will mis-plan the gate, and the two docs disagree with the repo's own evidence file.**

- File: `AGENTS.md`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: AGENTS.md:22 and CLAUDE.md (Build & Run section) both read `- Test: \`bun test\` (~1090 tests, ~193 files, a few seconds)`. My own run: "1969 pass / 86 skip / 0 fail / 6020 expect() calls / Ran 2055 tests across 322 files. [74.63s]". Independently corroborated by docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md §4, which records 1969/86/0, 2055 tests, 322 files, 57.85s.

**[MEDIUM] adminRouteAuditing's audit-row check has a whole-file escape hatch: `/_with_audit"/.test(source)` matches any occurrence of a `*_with_audit` RPC name anywhere in the file. A new admin server file that calls one audited RPC and separately mutates `animals` with a raw `.from("animals").update(...)` satisfies the guard without auditing that second write.**

- File: `src/lib/adminRouteAuditing.test.ts`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: src/lib/adminRouteAuditing.test.ts:67-72 — `return (queryChains(source, "audit_log").some((chain) => chain.includes(".insert(")) || /_with_audit"/.test(source));`. The second disjunct is not scoped to the mutating chain, unlike the first, and unlike `queryChains()` at :41-52 which was written specifically to stop exactly this kind of whole-file matching.

**[MEDIUM] supabaseMigrations' write-grant/audit tie depends on a hand-maintained `auditedTables` set that duplicates the table array inside the migration. The set is a claim, not a check: adding a table name to it silences the gate for that table whether or not a trigger was ever created. The two lists agree today (22 names on both sides), so this is drift risk, not a live hole.**

- File: `src/lib/supabaseMigrations.test.ts`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: src/lib/supabaseMigrations.test.ts:522-546 hardcodes the 22 names with only the comment `// log_animal_mutation() triggers — 20260803120000 and 20260805120000.` to connect them. The authoritative list lives in supabase/migrations/20260805120000_animal_mutation_audit_atomicity.sql:142-147 (`foreach v_table in array array[...]`, 19 names) plus supabase/migrations/20260803120000_audit_animal_mutations.sql:86-98 (3 explicit `create trigger` statements). Nothing parses the migration array to derive the set.

**[MEDIUM] supabaseMigrations.test.ts is entirely a text scan of SQL files — `readFileSync` + `toContain`/`toMatch`. It proves migration text looks right; it can never prove a migration parses, applies, or that the objects exist. Twenty-plus of its tests pin exact literal strings (including whitespace and newline positions) in specific migration files, so it is simultaneously brittle to reformatting and blind to semantics.**

- File: `src/lib/supabaseMigrations.test.ts`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: src/lib/supabaseMigrations.test.ts:1-16 — the only I/O is `readFileSync(join(process.cwd(), "supabase", "migrations", fileName), "utf8")`; there is no database client import in the file. Examples of literal pinning: :67 `expect(sql).toContain("values (\n  'content-media',\n  'content-media',\n  true,\n  8388608,")`; :649-653 assert exact multi-line indentation of two placeholder inserts; :887-891 assert `(sql.match(/'cat', '/g) ?? []).length` is exactly 7 and `/'dog', '/g` exactly 9.

**[MEDIUM] The CI Supabase fixture answers every unrecognised PostgREST path with HTTP 200 and an empty array. A public route that starts reading a new table therefore renders its empty state, and the brand/a11y/performance verifiers — which gate on console errors, failed requests and 404 assets — report green on a page that is silently unpopulated.**

- File: `scripts/ci/supabase-fixture.mjs`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: scripts/ci/supabase-fixture.mjs:255-258 — `if (path.startsWith("/rest/v1/")) { json(res, 200, []); return; }`, placed after the handful of explicitly-modelled tables and before the final `json(res, 404, ...)` at :260. ci.yml:117-121 only ever probes `/rest/v1/animals?select=id&limit=1` to decide the fixture "answered".

**[MEDIUM] `bun run restore:db` always exits 0. The final psql exit code is printed but never propagated, so the restore step cannot fail a script, a drill or a future CI job — it can only be read by a human.**

- File: `scripts/restore-database.mjs`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: scripts/restore-database.mjs:131-138 — the `Bun.spawnSync([...psql...])` result is captured into `result`, then the file ends with `console.log(\`\\nRestore command finished (exit code ${result.exitCode}). Review the output above, then verify your data.\`);` with no `process.exit(result.exitCode)`. The comment at :125-127 acknowledges it ("This command's exit code is not a reliable success signal either way") but the script still swallows the signal rather than surfacing it.

**[MEDIUM] Neither backup nor restore is exercised by any gate. There is no CI job, no test file, and no package script that invokes scripts/backup-database.mjs or scripts/restore-database.mjs, so recovery correctness rests entirely on a manual drill recorded in a runbook.**

- File: `scripts/backup-database.mjs`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: .github/workflows/ci.yml contains no reference to `backup`, `restore`, or `backups/` across all 337 lines. package.json:24-25 declares `"backup:db"` and `"restore:db"` but no gate calls them. The only related tracked artefacts are docs/backup-restore-runbook.md and scripts/verify-local-restore.ts — and the latter is itself in the untypechecked, unlinted scripts/ directory (tsconfig.json:2-8, package.json:14).

**[MEDIUM] supabase/tests/ is referenced by no gate. The psql acceptance script and the PowerShell concurrency harness are reachable only by hand, and one of them is Windows-only PowerShell, so it could not run on the ubuntu-latest runners even if wired up.**

- File: `supabase/tests/crm_public_identity_concurrency.ps1`
- Phase: Phase 1 (database/migration proof) — inferred
- Evidence: supabase/tests/ contains exactly two files: crm_public_identity.sql (a psql script requiring `-v crm_test_target=local`, guarded at :1-24 with `\quit 3` on a non-local target) and crm_public_identity_concurrency.ps1 (`param([Parameter(Mandatory = $true)][string]$DatabaseUrl)`, :1). Neither name appears in .github/workflows/ci.yml or package.json. The .sql file is loaded at runtime only by src/lib/supporters/publicIdentity.database.test.ts:32-40, which is itself one of the 86 always-skipped tests.

**[MEDIUM] The documented local test command diverges from the CI command. package.json's `test` script is plain `bun test`; CI runs `bun test --isolate`. Isolation changes module-registry sharing between files, so a cross-file state leak passes locally and fails only in CI (or vice versa).**

- File: `package.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: package.json:11 `"test": "bun test"` versus .github/workflows/ci.yml:38 `run: bun test --isolate`. docs/superpowers/plans/2026-09-05-hkscda-astra-completion.md:37 explicitly flags the divergence — "All full-suite commands below use `bun test --isolate`, matching current CI. Replace shorter bare `bun test` full-suite instructions in companion plans accordingly" — but package.json was not updated, and CLAUDE.md/AGENTS.md:22 still document bare `bun test`.

**[MEDIUM] The repository has no CODEOWNERS, no dependabot config and no branch-protection-as-code — .github contains exactly one file. Combined with the audit's note that the branch-protection API read returned 403, which checks are actually required on main cannot be verified from the repository at all.**

- File: `.github/workflows/ci.yml`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: `find .github -type f` returns a single path: .github/workflows/ci.yml. docs/superpowers/audits/2026-09-05-hkscda-current-status.md:232 — "Branch-protection read returned 403, so required checks cannot be independently verified." The workflow comments at ci.yml:57-62 and :151-155 describe promotion to a required check as a manual branch-protection action with no artefact in the repo.

**[MEDIUM] vercel.json disables deployments only for six layout/doc branch patterns, so any other feature branch — including feat/hkscda-six-phase-revision — produces a public Vercel preview on push, against AGENTS.md's instruction not to create a public preview while review access is meant to remain private. There is no `ignoreCommand` or allowlist.**

- File: `vercel.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: vercel.json:5-13 `"git": { "deploymentEnabled": { "feat/public-layout-v2": false, "feat/layout-*": false, "chore/layout-*": false, "fix/layout-*": false, "ci/layout-*": false, "docs/brand-reconciliation": false } }` — a deny-list of six patterns, none matching `feat/hkscda-*`. Independently observed in docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md §2: "every feature-branch push in this project produces a Vercel preview deployment (target: null) ... A branch outside those patterns will produce a preview on push".

**[LOW] The same guard inspects only the first trigger-audited table a file mutates. `.find(...)` short-circuits, so a file that mutates two of the three tables is assessed once and the guard's own message names only one of them.**

- File: `src/lib/adminRouteAuditing.test.ts`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: src/lib/adminRouteAuditing.test.ts:84 `const table = TRIGGER_AUDITED_TABLES.find((candidate) => mutates(source, candidate));` followed by :85 `if (!table) continue;` — a `.filter(...)` with a per-table assertion is what the surrounding comment at :76-81 actually describes.

**[LOW] 18 of the 21 verify-*.mjs scripts are wired to nothing — no package.json script entry and no CI step. Only verify-public-brand.mjs is reachable, via its three MODE variants.**

- File: `package.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: `ls scripts/verify-*.mjs | wc -l` = 18 plus verify-public-brand.mjs itself; package.json:20-23 exposes only `verify:brand`, `verify:a11y`, `verify:performance` (all three `scripts/verify-public-brand.mjs` with a MODE switch) and `verify:brand:install`. Orphaned: verify-adoption-cls.mjs, verify-content-publishing.mjs, verify-contextual-donation-cta.mjs, verify-crm-authenticated.mjs, verify-faq-preload.mjs, verify-manual-gift-ui.mjs, verify-menu-hydration.mjs, verify-protected-forms.mjs, verify-public-donation-empty.mjs, verify-public-expanded-lifecycle.mjs, verify-public-failure-modes.mjs, verify-public-frontend-regressions.mjs, verify-public-frontend-wave2.mjs, verify-public-task6.mjs, verify-public-task6-a11y.mjs, verify-turnstile-behavior.mjs, verify-admin-performance.mjs, verify-admin-local.ts.

**[LOW] There is no format-check gate. `bun run format` writes files rather than verifying them, and prettier is only enforced transitively through eslint-plugin-prettier over the four lint paths — so scripts/, brand/, supabase/migrations/ and docs/ formatting is entirely ungated.**

- File: `package.json`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: package.json:15 `"format": "prettier --write ."` — no `--check`/`--list-different` variant exists, and .github/workflows/ci.yml has no prettier step. Enforcement is only eslint.config.js:52 `eslintPluginPrettier` applied under the lint scope of package.json:14.

**[LOW] The brand/a11y/performance verifier statically imports `lighthouse` at module load, but `lighthouse` is not a declared dependency of this project — it is only an auto-installed peer of playwright-lighthouse. All three MODE variants, including the blocking brand mode, load it, so an install that drops the auto-peer breaks the required job for a reason no package.json diff would show.**

- File: `scripts/verify-public-brand.mjs`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: scripts/verify-public-brand.mjs:8 `import desktopLighthouseConfig from "lighthouse/core/config/desktop-config.js";` — a top-level import evaluated in every mode, while the value is only used at :268 under `viewport.isDesktop` in performance mode. package.json:105-106 declares `playwright` and `playwright-lighthouse` but never `lighthouse`; bun.lock:1163 shows `"peerDependencies": { "lighthouse": ">= 10.0.0", ... }` and bun.lock:1027 pins the auto-installed `lighthouse@13.4.1`.

**[LOW] adminRouteAuditing resolves its source globs against the process cwd. Run from anywhere but the repo root, `Bun.Glob(...).scan(".")` yields nothing, the `for` loop body never executes, and the test passes vacuously with zero assertions — a silent no-op rather than a failure.**

- File: `src/lib/adminRouteAuditing.test.ts`
- Phase: Phase 6 (release readiness / CI enforcement) — inferred
- Evidence: src/lib/adminRouteAuditing.test.ts:28-33 `Array.fromAsync(new Bun.Glob(pattern).scan("."))` over `SERVER_SOURCE_GLOBS` (:18), consumed by the assertion-free-on-empty loop at :82-94. The sibling guard src/lib/adminAccessCoverage.test.ts:26-36 shows the team already knows this helper needs care — it carries a five-line comment and an explicit `path.split("\\").join("/")` normalisation that adminRouteAuditing has no equivalent of.

### Must reuse, not reinvent (12)

- `scripts/ci/supabase-fixture.mjs (PostgREST-shaped CI fixture server)` — `scripts/ci/supabase-fixture.mjs`: The single supported way to give a built app a reachable Supabase in CI. Listens on FIXTURE_HOST/FIXTURE_PORT (default 127.0.0.1:54329, :19-20), is content-hashed into every retained audit record by verify-public-brand.mjs:88-91, and is identified by FIXTURE_ID=supabase-ci-v1 in ci.yml:125. Any new public route that reads a new table must add its shape here — the catch-all at :255-258 returns 200 [] and will otherwise make the page look green while empty. It has its own test at scripts/ci/supabase-fixture.test.mjs.
- `moneyPii.rls.test.ts harness (reachability probe + describe.skipIf + role-client seeding + afterAll cleanup)` — `supabase/rls-tests/moneyPii.rls.test.ts`: docs/rls-testing.md:45-49 states explicitly that this harness and its fixture-seeding pattern "are meant to be copied for additional tables, not redesigned". Reuse `isLocalStackReachable()` (:19-37), the top-level-await gate (:50-55), `createRoleUser()` (:90-112), and the hoisted `service` client assigned before anything that can throw (:73, :123-126) so afterAll can always clean up. Ports 55321/55322 and the demo JWT keys at :11-17 are already matched to supabase/config.toml.
- `validatedLocalUrl() — loopback-only Postgres URL guard` — `src/lib/crm/manualGift.database.test.ts`: The house rule for opting a test into a real database without ever inheriting DATABASE_URL or production credentials: rejects non-postgres protocols, non-loopback hosts, and any query or fragment (which is how libpq `?host=` routing overrides are smuggled in). Defined at :6-24 and self-tested at :29-42. src/lib/supporters/publicIdentity.database.test.ts:5-8 and the four CMS integration files repeat the same shape — a new database test must reuse it rather than invent a third spelling.
- `rolledBack() — transaction-rollback fixture wrapper` — `src/lib/supporters/publicIdentity.database.test.ts`: Runs a test body inside `db().begin()` and throws a sentinel marker to force rollback, re-throwing anything that is not the marker (:21-30). This is how DB tests here avoid leaving rows behind; src/lib/content/contentRead.integration.test.ts:21-23 uses the same synthetic-rollback idiom. Prefer it over manual delete-based cleanup for new database tests.
- `expectDatabaseRejection() — await-the-rejection helper` — `src/lib/crm/manualGift.database.test.ts`: Defined at :73-82 with the reason in a comment: "Bun 1.3.14's rejects.toThrow matcher stalls these driver promises on Windows until the test timeout." Any new Bun SQL test asserting a database error must use this rather than `expect(...).rejects.toThrow`, or it will hang on Windows checkouts.
- `"every security definer function pins search_path" guard` — `src/lib/supabaseMigrations.test.ts`: The one generic constraint every new migration must satisfy (:434-462). It scans all supabase/migrations/*.sql, matches `create [or replace] function ... as $` and requires `set search_path = public, pg_temp` or `set search_path = ''` in the header, reporting `fileName:line`. Attribute order is free; both forms are accepted. Add new security-definer functions in that shape rather than amending the guard.
- `"every table granting authenticated writes is audited or explicitly exempted" guard` — `src/lib/supabaseMigrations.test.ts`: The second generic migration constraint (:464-579). It replays migrations in timestamp order, tracks `grant ... on all tables in schema public`, per-table grants and later revokes, then requires every table still granting authenticated writes to appear in `auditedTables` (:522-546) or `exemptTables` (:554-565). A new table with an authenticated write grant must get a `log_animal_mutation()` trigger added to the array in supabase/migrations/20260805120000_animal_mutation_audit_atomicity.sql:142-147 AND the name added here — exempt only when RLS exposes select-only to authenticated, never because "no component writes it today" (the comment at :548-553 is explicit).
- `queryChains() / mutates() / writesAuditLog() — per-chain source scanners` — `src/lib/adminRouteAuditing.test.ts`: The correct way to assert something about a specific Supabase query chain in source text: `queryChains()` (:41-52) cuts each `.from("<table>")` at the next `.from(`, so table name and mutation method cannot be matched independently across a file. Any new structural source guard should reuse these rather than whole-file `includes()`. The ATOMIC_ANIMAL_MUTATIONS pairing at :20-26 is the registry a new atomic mutate-and-audit route must be added to.
- `Bun.Glob Windows path normalisation pattern` — `src/lib/adminAccessCoverage.test.ts`: `paths.map((path) => path.split("\\").join("/"))` at :33-35 with the rationale comment: without it a glob-driven guard "passes on Linux CI and fails on a Windows clone". Every new test that globs source files and then compares POSIX-form paths must normalise at the source, as this one does.
- `verify-public-brand.mjs MODE switch + measurementContext/retainAudit` — `scripts/verify-public-brand.mjs`: One script backs all three browser gates via MODE=brand|a11y|performance (:12, :585-595). New browser checks belong in this MODE switch, not a new orphaned verify-*.mjs (18 of those already exist unwired). Reuse `measurementContext` (:83-96 — schemaVersion, commit, worktreeDirty, fixtureId, fixtureSha256), `retainAudit()` (:98-117) and the always-written run-context.json (:677-694) so results stay machine-comparable; `recordFailure()` (:134-136) plus the single `process.exitCode = 1` at :671 is the only failure channel.
- `The ci.yml preview-server bring-up block` — `.github/workflows/ci.yml`: Identical 30-line shell block at :92-123, :181-212 and :290-319: background the fixture, background `bun run preview` on 127.0.0.1:4173 with HOST/PORT/NITRO_HOST/NITRO_PORT, `trap` both PIDs on EXIT, poll `curl --fail` up to 120 times while checking the preview PID is still alive, then probe the fixture before running the verifier. A new browser job must copy this rather than invent a readiness wait — and must repeat the `env:` block (:138-141 documents why: step-level env does not carry over, and /help's SSR loader needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY at request time).
- `isLocalDockerHost() — Docker endpoint locality guard` — `scripts/restore-database.mjs`: Defined at :36-43 and applied to both DOCKER_HOST (:45-56) and the resolved `docker context inspect` endpoint (:58-100), with deliberately different semantics for a missing value in each case (:46-49 vs :81-92). Any new script that shells out to Docker against a local Supabase stack must reuse this three-step check rather than matching on container name alone — the comment at :18-35 explains exactly why name-matching is not a safety guarantee.

### Open questions

- I could not find an explicit Phase 1..6 definition in the repository. The master plan the work is driven from (CLAUDE_HKSCDA_IMPLEMENTATION_MASTER_PLAN_v1_2026-09-11_EN.md, referenced at docs/evidence/hkscda-revision/00-baseline-verification-2026-09-11.md:4-5) is not tracked in git, and docs/superpowers/plans/2026-09-05-hkscda-astra-completion.md:139-145 has a five-item "Recommended order", not six phases. Every `phase` value above is my inference from context (Phase 1 = database/migration drift proof, per that baseline doc's §5; Phase 6 = release readiness / CI enforcement, per audit gap #3). Please re-map them against the real plan.
- Whether the three continue-on-error jobs are nonetheless configured as required checks in GitHub branch protection cannot be determined from the repository — .github holds only ci.yml, and the audit recorded a 403 on the branch-protection API (docs/superpowers/audits/2026-09-05-hkscda-current-status.md:232). If a11y/rls/performance ARE required at the branch level, `continue-on-error: true` still reports them green, so the protection would be inert; that combination is worth checking against the live repo settings.
- I did not verify that `bunx supabase start` actually succeeds on ubuntu-latest with supabase/config.toml's non-default port block (55320/55321/55322/55323/55324/55327/55329) and `[analytics] enabled = true` on a postgres backend (config.toml:396-400). If it fails, the rls-matrix job's continue-on-error means CI would report green with zero RLS assertions executed and no visible signal.
- The working tree was NOT clean while I audited: a concurrent session in this shared worktree modified 26 files (src/lib/content/*, src/components/admin/content/*, src/routes/api/admin/content/*, plus supabase/migrations/20260705120000_story_promotion_center.sql). I confirmed via `git status --porcelain` that every file I cite for a finding is unmodified relative to c037cc1, and HEAD is still c037cc12b299058e2699b126c38322b59406e6ea — but my measured test numbers were produced against that dirty tree. They match the repo's own independent record (1969/86/0, 2055 tests, 322 files) taken on a clean tree, so I believe they are accurate for c037cc1.
- Whether `bunx supabase` honours bunfig.toml's `minimumReleaseAge = 86400` supply-chain guard the way `bun install` does. If it does not, the rls-matrix job can execute a Supabase CLI published minutes earlier, which is the exact scenario the Bun pin comment at .github/workflows/ci.yml:19-24 argues against.

