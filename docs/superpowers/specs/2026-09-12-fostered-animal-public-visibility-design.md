# Fostered-animal public visibility — design

Date: 2026-09-12 · Phase 3 follow-up (part of the remaining open list in
`docs/evidence/hkscda-revision/16-phase3-assignments.md`)

## Why

`20260911170000_publish_fostered_animals.sql` widened the public RLS policy on
`public.animals` from `status = 'available'` to `status in ('available',
'fostered')`, and is already applied to production
(`docs/evidence/hkscda-revision/18-full-catchup-applied-to-production.md`).
The database has permitted this for a while. The application never followed:
every public-facing read still hard-codes `status = 'available'`, so the ~65
fostered animals that migration was written to reveal remain invisible on the
live site. A fostered animal is in temporary care and still needs a permanent
home — that is what fostering is; hiding it from the catalogue is the defect
the migration set out to fix, and the application layer is the reason it
hasn't landed yet.

Evidence 16 named five call sites still filtering `status = 'available'`.
Reading them for this design turned up a sixth: `isPublicAnimalMember` in
`src/lib/animals/publicListing.ts:19`, the shared in-memory predicate that the
main listing pipeline (`buildPublicAnimalListing`) and `eligibility.server.ts`
both depend on. Fixing only the five DB-query sites would still leave fostered
animals filtered out at this second gate.

## What "publicly visible" means here

Two scope decisions, made explicit because the code alone can't answer them:

- **The homepage impact counters count fostered animals as available.**
  `publicImpact.functions.ts`'s "X cats available for adoption" figure moves to
  the same status list as every other public read — one definition of
  "available" everywhere, not a shelter-only variant.
- **No visual distinction in public UI.** A fostered animal's card and profile
  render identically to a shelter animal's — no badge, no copy change. The
  migration's own reasoning is that a fostered animal *is* available; this
  design treats that as literal, not as "available with an asterisk."

## Changes

No migration. RLS already permits `fostered`; this closes the gap behind it —
six existing files, each a narrow swap from a single hard-coded status to a
shared two-value list.

**New: `src/types/animal.ts`**
- `PUBLIC_VISIBLE_ANIMAL_STATUSES = ["available", "fostered"] as const`
- `isPubliclyVisibleStatus(status: AnimalStatus): boolean`

Colocated with `AnimalStatus` itself rather than with any one consumer, since
it's a property of the type, not of any single call site — and named after the
excluded state's absence, the same reasoning the migration's own comment gives
for admitting states by name rather than requiring one permitted value: a
future third status doesn't require another six-site hunt.

**Six call sites, each swapped to the shared list:**

| File | Function | Before | After |
|---|---|---|---|
| `publicListing.ts:19` | `isPublicAnimalMember` | `animal.status !== "available"` | `!isPubliclyVisibleStatus(animal.status)` |
| `publicListing.server.ts:18` | `readPublicAnimals` | `.eq("status", "available")` | `.in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)` |
| `eligibility.server.ts:14` | `readEligibleAnimals` | `.eq("status", "available")` | `.in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)` |
| `publicAnimal.functions.ts:21` | `getPublicAnimal` | `.eq("status", "available")` | `.in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)` |
| `publicImpact.functions.ts:24` | `countAvailable` | `.eq("status", "available")` | `.in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)` |
| `routes/sitemap[.]xml.ts:49` | sitemap query | `.eq("status", "available")` | `.in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)` |

No other conjunct on any site changes (`retired_at is null`, the eligibility
booleans, `type` filters) — this is scoped to the one axis the migration
itself widened.

## Data flow

No shape change. No new field reaches a response that didn't already carry it;
no API contract changes. RLS already returns fostered rows to the anon role —
this only stops the application layer from discarding them again after RLS
already let them through. A fostered animal reaches the same card/profile
rendering path an available animal already uses today.

## Error handling

None new. Every site's existing throw-or-propagate behavior on a Supabase
error is untouched; this changes only the filter predicate, not control flow.

## Testing

- `publicListing.test.ts` (exists) — add cases to `isPublicAnimalMember`:
  fostered + eligible → member; adopted → still excluded (pinning that this
  change is additive, not a general loosening).
- `eligibility.server.test.ts` (exists) — extend for a fostered animal passing
  eligibility for both adoption and sponsorship intents.
- `publicListing.server.ts`, `publicAnimal.functions.ts`,
  `publicImpact.functions.ts`, and the sitemap route have no dedicated test
  file today (confirmed absent). Add one focused unit test per site against a
  fake Supabase client, asserting the query predicate includes `fostered` —
  matching this codebase's existing DI-testing convention for `.server.ts`
  files.
- One RLS-level test, new: `supabase/rls-tests/` has no file covering the
  public `animals` policy at all, even though `20260911170000` changed it.
  The policy itself isn't changing in this slice, so this sits slightly
  outside a strict reading of scope — but it's the one place that locks in
  "the anon role really can read a fostered, published, eligible row end to
  end," rather than only that the TypeScript predicate agrees with itself.
  Included as one small addition, not a general RLS audit of the `animals`
  table.

## What this does not do

- Does not add any public UI indicator for foster status (explicit decision
  above).
- Does not touch admin surfaces — `AnimalPipeline`, `AnimalForm`, `MatchPanel`
  and friends already know about `fostered` (confirmed: it appears in their
  source today) and are unaffected by this change.
- Does not revisit the other conjuncts of the public RLS predicate
  (`publication_state`, the eligibility booleans, `retired_at`) — those are
  unchanged and out of scope here.
- Does not address any other item from the Phase 3 open list (sponsorship
  receipts, the animal-picker UUID box, the pledge-list needs-attention
  indicator, `cancel_sponsorship_pledge`'s bulk-reject behaviour, or the
  unscoped §6.1/§6.3 remainder). Those remain separate, independent
  follow-ups.
