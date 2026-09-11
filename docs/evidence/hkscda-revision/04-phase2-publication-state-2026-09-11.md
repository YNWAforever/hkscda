# Phase 2 — Publication State Separated from Care State

Recorded: 2026-09-11 · Migration `20260911140000_animal_publication_state.sql`
Target: **isolated local Supabase stack** (DB 55322). No production data touched.

## The defect

`animals.status` carried two unrelated meanings at once. It is the care/case
record (`available` | `adopted` | `fostered`), and it was simultaneously the
public visibility switch, because the public RLS policy required
`status = 'available'`.

Consequences, both bad:

- Staff could not take a record off the public site without claiming the animal
  had been adopted or fostered — **falsifying a care record to achieve an
  editorial outcome**.
- A profile could not be prepared before going live: creating a record published
  it immediately, blank story and all.

## The change

`publication_state text NOT NULL DEFAULT 'published'`, CHECK
`('draft','published','unpublished')`, and one conjunct added to the public read
policy.

Verified against the live local database after `supabase db reset` applied all
**57** migrations from zero:

```
column     publication_state | text | NOT NULL | default 'published'
policy     (status = 'available') AND (retired_at IS NULL)
           AND (publication_state = 'published')
           AND (adoption_eligible OR sponsorship_eligible)
```

### It is strictly narrowing — measured, not asserted

```
old_predicate = 1
new_predicate = 1     -- identical
rows where publication_state <> 'published' = 0
```

The new predicate is the old one plus a conjunct, and the column default
backfilled every existing row to `published`. **Visibility immediately after the
migration equals visibility immediately before it.** No record that is private
today becomes public; no record that is public today disappears.

The CHECK rejects anything outside the three states (`publication_state='live'`
→ `violates check constraint "animals_publication_state_check"`).

### The new capability, exercised as the anon role

| Step | `status` | `publication_state` | rows visible to `anon` |
|---|---|---|---|
| initial | available | published | **1** |
| staff withhold | available | unpublished | **0** |
| staff republish | available | published | **1** |

`status` read `available` at every step — it was never modified. That is the
separation the plan asked for: withholding a record no longer requires lying
about the animal's care.

An index matching the policy was added (`animals_public_catalogue_idx`); the
table previously carried no index other than its primary key, despite the public
catalogues being the highest-traffic reads in the product.

## Deliberately not done

The migration does **not** relax `status = 'available'`, so a fostered animal
still cannot be shown publicly.

Relaxing it is a **widening** change: records currently hidden would become
public, and applicants would see animals that already have homes. That is a
product decision about what the public catalogues are for and what a visitor
seeing a fostered animal is being invited to do — not a schema tidy-up, and not
something to apply unilaterally. The required change is written out in the
migration's closing comment so it can be reviewed on its own merits.

**Consequence to be honest about:** the "publication independent of care state"
requirement is therefore only *half* delivered. Staff can now withhold and
prepare records, which is the safe half. Publishing a non-available animal
remains blocked pending that decision.

## New records default to draft

A newly created animal starts as `draft` rather than going live the instant it
is saved. Existing rows were untouched — the column default made them
`published`, which is what they already effectively were.
