# Legacy animal replacement candidate — 2026-09-07

Status: local candidate verified; production cutover NOT performed or approved by this report.

## Scope and identity

Baseline: refreshed origin/main `fdfe562d1b226ddddf7fef2e0aa979efcd9c3922` (PR #108). Isolated branch `codex/legacy-animal-replacement-20260907`. Existing work and private source files retained.

The new website is not automatically synchronized with the legacy website. Previous work staged the export and photos privately; it did not import live animal records. Existing import tooling also models sponsorship as a species, so it cannot represent the same cat/dog in both catalogues correctly.

The user identified all 44 current animal records as placeholders. Retire these records by timestamp, preserving IDs and foreign keys. Import one canonical record per selected legacy animal, with separate adoption and sponsorship eligibility. Do not hard-delete placeholders or copy private notes into public descriptions.

| Candidate | Count |
|---|---:|
| Distinct public animals | 248 |
| Adoption cats | 100 |
| Adoption dogs | 108 |
| Sponsorship animals | 115 (38 cats, 77 dogs) |
| Shared adoption/sponsorship identities | 75 |
| Legacy animals retained only in private staging | 4,896 |
| Placeholder records retired | 44 |

The 5,144 source animals are retained privately. Selection uses explicit `is_adoptable` and `is_inside_support_pool` flags, excludes deleted/deceased/adopted dates, and holds invalid identity fields. A/D/F/S letters are not interpreted. This is an export-based candidate, not confirmed current legacy-website parity: source pages returned HTTP 403 during verification.

Source SHA-256: `7a9454278c84c797a7a75bd56bfd416db852c2758483dc999f0e344a06a64225`.
Candidate SHA-256: `9a45496e21a9cf264e56e8c64774825cd0ea593a783e09f048ee91181773dffa`.
Private source/candidate/rollback values stay under ignored backups; tracked evidence contains aggregates only.

## Completed code

- Canonical species and independent eligibility across lists, details, cards, shortlist, sponsorship wizard and sitemap; retired records are excluded.
- Public adoption/sponsorship submissions recheck current eligibility server-side, and sponsorship snapshots preserve actual species.
- Migration backfills existing memberships, corrects overly broad animal write policy to staff/admin, protects private rollback manifests, and permits cat/dog sponsorship snapshots.
- Admin cat-to-dog corrections preserve both membership flags; transitions involving the old sponsor type retain compatibility.
- Session-local replacement and rollback functions write animal changes and audit entries atomically, reject changed snapshots, support idempotent replay and guard against edited/newly referenced imported rows.
- Empty/NULL candidate inputs are rejected. Rollback locks the parent table against concurrent FK checks so committed child history cannot disappear between its reference check and deletion.

## Measured acceptance

| Package | Failing before | Passing after |
|---|---|---|
| Readers | Retired and sponsor-only cats leaked into adoption list; canonical cat/dog could not enter sponsorship flow | Focused reader/domain/UI tests pass; full suite 1,954 pass, 86 skip, 0 fail, 5,954 assertions |
| Snapshot constraint | Canonical cat sponsorship rejected by existing check constraint | Cat, dog and legacy sponsor accepted; unsupported type rejected |
| Admin species correction | Sponsor-only cat corrected to dog became adoptable and lost sponsorship | Sponsor-only and dual membership preserved |
| Atomic replacement | Injected failure after writes | Entire operation rolled back; no partial retirement/import/audit |
| Invalid replacement | SQL NULL retired placeholder and committed empty batch | SQL NULL, JSON null, object and empty array rejected without writes |
| Rollback concurrency | Successfully committed child record was cascade-deleted | Concurrent insert waits for rollback, then fails FK rather than committing history that is lost |

Local 248-record rehearsal: 44 baseline records plus 248 imports = 292 stored; 44 retired; 248 visible; 292 apply audit entries; replay adds zero. Eight synthetic history links survive. Guarded rollback restores the original 44-row fingerprint and preserves history, with 584 cumulative audit entries. Imported-row edits and new references both block rollback.

Additional checks: 34 Python import/photo/selection tests pass; TypeScript check and production build pass. Lint: exit 0, zero errors and 40 warnings. Detailed aggregate outputs: `animal-replacement-rehearsal.json`, `animal-replacement-safety-regressions.json`, `catalog-membership-rehearsal.json`.

The PostgreSQL rehearsals use offline containers with no network or host ports, synthetic target/history rows and simulated authorization helpers. They are not full production Supabase trigger/RLS/Auth parity or owner UAT. The full application suite's 86 skips remain skips; no claim is made that those external/database cases ran in this package.

## Photos and public content

Only 1 of 208 adoption candidates and 14 of 115 sponsorship candidates have a safely matched staged photo. Most supplied photos belong to historical animals. Six attachment-overlap photos remain private; undecodable/MPO files are held. This replacement inserts no public image URLs, descriptions or private notes. Do not substitute generated or unrelated animal photographs. Photo publication needs a separate reviewed mapping and authorization.

## Concrete release sequence — not executed

1. Before approval, validate the final candidate against a production-shaped isolated restoration, including actual animal/audit triggers, all foreign keys, policies and service-role grants. Review publication membership and missing-photo presentation with the owner.
2. Take and verify a recoverable production database backup covering animals, every linked table, private manifests and audit history. Capture the exact 44 IDs and complete before-images privately. Recheck source/candidate checksums and the live schema/row fingerprint. Previously observed fingerprint: `89e23d5750602bc63c73484fa2896554`; any change stops execution for review.
3. Obtain explicit approval for the exact schema migration, application deployment and 44-to-248 data replacement. Do not infer this from earlier unrelated approvals or a generic continue.
4. Pause and drain public animal submissions plus staff animal edits for the cutover. Application eligibility reads and writes are separate calls; pausing/draining is required to avoid stale selections crossing the replacement. No database-level eligibility trigger is claimed by this package.
5. Apply `20260906162436_animal_catalog_membership.sql` first. Validate preserved legacy memberships, tightened staff/admin policy, private-table denial and expanded sponsorship snapshot constraint. Deploy the tested membership-aware application before importing canonical records; old application code does not understand sponsor-eligible cats/dogs.
6. Execute the reviewed session-local transaction with the verified 248-record projection, source/candidate hash, expected ID set and fingerprint. Check 44 retired, 248 distinct public animals, 100 adoption cats, 108 adoption dogs, 115 sponsors and 75 shared IDs; verify original history links and 292 audit records. Abort on any mismatch.
7. Verify CMS and public routes with real hosted authorization, clear/revalidate caches, then reopen submissions and staff editing. No payment activation, provider messages, or photo upload belongs to this release.

## Rollback proposal

Keep the membership schema/application in place while reversing data; do not deploy the old application over canonical sponsor cats/dogs. With submissions and edits paused/drained, invoke the session-local rollback using the applied batch ID. It compares every after-image, blocks new references, locks against concurrent FK checks, removes only unreferenced imported rows and restores the retired placeholders' previous timestamps. All rollback audit entries remain. If a record changed or gained history, automated rollback stops; reconcile that history explicitly instead of deleting it or restoring an old whole-database snapshot over newer records.

Schema rollback is a separate reviewed action: first restore compatible data, ensure no cat/dog sponsorship snapshots require the expanded constraint, and preserve private manifests/audit evidence. No broad destructive down migration is provided.

## External gates

Production-shaped restore/parity and current source/owner membership review; photo publication decision; hosted browser/CMS UAT; fresh recoverable backup and exact live snapshot; final CI/release identity and explicit production authorization. Payment provider activation remains a separate unresolved workstream. Production changes in this package: zero.
