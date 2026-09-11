# Phase 2 — Completion Assessment

Recorded: 2026-09-11 · Branch `feat/hkscda-six-phase-revision`

Phase 2's stated outcome: *"Staff edit one animal record, and the public website
consistently displays its large photos, age, personality, and story. Restore
clear entry points for the Sponsorship Area (助養區) and Animals Available for
Sponsorship (助養區小朋友)."*

## Verdict

**Code Complete / Assets Pending.**

Every part of Phase 2 that is an engineering problem is delivered and verified.
What remains is not engineering: it needs image files the association has not
supplied, a product decision, and production database access.

Using the plan's own vocabulary, Phase 2 is **not** formally passed, because
§5.1's asset work cannot be completed from here and §5.6 requires "every homepage
feature must have the correct approved original photo".

## Delivered and verified

| §  | Requirement | Evidence |
|---|---|---|
| 5.2 | Unified animal CMS, dual eligibility editable | admin/public predicate parity test; `3f79f02` |
| 5.2 | Public profile editable — the 8 fields the site renders | writer validated *through the reader*; DB CHECK exercised directly; `ad2084c` |
| 5.2 | Search by name **and** reference number (T06) | `C3761` and `荃海棠` return the same row id; `c258cbf` |
| 5.2 | Archived retrievable, not public by default | toggle + predicate tests; `c258cbf` |
| 5.2 | Publication separate from care state and archival | strictly-narrowing migration, measured; anon withhold/republish with `status` untouched; `6289de9` |
| 5.2 | Species correction no longer destroys membership | defect demonstrated then fixed against real Postgres; `52d9509` |
| 5.3 | Immutable photo path; failed save preserves the photo | `dd101e3` — plus the `animal-images` bucket, which no migration had ever created |
| 5.4 | Photo-led cards, not 88px avatars | live DOM: 382×286.5px on a 384px card, computed `aspect-ratio: 4/3`; `957ca2d` |
| 5.4 | Top-level 助養區 and 助養區小朋友 | verified in a real browser; `957ca2d` |
| 5.4 | Homepage features only animals with photographs | `07b6802` |
| 5.5 | Implementation commentary removed from public copy | `f642e71` |
| 5.1 | Source mapping; missing-photo list by ID with reasons | `bc7f245` |

Acceptance cases exercised end-to-end against a real database and a served
build: **T06** (one record, two identifiers; same UUID once in each catalogue),
**T07** (failed save cannot damage the public photo), **T10** (card anatomy
measured in the live DOM), **T11** (legacy entry points).

## Not delivered, with the reason

### 1. Photographs for 249 animals — **blocked on assets**

All 263 public-facing animals reference a photo and every reference resolves;
only **14** of those files exist in the supplied folder. That 14 matches the
audit's independently-measured count exactly.

This cannot be closed by better matching — the files are absent, not
mis-matched. The list of 249 reference numbers is the request to put to the
association. No substitute or generated image was used, and none should be.

**Consequence:** §5.6's "every homepage feature must have the correct approved
original photo" is satisfiable only for 14 animals today. The homepage now
features only those, rather than padding with placeholders.

### 2. Publishing a non-available animal — **blocked on a decision**

`publication_state` separates publication from care state, but the public policy
still requires `status='available'`, so a fostered animal cannot be shown.
Relaxing that is a **widening** change: records currently hidden would become
public and applicants would see animals that already have homes. The exact diff
is in migration `20260911140000`'s closing comment, for approval on its own
merits.

### 3. Retiring `type='sponsor'` — **blocked on staff knowledge**

The destructive trigger is fixed, so correcting a species is now safe and the
admin list reports how many records still carry the placeholder. But species
**cannot be derived** — nothing in the record says cat or dog, and with 622
duplicate names in the source, guessing would mis-assign at scale. Tightening the
CHECK to `('cat','dog')` can only follow an empty queue.

### 4. Demonstration-content inventory (§5.5) — **blocked on production access**

Four of the seven named demo items appear nowhere in source, so the inventory
must be built from the database. Not read in this session.

### 5. Animal revision history and a `*_with_audit` write path — **not started**

`publication_state` provides the states, but there is no revision table, no
preview, and the editor remains the documented browser-direct legacy exception.
This is engineering work that was not reached, not a blocker — the honest
category is "not done", not "blocked".

## Gate results at this commit

| Gate | Result |
|---|---|
| `bunx tsc --noEmit` | exit 0 |
| `bun test --isolate` | 2122 tests · 2076 pass · 46 skip · **0 fail** |
| `bun run lint` | 0 errors |
| `bun run build` | exit 0, route tree current |
| `bun run test:rls` | 38 pass · 0 fail |
| `bun run test:db` | 37 pass · 0 fail |
| `bun run verify:brand` | 26 routes × 5 viewports, exit 0 |
| `bun run verify:a11y` | 26 routes, exit 0 |
| `bunx supabase db reset` | 58 migrations from zero, exit 0 |

`verify:performance` — not run.
