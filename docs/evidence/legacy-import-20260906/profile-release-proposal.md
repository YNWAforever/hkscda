# Legacy profile release proposal — 2026-09-07

Status: local release candidate; production profile publication and deployment are not authorized by the design approval.

## Scope

Base: `df7b4261eab4e646f91a83e76a3a912ea3cfafb1` (refreshed origin/main, merged PR #109). Isolated branch: `codex/legacy-animal-profiles-20260907`.

Deliver compact cat/dog cards, reviewed profile details, name/code search and neutering/experience filters. Preserve canonical IDs, separate adoption and sponsorship membership, retirement, shortlist intent and the 14 already-published photo links. Unknown ages no longer match the adult filter. Public readers explicitly exclude internal notes and unknown profile keys.

Candidate contains 248 profiles, SHA-256 `80d5e153e56975f0abfec44ec7db46e67bf130d3fc126fd7d9e0a5d64c90891f`. Coverage: code248, birthday247, neutered232 (173yes/59no/16unknown), suitability248, recordDate248. Reviewed public narrative: personality124, health105, story1. Held: personality68, health72, story92. Held fields require further review; no raw rows or review manifests belong in Git or public Storage.

## Proposed production sequence (requires separate approval)

1. Verify exact source revision and remote CI; complete hosted owner review of both intents and mobile layout. Confirm current production schema, canonical counts and photo links read-only. Account for the membership migration version mapping: production `20260906173545` corresponds to repository `20260906162436`; do not reapply it.
2. Capture fresh, private, full-row before-images for the 248 target animals, current schema/triggers and scoped audit recovery. The local reconstruction used for this rehearsal is not a current production backup. Pause/drain staff animal edits for the short update window and set lock/statement timeouts.
3. Apply only additive migration `20260906181657_animal_public_profile.sql`. Existing application reads remain compatible. Validate allowed-key/type constraints and relevant role permissions on the actual target.
4. Revalidate candidate/source hashes and all 248 canonical IDs. Generate exact before/after images from the fresh target snapshot after migration, changing only `public_profile` and `updated_at`. Save the private manifest durably before execution. Execute the session-local `profile_transaction.sql` function in a transaction with the reviewed manifest; require 248 audit records, unchanged membership totals and 14 matching photo URLs before commit. Do not execute the local rehearsal manifest against production.
5. Merge/deploy only the approved source revision through the existing release process. The local browser build uses placeholder credentials and must never be promoted as a production artifact.
6. Verify production cat100/dog108/sponsor115 counts, shared identities, retired404, profile facts, filter/back/clear flow, photo loading and both shortlist intents. Record actual owner UAT and release evidence separately.

## Rollback proposal

- Before data publication, additive schema can remain while application source is reverted. Avoid destructive column removal.
- After publication, use the saved fresh manifest with `rollback=true`. It restores only prior profile and update timestamp, atomically writes rollback audit entries, preserves photos and other fields, and refuses any animal changed since publication. Review drift manually; never overwrite new staff work to force rollback.
- Repeating either apply or rollback adds zero writes when rows already equal the expected result. Local forced-failure, drift rejection, replay and exact restoration checks passed for all 248 profiles against reconstructed production animal schema/constraints/triggers.
- Profile rollback is separate from the earlier 248-animal import and photo rollback. The older import rollback intentionally refuses photo-modified records; do not combine these operations implicitly.

## Acceptance boundaries

Measured local data evidence: `public-profile-patch-rehearsal.json`, `public-profile-schema-rehearsal.json`, `profile-projection.json`. Browser and complete source verification are recorded in `../../development-completion-evidence.md`.

No new production profile schema/data write, deployment, payment activation, real-person message or owner UAT is claimed. Existing payment/provider and full-platform recovery gates remain unchanged.
