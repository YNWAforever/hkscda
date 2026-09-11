# Phase 2 §5.1 — Source Mapping and the Animal Photograph Gap

Recorded: 2026-09-11 · Local inspection only. No Supabase, payment or email
contact; no production data read or written.

## Inputs actually available

| Input | Present | Detail |
|---|---|---|
| Legacy SQL export | yes | `hkscda_data.sql`, 28,086,302 bytes |
| Supplied image folder | yes | 1,256 files |
| Prior staging database | **no** | `backups/` is Git-ignored and absent from this checkout; rebuilt from the export |
| Production database | **no** | not read at any point |

Rebuilt with the repository's own tool, unchanged:
`scripts/legacy-import/legacy_stage.py` (its 43 unit tests pass).

```
inserted 150918 · excluded 74 · repeat_inserted 0 · tables_with_data 41
```

`repeat_inserted: 0` on a second pass confirms the staging import is idempotent.

## Source corpus

| Measure | Value |
|---|---|
| Animal rows | 5,144 (4,920 not deleted) |
| Species | cat 3,642 · dog 1,278 |
| `is_adoptable` | 212 |
| `is_inside_support_pool` | 128 |
| Both | 77 |
| **Public-facing (adoptable ∪ support pool)** | **263** |
| Has reference number (`code`) | 4,920 — **100%** |
| **Duplicate reference numbers** | **0** |
| Duplicate names | 622 |

Two of those matter for migration safety:

- **Reference numbers are unique across the entire corpus.** `code` is therefore
  a sound join key, which is exactly what the plan asks for ("Prioritise
  IDs/reference numbers").
- **622 duplicate names.** Matching by name would mis-assign records at scale.
  The plan's warning is not theoretical for this data.

The source flags line up closely with the audit's production counts
(212/128/77 here against 208/115/75 audited), which supports the reading that
production holds the adoptable ∪ support-pool subset. The small differences are
not reconciled here: that requires reading production.

## The photograph gap — the headline result

| Measure | Value |
|---|---|
| Public-facing animals | 263 |
| Referencing a photo in source metadata | **263 (all of them)** |
| Photo file resolves in the `files` table | 263 (0 dangling) |
| **Photo bytes present in the supplied folder** | **14** |
| **Missing bytes** | **249** |

**The 14 is exactly the audit's "14 had a main-photo URL".** Two independent
routes — an authenticated production query in the audit, and this source-side
reconciliation — arrive at the same number. That is strong corroboration that
production's photo coverage is not a migration defect but a faithful reflection
of which image files exist.

Across the whole corpus: 4,652 of 4,920 animals reference a photo, but only
1,104 of the 1,256 supplied files match a referenced path.

### What this means

**The photo gap cannot be closed by better matching.** Every one of the 249
records already resolves cleanly to a named file; those files are simply not in
the supplied folder. No fuzzy matching, case folding or name-based heuristic
would recover them, and attempting one would only risk attaching the wrong
animal's photograph.

A previous pass (`docs/evidence/legacy-import-20260906/animal-photo-results.md`)
matched 1,142 images. That figure is across all 5,144 staged animals — largely
historical and adopted records — not the public-facing 263.

### Deliverable

`docs/evidence/hkscda-revision/06-animal-photo-gap-2026-09-11.json` lists every
public-facing animal by reference number, species, programme membership and
source filename, split into `available` (14) and `missing` (249), each with its
reason. That is the missing-photo list the plan requires, and it is the precise
request to put to the association: **these 249 reference numbers need their
image files supplied.**

Available today: C4, C6, C24, C283, C391, D128, D129, D132, D133, D137, D186,
D292, D382, D385.

## What is blocked, and why

1. **Mapping source `code` to production UUIDs.** Requires reading production.
   Not attempted.
2. **Publishing recovered photographs.** Requires production write access and a
   release decision.
3. **Closing the gap for 249 animals.** Requires image files this session does
   not have. No substitute photograph and no generated image was used, and none
   should be.

## Honest status

§5.1 is delivered as far as the available inputs allow: the staging database is
rebuilt and idempotent, reference numbers are confirmed unique and usable as the
join key, names are confirmed unsafe, and the photograph gap is quantified by ID
with reasons and corroborated against the audit.

It is **not complete**, and cannot be from here. The remaining work is an asset
request to the association plus a production-side reconciliation, not further
engineering. Marking §5.1 done would misrepresent 249 animals as having
recoverable photographs when their files do not exist in anything supplied.
