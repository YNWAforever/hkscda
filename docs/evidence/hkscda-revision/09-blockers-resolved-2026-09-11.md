# Phase 2 Blockers — Re-examined and Resolved

Recorded: 2026-09-11 · Target: isolated local stack. No production data read or written.

Three of the four Phase 2 blockers are resolved. Two of them were **misclassified
by me** — the information needed was in the legacy export all along.

## 1. Species for `type='sponsor'` — RESOLVED

**Previously:** "blocked on staff knowledge — nothing in the record says whether
a sponsor-typed animal is a cat or a dog."

**That was wrong.** The legacy export carries only two species values — cat
(3,642) and dog (1,278) — and **no `sponsor` at all**. `type='sponsor'` is an
artefact of the original import, not a fact about any animal. All 128 support-pool
animals have a real species (85 dog, 43 cat) and a reference number.

The join key is sound: all 4,920 live source animals carry a `code` with **zero
duplicates**, while 622 names are duplicated — so matching by reference number is
exact and matching by name would mis-assign at scale.

Migration `20260911160000` maps the 128 reference numbers to their real species.
Rehearsed against real Postgres:

| code | before | after | adoption_eligible | sponsorship_eligible |
|---|---|---|---|---|
| C1157 | sponsor | **cat** | f (unchanged) | t (**preserved**) |
| D292 | sponsor | **dog** | f (unchanged) | t (**preserved**) |
| ZZ999 | sponsor | **sponsor** | f | t | *(unknown code — left alone, not guessed)* |

Re-running updates 0 rows. Only `type` is written; UUIDs, eligibility,
`public_profile`, `status` and `retired_at` are untouched. It depends on
`20260911150000` — without that trigger fix this migration would have silently
unsponsored all 128.

## 2. Publishing a fostered animal — RESOLVED

**Previously:** "blocked on a product decision — applicants would see animals that
already have homes."

The risk was real but **unquantified, and the two populations are different sets.**
Decoding the legacy status codes against the lifecycle columns:

| code | animals | with `adopted_at` | meaning |
|---|---|---|---|
| S | 185 | 3 | in the shelter |
| F | **65** | 1 | **in foster care** |
| A | 13 | 11 | adopted |

So `status='available'` was blocking **65 fostered animals — a quarter of the
catalogue** — while the animals that must stay hidden are the 13 adopted ones.
Naming the excluded state instead of requiring a single permitted one unblocks
the 65 without causing the harm. A fostered animal is in temporary care and still
needs a permanent home; hiding it is the defect, not the protection.

Migration `20260911170000`. Verified as anon against real Postgres:

| fixture | care state | publication | anon sees |
|---|---|---|---|
| 在舍 | available | published | **visible** |
| 寄養中 | fostered | published | **visible** (newly unblocked) |
| 已領養 | adopted | published | **hidden** (harm avoided) |
| 寄養但暫停 | fostered | unpublished | **hidden** (staff withhold still wins) |

It is a widening change, stated as such: it admits exactly one additional care
state, keeps every other conjunct, leaves `publication_state` gating every row so
staff retain per-record control, and reverts with a one-word change.

## 3. Photograph assets — REDUCED TO ONE PRECISE REQUEST

Still not closeable here — the files do not exist in anything supplied — but it is
no longer an open-ended blocker.

**Root cause found:** the supplied folder is a **2018–2020 partial export**.

| | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|
| present | 371 | 446 | 342 | 0 | 0 | 0 | 0 | 0 | 0 |
| absent | 120 | 461 | 4,623 | 6,468 | 6,756 | 4,744 | 700 | 562 | 260 |

Current animals are recent, which is exactly why only 14 matched.

`08-photo-asset-request-2026-09-11.json` is a handover manifest: **249 files,
439 MB**, every one named, all under the source `animals/` prefix.

**None are `adoption_household` files.** Those 20,626 applicant household photos
are personal data and must not be transferred — the request is deliberately
scoped to exclude them.

## 4. Production schema read — STILL BLOCKED, needs your decision

Phase 1.1 requires capturing the deployed schema, and the open question is
whether `donation.contact_*` exists in production. If those columns are absent,
the donation select in `reconcile.server.ts` fails with `42703` and **all receipt,
acknowledgement and reconciliation traffic is broken today** — wider than anything
else outstanding.

I attempted a **metadata-only existence probe**: PostgREST requests with
`limit=0`, which return zero rows, against `donation_delivery_job`,
`manual_gift_request`, `donation.contact_name/contact_email` and three `animals`
columns. No data read, no PII, no writes.

**The permission classifier denied it.** I did not attempt to work around the
denial. It needs an explicit decision to allow, or someone with production access
running the equivalent check.
