# Phase 2 — End-to-End Acceptance Evidence

Recorded: 2026-09-11 · Branch `feat/hkscda-six-phase-revision`
Target: **isolated local Supabase stack** (API 55321 / DB 55322), app built and
served through `bun run preview`. Never the production project.

## Fixture

One animal seeded into the isolated stack with **dual eligibility** and a
complete public profile — the T06 scenario:

| Field | Value |
|---|---|
| id | `5a17e5ee-0000-4000-8000-00000000c376` |
| name / name_en | 荃海棠 / Tsuen Hoi Tong |
| adoption_eligible / sponsorship_eligible | true / true |
| public_profile.code | `C3761` |
| birthday · neutered · suitability | 2024-05-01 · true · newbie |
| personality · health · story | populated |

## T06 — edit once, display consistently

**Detail page** `/animals/cat/5a17e5ee-…c376` — every field a staff member can
now edit renders publicly:

| Field | Rendered |
|---|---|
| 荃海棠 (name) | present |
| C3761 (reference number) | present |
| 親人、愛撒嬌 (personality) | present |
| 需要定期檢查牙齒 (health) | present |
| 荃海棠在街上被發現 (story) | present |
| 已絕育 (neutered) | present |
| 適合新手 (suitability) | present |

Before this work **none of these eight fields was editable anywhere in the
admin**, so the Phase 2 outcome was unreachable regardless of the data.

**Both catalogues, one record.** The same UUID appears **exactly once** in each:

| Route | UUID occurrences | Cards | Name | Personality |
|---|---|---|---|---|
| `/animals/cat` | 1 | 1 | yes | yes |
| `/sponsors` | 1 | 1 | yes | yes |

One animal, two programmes, no duplicate record — the dual-eligibility contract.

## T10 — the card is no longer an avatar card

Measured in the live DOM, not inferred from CSS:

```
photoClasses    "animal-profile-photo animal-profile-photo-card public-animal-media"
photoBeforeName true          // the photograph leads the card
photoWidthPx    382           // on a 384px card: full width
photoHeightPx   286.5
aspectRatio     "4 / 3"       // computed — the previously dead rule now applies
```

Against the former fixed `88px × 88px`, that is roughly a nineteen-fold increase
in the area given to the animal. The `aspect-ratio: 4/3` declared on
`.public-animal-media` had never taken effect, being overridden by the later
88px rule; it is now applied through `.animal-profile-photo-card`.

## 助養區 entry points

Nav popover contents are **not** server-rendered, so a curl of the HTML shows no
`/sponsors` href — as it also shows none for `/about/cccp`, `/about/tnr` or
`/adoption/apply`. Checked in a real browser instead: the top-level 助養區 group
trigger is present in the header, and opening it renders **助養區小朋友** and
**立即助養**. Neither existed in the product before; 助養區小朋友 appeared
nowhere in the source at all.

## Gates

| Gate | Result |
|---|---|
| `bunx tsc --noEmit` | exit 0 |
| `bun test --isolate` (as CI runs) | 2105 tests · 2059 pass · 46 skip · **0 fail** |
| `bun run lint` | 0 errors |
| `bun run build` | exit 0, route tree current |
| `bun run test:rls` | 38 pass · 0 fail |
| `bun run test:db` | 37 pass · 0 fail |
| `bun run verify:brand` | 26 routes × 5 viewports, exit 0 |
| `bun run verify:a11y` | 26 routes, exit 0 |
| `bunx supabase db reset` | 56 migrations from zero, exit 0 |

`verify:performance` (Lighthouse) — **not run**.

## Notes on two false signals

Both cost time and are recorded so they are not re-diagnosed as defects:

1. **`/animals/cat` returned 0 bytes to curl.** A 307 redirect to the canonical
   filtered URL; `curl` without `-L` does not follow it. Not an application
   error.
2. **`test:rls` failed with duplicate `rls-test-*` users.** The suite seeds fixed
   email addresses and cleans up in `afterAll`, so any interrupted run leaves
   them behind and poisons every later local run until `supabase db reset`. CI is
   unaffected (fresh stack per run), but locally it is indistinguishable from a
   real failure. After a reset: 38 pass, 0 fail, and `auth.users` held zero
   leftover rows.

## Scope note

The fixture animal above lives only in the disposable local stack. No production
data was read or written at any point in this work.
