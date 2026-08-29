# Privacy-Safe Adoption-Impact Aggregate (BP-1) Design

**Status:** Approved, ready for planning.

## Problem

`/report/adoption` currently shows a static "not published yet" state. Its own code comment (defect G-04 / blocker P0-05) explains why: the page used to query `animals` where `status = 'adopted'` through the anonymous Supabase client, but the anon RLS policy only exposes `status = 'available'` rows, so the query could only ever return empty. Rather than publish a fabricated zero, the page was changed to state the figures aren't published yet.

The same root cause exists on the homepage. `src/lib/animals/publicImpact.functions.ts`'s `getPublicImpactItems` also queries `animals` where `status = 'adopted'` through the anon client, for the "已領養貓貓" / "已領養狗狗" stat cards. Those counts are always empty for the same RLS reason, and `buildPublicImpact` silently drops non-positive values — so the two cards simply never render. No one filed this as a defect because the failure is silent.

Both are fixed by the same underlying change: a privacy-safe, server-side aggregate over the authoritative `successful_adoption` table (granted only to `authenticated`/service-role, never to `anon`), which the anonymous client structurally cannot query.

## Scope

**In scope:**
- A new server-side repository function aggregating `successful_adoption` (joined to `animals.type` for species), using the service-role client inside a `.server.ts` file.
- A real loader and UI for `/report/adoption`: a running lifetime total, plus a trailing-12-months count list.
- Fixing the homepage's `adoptedCats`/`adoptedDogs` stat cards to source from the new aggregate instead of the broken anon query.
- Distinct "temporarily unavailable" vs. today's "not published yet" copy on `/report/adoption`, since after this change the data genuinely is published — a runtime fetch failure is a different situation than never having a data path at all.

**Out of scope (explicitly deferred):**
- Species breakdown in the `/report/adoption` monthly list (decided: species-agnostic monthly counts; species split stays homepage-only, as lifetime totals).
- Any chart/graph visualization — stat cards + a plain list, matching the existing design system, no new charting library.
- Any RLS policy or migration change. The service-role client legitimately bypasses RLS for a read; `successful_adoption`'s grants stay exactly as they are.
- Any change to `/report/audit`, admin-side reporting, or the coordinator's own adoption dashboards.
- Any minimum-count suppression threshold. The aggregate publishes only counts and month labels — no adopter ID, animal ID, case number, or fee ever leaves the server function — so the page's existing promise ("不公開任何可識別領養者身分的資料") is satisfied by the shape of the data itself, not by hiding small numbers.

## Architecture

Data flow, following this codebase's established layered pattern (`repository.server.ts` → `service.ts` → consumers):

```
successful_adoption (successful_adoption, joined to animals.type)
  └ src/lib/adoptions/publicImpactRepository.server.ts   NEW — service-role query only
      └ src/lib/adoptions/publicImpact.ts                 NEW — pure shaping functions
          ├─ src/lib/animals/publicImpact.functions.ts    MODIFIED — adopted counts now real
          └─ src/routes/report/adoption.tsx                MODIFIED — new loader + UI
```

### `src/lib/adoptions/publicImpactRepository.server.ts` (new)

Service-role-only. Two queries against `successful_adoption`:
- Lifetime count grouped by `animals.type` (`cat` | `dog`), via a join on `animal_id`.
- Trailing-12-months count grouped by `date_trunc('month', approval_date)`, species-agnostic.

Returns raw `{ species: "cat" | "dog"; count: number }[]` and `{ month: string; count: number }[]` — nothing else. No adopter, animal, or case-level fields are selected at all, so there is nothing identifying to accidentally leak even if a caller mishandled the result.

### `src/lib/adoptions/publicImpact.ts` (new)

Pure functions, no Supabase import, mirroring the existing `buildPublicImpact` pattern in `lib/animals/`:
- `buildAdoptionImpactReport(monthlyRows, asOf)` — zero-fills the trailing 12 months (including months with no adoptions, so the list is always exactly 12 entries), formats zh-HK month labels, computes the lifetime total.
- Species-total shaping reuses the existing `buildPublicImpact` shape directly — `publicImpactRepository.server.ts`'s species counts feed straight into it as `adoptedCats`/`adoptedDogs`.

### `src/lib/animals/publicImpact.functions.ts` (modified)

`getPublicImpactItems`'s `countAnimal("cat"|"dog", "adopted")` anon calls are replaced by one call to the new repository's species-totals query. `availableCats`/`availableDogs` (already correct, since `available` rows are anon-visible) are untouched. `buildPublicImpact` and the homepage card markup need no changes.

### `src/routes/report/adoption.tsx` (modified)

Gains a real `loader`, wrapped in the same `resilientPublicLoader` pattern already used by `stories.tsx` and other public routes, so a runtime failure degrades gracefully instead of throwing a 500. The static `PublicStateShell` "暫未發佈" block is replaced by:
- A stat card showing the lifetime total (visually matching the homepage's existing stat-card style).
- A plain 12-row list: month label → count.

On loader failure, the page shows a **"暫時未能載入" (temporarily unavailable)** state — distinct from the removed "暫未發佈" (not yet published) copy, since those are now different, non-interchangeable situations. The existing "統計口徑" methodology chapters and the CTA to `/report/audit` are unchanged.

A genuine zero total is treated as a real, verified number and displayed as such (not suppressed) — only a fetch failure suppresses display, following the same "never publish an unverified or fabricated number" principle the page already states, just applied correctly now that a real data path exists.

## Testing

- `publicImpactRepository.server.test.ts` — injected fake Supabase client (this codebase's established DI pattern for repository tests); verifies correct grouping and the exact field set selected (asserting no adopter/animal/case identifying fields are ever requested).
- `publicImpact.test.ts` (new, `lib/adoptions/`) — pure tests for `buildAdoptionImpactReport`: zero-filling missing months, zh-HK month label formatting, total calculation.
- `lib/animals/publicImpact.test.ts` (existing, updated) — verifies `getPublicImpactItems` now sources adopted counts from the new repository call rather than the anon `animals` query.
- `src/routes/report/adoption.test.tsx` (new) — renders the page with mocked loader data; asserts the stat card and 12-row list render correctly, and that the failure state renders distinct copy from the old "暫未發佈" text.

## Success criteria

- `/report/adoption` shows a real, verified lifetime adoption total and a trailing-12-months list, sourced from `successful_adoption`.
- The homepage's "已領養貓貓"/"已領養狗狗" stat cards render real counts instead of silently disappearing.
- No RLS policy or migration change. No adopter-identifying, animal-identifying, or case-identifying field ever leaves the server boundary.
- A runtime fetch failure degrades to an honest "temporarily unavailable" state, distinguishable from a genuine zero and from the old "not published yet" state (which no longer applies once this ships).
