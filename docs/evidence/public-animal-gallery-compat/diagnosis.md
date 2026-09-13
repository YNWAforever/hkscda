# Public animal gallery rollout compatibility

2026-09-13. Based on origin/main 8b78849 (merged PR #118).

## Reproduction and root cause

Read-only live browser reproduction: homepage showed the empty adoption message; /animals/cat and /animals/dog showed load failures. Production database metadata still had 33 ledger entries through 20260912074747 and no animals.gallery column. Its current publication/eligibility/status filters yielded 100 cats and 108 dogs, so this was not an empty database.

The newly deployed public allowlist selected gallery unconditionally. PostgreSQL rejects that query before returning any animals when the additive gallery migration is absent. Homepage catch handlers converted both rejected reads to null and rendered them as a genuine empty list.

## Fix

List, homepage and detail readers now attempt the full explicit public allowlist first. Only PostgreSQL 42703 with the exact missing animals.gallery error retries once with the same allowlist minus gallery. Existing image_url remains authoritative and the public projection yields an empty gallery. Publication, retired state, status, species, eligibility, gender, sorting and pagination filters are retained. No SELECT \*, service-role fallback, permission relaxation, fabricated photos or automatic publication is introduced.

All other errors still fail, including missing publication_state and permission denial. Homepage now distinguishes an unavailable read from a successful empty result. This compatibility bridge does not apply the remaining production migrations or make unactivated administrative features operational.

## Verification

- Regressions reproduced the missing-column list/detail failure and misleading homepage empty state before the fix.
- Complete isolated suite: 2,361 passed, 0 failed, 0 skipped; 7,683 assertions across 394 files.
- TypeScript and production build passed; lint has 0 errors and 44 existing React refresh warnings.
- [Read-only browser verification](browser.json): fixed localhost app using production anonymous public credentials displayed home 1 card, cats 15, dogs 15, sponsorships 16; actual cat and dog detail pages loaded. Homepage only features records with qualifying existing photos. No production writes or live messages/payments.
- Modern-gallery success, narrow missing-column retry, no retry on permission/other-schema errors and publication filtering covered by tests.

## Release

No database migration is needed for this fix. Branch preview is disabled to retain private review. Merge to main automatically deploys and requires explicit release approval under AGENTS.md. After approved deployment, repeat live home/cat/dog/detail checks. Reverting this application-only fix against the unchanged database would restore the reported failure; no records were mutated to undo.
