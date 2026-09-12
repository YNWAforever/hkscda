# Release request — full migration catch-up (12 migrations)

Recorded 2026-09-12 · isolated local stack only · **nothing applied to production**

Builds on `14-live-incident-sponsorship-submissions.md` (the confirmed live
incident) and `15-production-state-migration-rehearsal.md` (which rehearsed a
narrower 4-migration fix). This is the full catch-up: `main` is now three
phases ahead of production (Phase 1 recovery, Phase 2 animals/public site, and
Phase 3 sponsorship are all merged), and all 12 migrations still unapplied to
production are rehearsed here together, in the order they must be applied.

**This document requests approval. It does not apply anything to production.**

## Building an accurate mirror, not a from-zero rehearsal

Production's applied history is not a clean prefix of the repository's
migrations — confirmed by direct read-only query against `iihqjzilgawhfdhdevam`,
not inferred from the migration ledger (whose recorded version numbers for
several entries don't match any migration filename, evidence of prior manual
repairs). The true picture:

1. A clean sequential run through `20260830140000_about_page_content`.
2. Two migrations (`20260831120000`, `20260831160000`) and four more
   (`20260905150012`, `20260905155426`, `20260905162615`, `20260905163559`) were
   never applied as their own files — their combined effect was restored on
   2026-09-06 via a single undocumented repair
   (`docs/evidence/cms-payment-debug-20260906/proposed-read-repair.sql`,
   recorded in production's ledger as one entry,
   `20260906062155_cms_payment_read_compatibility_repair`). Verified by reading
   that repair's own `-- Source:` comments against each of the 6 files.
3. `20260906162436` and `20260906181657` (animal catalogue membership, public
   profile) applied cleanly as their own files, confirmed by column presence
   (`adoption_eligible`, `retired_at`, `public_profile` all present on
   production's `animals` table).
4. Nothing since. 12 migrations remain, confirmed absent one by one via
   `to_regclass`/`to_regprocedure`/`information_schema.columns` against
   production directly (not the ledger):

| # | Migration | Confirmed absent from production via |
|---|---|---|
| 1 | `20260905144848` supporter identity claims | `resolve_public_supporter_identity`, `supporter_consent_intent`, `donation.contact_*` |
| 2 | `20260905155357` manual gift / delivery jobs | `donation_delivery_job`, `manual_gift_request`, both audited RPCs |
| 3 | `20260905163900` volunteer atomic approval | `volunteer_activity_counts` |
| 4 | `20260911120000` sponsorship identity protection | depends on #1; widens accepted `source` values |
| 5 | `20260911130000` animal-images bucket | see discrepancy note below |
| 6 | `20260911140000` animal publication state | `animals.publication_state` |
| 7 | `20260911150000` preserve eligibility on species change | trigger fix; see data verification below |
| 8 | `20260911160000` correct legacy sponsor species | 3 animals still `type='sponsor'` in production today |
| 9 | `20260911170000` publish fostered animals | RLS policy still `status='available'` only |
| 10 | `20260911180000` sponsorship second month | function fix, no new relation to probe |
| 11 | `20260911190000` sponsorship monthly ledger | `sponsorship_period`, `sponsorship_payment_allocation` |
| 12 | `20260912120000` sponsorship assignments | `sponsorship_assignment` |

Local mirror built by resetting to the clean prefix (`supabase db reset
--version 20260830140000`), applying the repair SQL, then the two animal
migrations — verified to match production object-for-object (payment config,
content revision, CRM read models present; every item in the table above
absent) before touching any of the 12.

## The 12 applied, in order — all succeeded

```
OK  20260905144848  OK  20260911140000
OK  20260905155357  OK  20260911150000
OK  20260905163900  OK  20260911160000
OK  20260911120000  OK  20260911170000
OK  20260911130000  OK  20260911180000
                     OK  20260911190000
                     OK  20260912120000
```

After all 12: every object in the table above is present, confirmed the same
way it was confirmed absent (direct query, not inference).

**One methodology finding, not a migration bug:** `20260911160000` creates a
`temporary table ... on commit drop` and uses it across two statements. Applied
as discrete autocommit statements (`psql -f` without a transaction), the table
drops before its second use and the file appears to fail. Applied the way
Supabase's own migration runner applies every file — as one transaction — it
succeeds cleanly. All 12 were re-verified applied this way (`--single-transaction`
per file); the sequence above reflects that.

**Rerun safety, extending `15`'s finding:** `15` found `20260905155357`
fails on a second run (`relation already exists`, no `if not exists`, no
explicit transaction) and confirmed the fix is applying it as a single
transaction, not editing the migration. Checked the remaining 8 the same way:
all 8 are safely rerunnable. `20260905155357` is the only one of the 12 that
requires single-transaction application to be interrupt-safe — already the
standard this rehearsal used throughout, so no special handling is needed
beyond "apply every migration as one transaction," which is what actually
applying them to production must also do.

## Data-level verification (items 7 and 9 from the prior direction question)

These two are not schema catch-up — they change what already-existing records
mean or who can see them. Verified against seeded representative data, not
just against an empty schema.

### Species correction (`20260911160000`)

Seeded two `type='sponsor'` animals: one with a `code` present in the
migration's 128-entry mapping, one with a code that is not.

| | Before | After |
|---|---|---|
| Matched code (`C1157`) | `type=sponsor` | `type=cat` |
| Unmatched code | `type=sponsor` | `type=sponsor` (left alone, not guessed) |
| `adoption_eligible`, `sponsorship_eligible`, `name`, `public_profile`, `retired_at` (matched row) | — | all unchanged |

`sponsorship_eligible` staying `true` through the species change confirms
`20260911150000`'s trigger fix is doing its job — the old trigger logic would
have flipped it false and silently unsponsored the animal. Production
currently has exactly 3 animals with `type='sponsor'` (confirmed today), all
covered by the 128-entry mapping built from the source export.

### Fostered-animal visibility (`20260911170000`)

Current public policy on `animals`, read directly from `pg_policy` after
applying: visible when `status IN ('available','fostered')` (not `'adopted'`),
`retired_at IS NULL`, `publication_state='published'`, and eligible for
adoption or sponsorship — matching the migration's stated intent exactly:
foster animals become visible, adopted ones never do.

**These two are real product decisions, not bugs to fix.** Item 8 changes
species classification for 3 existing animal records. Item 9 makes foster
animals publicly visible for the first time. Both are rehearsed and correct;
neither is something I'm treating as pre-approved by virtue of being in this
list.

## Discrepancy found, not part of this release

`20260911130000`'s own comment states the `animal-images` bucket "exists in
the production project only, created by hand... already holds real animal
photographs." Checked directly: production's `storage.buckets` has 7 buckets
and `animal-images` is not one of them. Either the comment is stale or animal
photo uploads through `AnimalForm.tsx` have been failing since before this
migration was written. Applying `20260911130000` (which uses `on conflict do
nothing`, safe either way) creates the bucket if genuinely absent. This does
not block the release; it's a separate, likely pre-existing gap worth its own
look.

## Required order and why

```
20260905144848 → 20260911120000 → 20260905155357 → 20260905163900
  → 20260911130000 → 20260911140000 → 20260911150000 → 20260911160000
  → 20260911170000 → 20260911180000 → 20260911190000 → 20260912120000
```

`20260905144848` before `20260911120000` (creates the function before widening
its accepted values — reversed order leaves a CHECK violation instead of a
missing-function error). `20260911150000` before `20260911160000` (the trigger
fix must land before the species correction or eligibility silently breaks).
Code depending on any of these (the sponsorship form, Phase 3 admin screens)
is already deployed and waiting on this schema — this closes the gap, it does
not open a new one.

## Rollback

All 12 are additive (new tables/columns/functions, widened checks, an RLS
policy that only adds visibility) except the one data write: the species
correction updates 3 existing rows. Reversing it means restoring those 3
rows' prior `type` value from this record, not a blanket schema rollback.
Everything else rolls back by redeploying the previous application revision
with the schema left in place, per the standing rule in
`hkscda-migration-and-release.md` §7 — dropping any of these objects would
destroy data (consent evidence, delivery job history, sponsorship ledger)
and is not the rollback path.

## What this does not establish

- Rehearsed against an isolated local mirror, not a restored copy of
  production's actual data. Row-level reconciliation for the 3 real
  `type='sponsor'` animals (confirming their production `code` values are
  in the 128-entry mapping) has not been done — only that the *mechanism*
  behaves correctly against representative data shaped the same way.
- No production access, read or write, was used beyond the metadata-only
  queries already covered by prior sessions' authorization for this exact
  incident.
- No migration has been applied to production. Applying them is a
  production change and requires your explicit approval, separate from and
  in addition to the direction already given to prepare this request.
