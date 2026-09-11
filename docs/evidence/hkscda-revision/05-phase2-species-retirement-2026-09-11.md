# Phase 2 — Retiring the Legacy `type='sponsor'` Species

Recorded: 2026-09-11 · Migration `20260911150000_preserve_eligibility_on_species_change.sql`
Target: **isolated local Supabase stack** (DB 55322). No production data touched.

## What blocked this

The plan requires species to be cat or dog only, with sponsorship expressed as
eligibility. Retiring the legacy `'sponsor'` value therefore means correcting
each such animal to its real species.

Doing that was **destructive**. `set_animal_catalog_membership_defaults`
(migration `20260906162436`) had an UPDATE branch firing whenever `type` moved
into or out of `'sponsor'` while both eligibility flags were unchanged:

```sql
NEW.adoption_eligible    := (NEW.type IN ('cat','dog'));
NEW.sponsorship_eligible := (NEW.type = 'sponsor');
```

That is exactly what a staff member correcting a species does — change the
species, leave the eligibility checkboxes alone.

### The defect, demonstrated before the fix

A sponsorship animal (`adoption_eligible=false`, `sponsorship_eligible=true`)
corrected from `sponsor` to `cat`:

| type | adoption_eligible | sponsorship_eligible | outcome |
|---|---|---|---|
| cat | **t** | **f** | **SILENTLY UNSPONSORED** |

The routine correction removed the animal from the sponsorship catalogue —
possibly one supporters were already paying for — with no error and no warning.

### After the fix, identical scenario

| type | adoption_eligible | sponsorship_eligible | outcome |
|---|---|---|---|
| cat | f | **t** | **membership preserved** |

And the two behaviours that had to survive:

- staff changing membership explicitly still works (`adoption_eligible` → `t`)
- the INSERT default still derives when a caller states nothing
  (`dog` → `adoption_eligible=t, sponsorship_eligible=f`)

The UPDATE branch was removed rather than adjusted. Eligibility is now set
explicitly by the CMS on every save, so deriving it from a species change is not
just unnecessary but wrong: **correcting a record's species is not a statement
about which programmes it belongs to.**

No row was modified by the migration; it changes only future updates, and it is
idempotent.

## What remains, and why it is not automatable

Species **cannot be derived** for the remaining `type='sponsor'` rows. Nothing in
the record says whether the animal is a cat or a dog, and guessing from a name is
precisely the incorrect matching the plan forbids ("Prioritise IDs/reference
numbers; use names only as supporting evidence... Do not automatically make
incorrect matches").

So this is delivered as a **verification queue**, not an automatic migration. The
admin list reports how many records still carry the placeholder and states that
changing the species will not affect catalogue membership — which is now true,
and was the thing making the correction unsafe.

Tightening the CHECK constraint to `('cat','dog')` is a **follow-up that cannot
run until the queue is empty**, and emptying it requires staff knowledge this
session does not have. Recorded rather than attempted.

## Gates

`bunx supabase db reset` applied **58** migrations from zero, exit 0.
