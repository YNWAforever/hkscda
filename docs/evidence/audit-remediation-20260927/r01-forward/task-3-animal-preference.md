# R01 Task 3: shared animal preference record correction

Parent: guard Fix Round 1 `3e869c56526b4d8f6ac827b088117cdc7e301cf5`. This separately authorized dependency repairs a real existing defect outside the eight missing Task 3 objects. It closes no additional missing manifest requirement. Production remains unapplied.

## Actual failure and minimal fix

Watched actual hosted RED: `bun test supabase/rls-tests/animalPreferenceCompatibility.rls.test.ts --timeout 30000`, exit 1, 0 pass / 2 fail / 2 assertions. Both actual trigger row types returned `42703`, before their intended `23514` eligibility rejection. The shared `public.enforce_current_animal_preference()` CASE expression resolved both NEW fields. Sponsorship rows contain `sponsor_animal_id`, not `animal_id`; adoption preference rows contain `animal_id`, not `sponsor_animal_id`.

The pinned CLI 2.118.0 generated `20261001154743_r01_animal_preference_record_fields.sql` after this watched RED. The correction selects through two IF branches, each referencing only the field present in that row type. Both retain `FOR KEY SHARE`, the same retired/publication/status rules, sponsorship/adoption eligibility rules and type snapshot checks. Exact old definition MD5 `5d9512de7da0c787523292316c6603e7` becomes exact fixed definition `35e278e91a05873c5da7949cf4782b7a`. Only these two complete definitions are accepted; absent/overloaded/unexpected function, owner/config/ACL or attachments abort with `55000`.

The existing postgres owner, SECURITY DEFINER mode, PL/pgSQL language, volatile/unsafe-parallel attributes, `search_path=public, pg_temp`, trigger return, no-arg identity and exact postgres/service-role EXECUTE grants remain. No grants are changed. Exact BEFORE INSERT row attachments on `sponsorship_preference` and `adoption_application_animal_preference` remain enabled. No trigger/default/generated-expression suppression or legacy replay occurs.

## Verification and preservation

Final hosted and modern commands opt in `R01_ANIMAL_PREFERENCE_ALLOW_LOCAL_FIXTURES=1`, then run `bun run supabase/rls-tests/helpers/runR01AnimalPreferenceForward.ts green 20261001154743_r01_animal_preference_record_fields.sql` and the same command with `green-modern`. The adjacent source binding contains their actual exits, six-test counts and complete receipts. The meaningful actor suite covers both nonexistent-animal rejection, both successful real selected-animal paths (including unchanged generated age `adult`), and both domains rejecting unpublished/adopted/retired/ineligible/snapshot-mismatched animals. Synthetic animals, parents and preferences roll back.

Each migration applies twice. Full catalog comparison explicitly permits ONLY this reviewed function body delta; every other catalog row/facet, owner, ACL, config, trigger and RLS remains equal. Five actual mismatch preflights (unexpected body, PUBLIC EXECUTE, wrong config, disabled attachment and missing both attachments) must return `55000` and roll back to the exact catalog. Ledger and original template/modern rows, sequences and ledger hashes stay equal; each owned empty clone drops normally, with frozen executable bytes verified.

Earlier evidence remains distinct: a test-only nested transaction API mistake yielded 4 pass / 2 fail after successful migration/replay; explicit SQL SAVEPOINT corrected it. Self-review then found `jsonb_agg` NULL could allow zero attachments under `< >` semantics; the new actual missing-both-attachments negative reproduced an erroneous success before the minimal `IS DISTINCT FROM` correction. Both completed runs cleaned normally and preserved sources/frozen inputs. Their original hashes and raw logs are retained. Final receipts are not relabeled from those runs.

The previously blocked real animal fixture path is now covered with the separately committed and reviewed own-scope guard correction plus Fix Round 1. No original animals or hosted data are read or written. Manual metadata review covered animal membership/default, pure age and profile validators, audit/auth dependencies, direct supporter/pledge/adoption parents and preference attachments before actor fixtures. The guard remains a fixture check, not blanket RPC approval.

## Release and rollback boundaries

No push, merge, preview, production migration, provider, payment or notification enablement occurred. Full composition gates are recorded by the later Task 3 package. A source revert preserves a reviewable historical rollback but would reintroduce the reproduced trigger defect; no automatic production reverse migration or data deletion is supplied. Existing financial/instruction/contact/audit architecture remains unchanged. Full checkout/provider acceptance requiring the unresolved Task 1 payment slice remains blocked/not run.
