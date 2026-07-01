# Sponsorship Shortlist UI Design (助養 Multi-Select, UI-Only)

## Summary

Enable visitors to add multiple sponsor (助養) animals to the existing public
shortlist and act on them, matching the "shared shortlist" model from the
[public adoption and sponsorship journey blueprint](./2026-07-02-public-adoption-sponsorship-journey-design.md).

This is a **UI-only increment**. The shortlist reducer already supports the
sponsorship intent (`SPONSORSHIP_LIMIT = 10`, intent exclusivity, ranking); the
current UI simply never wires sponsor animals into it. This work exposes that
plumbing. It does **not** build the Phase 2 pledge/payment-proof backend — the
sponsorship call-to-action routes to the existing `/sponsors` payment-information
page.

## Current Context

- The shortlist reducer (`src/lib/publicAdoption/shortlist.ts`) already models two
  intents (`adoption`, `sponsorship`) with per-intent limits (adoption 3,
  sponsorship 10), intent exclusivity by animal id, and rank compaction.
- `ShortlistActionButton` returns `null` for any animal that is not a cat or dog
  and hardcodes `intent: "adoption"`, so sponsor animals can never be added.
- `AnimalCard` and `AnimalDetail` branch on `animal.type === "sponsor"` and render
  payment-information links (`立即助養 →`, `查看助養付款方式`) that route to
  `/sponsors`, bypassing the shortlist entirely.
- `ShortlistTray` counts 助養 items in its summary line but renders only 領養
  chips and only the `申請領養` (adoption) CTA.
- The adoption wizard (`ApplicationWizard`) already filters the shortlist to
  `intent === "adoption"` and cat/dog types, so sponsorship items cannot pollute
  an adoption application.
- On successful adoption submit, `ApplicationWizard` calls `clear()`, which wipes
  the **entire** shortlist — including any sponsorship items.

## Scope

Applies the existing adoption-shortlist pattern to the sponsorship intent:

1. Sponsor animals gain an add/remove shortlist button (replacing payment links).
2. The floating tray surfaces 助養 chips and a `開始助養` CTA.
3. Submitting an adoption application no longer discards sponsorship selections.

## Detailed Changes

### 1. Pure logic — `src/lib/publicAdoption/shortlist.ts` (TDD first)

Add two pure functions, unit-tested before wiring:

- `intentForAnimalType(type: ShortlistAnimalType): ShortlistIntent`
  - `"sponsor"` → `"sponsorship"`, `"cat"`/`"dog"` → `"adoption"`.
  - Single source of truth for the button's intent derivation.
- `removeIntentItems(items: ShortlistItem[], intent: ShortlistIntent): ShortlistItem[]`
  - Removes every item of the given intent and recompacts ranks for the
    remaining intent via the existing `compactRanks` helper.

No change to the existing `addShortlistItem` / limit logic — sponsorship support
(`SPONSORSHIP_LIMIT = 10`) is already present.

### 2. Shortlist context + provider

- `ShortlistContext.ts` (`ShortlistContextValue`): add
  `clearIntent: (intent: ShortlistIntent) => void`.
- `ShortlistProvider.tsx`: implement `clearIntent` using `removeIntentItems`.
  Keep the existing `clear()` (full wipe) for any future "clear all" affordance.

### 3. `ShortlistActionButton.tsx` — intent-aware

- Accept sponsor animals in addition to cat/dog. Keep a guard that the type is one
  of the three known shortlist types.
- Derive `intent` via `intentForAnimalType(animal.type)` and pass it to `addItem`.
- Labels:
  - adoption add: `加入領養清單`
  - sponsorship add: `加入助養清單`
  - shared remove state: `已加入，按此移除`
- The `compact` styling variant is unchanged.

### 4. `AnimalCard.tsx` + `AnimalDetail.tsx` — sponsor uses the button

Per the approved "add-to-list only" decision, for `animal.type === "sponsor"`
render `<ShortlistActionButton animal={animal} … />` in place of the current
payment-information links. Users reach payment methods via the tray CTA after
shortlisting. Cat/dog rendering is unchanged.

### 5. `ShortlistTray.tsx`

- Render removable 助養 chips alongside the existing 領養 chips, visually
  distinguished (a distinct chip treatment) and capped at the first 4 shown so the
  tray stays lightweight on mobile; the summary line (`領養 X，助養 Y`, which
  reflects the true total) is unchanged. Adoption chips keep their existing cap of
  3.
- CTAs are independent:
  - `申請領養` shown when adoption items exist (existing behaviour, unchanged).
  - `開始助養` shown when sponsorship items exist, rendered as a
    `<Link to="/sponsors">`.
  - Both CTAs appear together when both intents are present.

### 6. `ApplicationWizard.tsx` — preserve sponsorship on submit

Replace the `clear()` call after a successful adoption submission with
`clearIntent("adoption")` so any queued 助養 items survive. The adoption draft
cleanup (`ADOPTION_DRAFT_STORAGE_KEY` removal) is unchanged.

## Error Handling / Edge Cases

- Adoption limit (3) and sponsorship limit (10) messaging is already handled by
  `addShortlistItem`; sponsor animals reuse it unchanged.
- Because sponsor animals are a distinct record type from cat/dog adoption
  animals, a single animal cannot realistically flip intents; the reducer's
  existing exclusivity guard remains as a safety net.
- Local-storage persistence and the degraded-mode warning are unchanged.

## Testing Plan (bun test, TDD)

- `intentForAnimalType`: maps sponsor → sponsorship, cat/dog → adoption.
- `removeIntentItems`: removes only the target intent, preserves and recompacts
  the other intent's ranks, and is a no-op when the intent is absent.
- Sponsorship add path: adding a sponsor animal succeeds and the 10-item limit is
  enforced (extend existing `shortlist.test.ts` coverage if not already present).

UI wiring is kept thin so the meaningful logic lives in these tested pure
functions.

## Out of Scope

- Sponsorship pledge records, monthly tiers, payment-proof upload, pledge states,
  and staff confirmation (Phase 2 backend).
- A dedicated sponsorship submit endpoint or status page.
- Admin sponsorship surfaces.
- `donate.tsx` — its `助養動物` value is a donation-purpose tag, unrelated to
  animal selection, and is untouched.
- Bilingual copy for the tray/cards; these components remain zh-HK, consistent
  with their current state.

## Design Defaults

- Reuse the existing shortlist reducer and its 10-item sponsorship limit.
- Derive intent from animal type through one shared helper.
- Sponsorship CTA routes to the existing `/sponsors` payment-information page.
- Clear only the adoption intent on adoption submit; keep a full `clear()` for
  future use.
