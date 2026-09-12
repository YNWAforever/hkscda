# Phase 3 — the monthly sponsorship ledger

Branch `feat/hkscda-phase3-sponsorship` · rehearsed 2026-09-11/12 against the
isolated local stack (API `127.0.0.1:55321`, DB `127.0.0.1:55322`).
**Nothing in this record was applied to production.**

## What the plan asks for

| Plan | Requirement |
|---|---|
| §6.2 | pledge / assignment / period / allocation kept apart; "Do not combine preferences, confirmed assignments, and payment into one status field" |
| §6.2 | "The total allocated to months must not exceed the verified payment amount available for allocation. Store integer cents." |
| §6.2 | "While a pledge remains active, add payments for new months directly; do not reopen or duplicate the pledge." |
| §6.2 | "Handle revisions/refunds through traceable adjustments rather than overwriting past receipts of payment." |
| §6.3 | "monthly allocations reference existing payments without duplicate accounting"; "Preserve 123.45 as 123.45" |
| §6.4 | "one complete two months plus one top-up payment, then test advance payment/refunds. Amounts, months, confirmed relationships, and receipts must agree." |
| §6.4 | "one-off payments must not show '/month'" |
| §3.1 | "Database transactions are the final authority for capacity and financial consistency." |

## What was built

Two slices, each its own commit.

**Slice A — the second month** (`20260911180000_sponsorship_second_month.sql`).
Recording and reviewing a payment were both gated on `sponsorship_pledge.status`,
at three layers. Once month one was approved the pledge was `active` forever, so
month two could be neither recorded nor reviewed. Review now depends on the
proof's own `review_status`, and an active pledge is not knocked back to
`provisional` by a new month's payment.

Rehearsal also exposed a second defect: review selected `order by created_at desc
limit 1` and asked "is the newest proof pending?". Once months accumulate that
strands rows — an older pending proof can never become the newest again, so no
later review reaches it. Review now takes the oldest proof still pending.

**Slice B — periods and allocations** (`20260911190000_sponsorship_monthly_ledger.sql`).
`sponsorship_payment_proof.payment_date` is the date money moved, not the month
it pays for, so which month a payment settled was neither stored nor derivable.
Two proofs in September could equally be September twice or September and
October. Adds `sponsorship_period` (one month, its commitment) and
`sponsorship_payment_allocation` (attribution of an approved payment to a month).

An allocation is attribution, never revenue: the payment row stays the single
accounting record, so allocating HK$100 across two months cannot become HK$200
of income.

## Invariants, and the proof that each holds

Each was exercised against real Postgres. `RESET=0`, 62 migrations applied from
zero.

| # | Invariant | Attempt | Result |
|---|---|---|---|
| 1 | only an approved payment may be allocated | allocate a `pending` proof | `ERROR: Payment proof … is not approved; only a verified payment may be allocated to a month` |
| 2 | total allocated ≤ the payment | allocate 20000 from a 10000 payment | refused; **0 allocations and no month created** — the whole RPC rolled back |
| 3 | a payment stays within its own pledge | insert an allocation joining pledge 2's payment to pledge 1's month | `ERROR: Allocation would attribute a payment from pledge … to a month of pledge …` |
| 4 | the ledger is append-only | `update` an allocation | `ERROR: sponsorship_payment_allocation is append-only (attempted update); record a reversal row instead` |
| 4 | " | `delete` an allocation | `ERROR: … (attempted delete); record a reversal row instead` |
| — | idempotent retry | allocate the same payment twice | second call returns `already_allocated`; **1 allocation row, not 2** |
| — | double reversal | reverse the same allocation twice | `ERROR: Allocation … has already been reversed` |

### Atomicity (§3.1)

Approval and attribution commit in **one** transaction. The review RPC gained a
fifth parameter with a default, so the previous four-argument call still resolves
and allocates nothing.

Proven by forcing an invalid allocation during an approval:

```
review_sponsorship_payment_proof(..., 'approve', ..., '[{"periodMonth":"2026-10-01","amountCents":99999}]')
  -> ERROR (exceeds the payment)
  proof M3 review_status after the failure: pending      <- approval rolled back with it
  months (October must NOT exist): 2026-08              <- no half-opened month
```

Two transactions would have left money approved but attributed to no month, and
a crash inside that window would have made it permanent.

## The §6.4 money journey

Two isolated sponsors, HK$100/month each.

| Sponsor | Journey |
|---|---|
| 1 | month 1 HK$100 → month 2 HK$60 (partial) → top-up HK$40 |
| 2 | one HK$300 payment covering three months in advance |

```
  sponsor  |  month  | committed | paid  | payments
-----------+---------+-----------+-------+----------
 sponsor 1 | 2026-08 |     10000 | 10000 |        1
 sponsor 1 | 2026-09 |     10000 | 10000 |        2   <- partial + top-up
 sponsor 2 | 2026-08 |     10000 | 10000 |        1
 sponsor 2 | 2026-09 |     10000 | 10000 |        1
 sponsor 2 | 2026-10 |     10000 | 10000 |        1   <- paid in advance

  sponsor  | received_cents | attributed_cents
-----------+----------------+------------------
 sponsor 1 |          20000 |            20000
 sponsor 2 |          30000 |            30000
```

Received equals attributed for both: nothing double-counted, nothing lost.

Separately, the second-month journey on one pledge: month 1 record → `provisional`
→ approve → `active`; month 2 record → **stays `active`** → approve → `active`;
top-up recorded and approved on the active pledge. 3 proofs / 25000 cents /
**1 pledge** / 6 audit rows — the pledge is neither reopened nor duplicated.

Refund: reversing an allocation returned the month to `paid 0 / outstanding
10000` while **keeping both rows** (2 rows for that payment), so what happened
and what undid it both stay legible.

## Two display defects found and fixed

Both are named requirements, and both were live in the sponsorship admin UI:

- **`/月` on one-off payments.** `amountLabel` appended `/月` to every amount,
  including individual payments in the review panel and the proof history. A
  HK$300 payment covering three months is not a HK$300/month sponsorship. Split
  into `monthlyAmountLabel` (the pledge's rate, keeps `/月`) and
  `paymentAmountLabel` (a payment, no `/月`).
- **Cents silently dropped.** `Math.round(amountCents / 100)` rendered HK$123.45
  as HK$123, in both the drawer and the review lane. Both now use the existing
  `centsToHkd`, which shows decimals only when there are cents.

## What is NOT done

Stated plainly, because the §6.4 gate is not fully met:

- **Confirmed supporter–animal assignments do not exist.** `sponsorship_preference`
  is an intention ranking written once at submission and never confirmed, so
  "two isolated test sponsors for the **same animal**" cannot be demonstrated.
  The money half of that gate passes; the relationship half does not.
- **No receipt is issued for a sponsorship payment.** A sponsorship payment never
  becomes a `donation`/`payment` row, and `public.issue_receipt` is keyed on
  `donation_ids[1]`, so it cannot fire. The bridge to reuse is
  `record_manual_gift_with_audit` — which is itself in one of the three
  migrations **not applied to production**.
- **A payment larger than 24 months is refused, not partially attributed.** The
  approval throws with the shortfall named. Deliberate: absorbing part of a
  supporter's payment silently is worse than making a person decide.
- **`cancel_sponsorship_pledge` still bulk-rejects every pending proof** for the
  pledge. Untouched here; noted for the cancellation/termination slice.

## Gates

Run on the full tree, not scoped to changed files.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bunx tsc --noEmit` | 0 |
| Lint | `bun run lint` | 0 errors (41 pre-existing `react-refresh` warnings) |
| Tests | `bun test --isolate` | 2118 pass, 46 skip, **0 fail** (2164 across 330 files) |
| RLS | `bun run test:rls` | 38 pass, 0 fail |
| Database | `bun run test:db` | 37 pass, 0 fail |
| Build | `bun run build` | 0 |
| Migrations | `bunx supabase db reset --local` | exit 0, 62 applied from zero |

## Deployment position

Both migrations are **unapplied to production**, and they queue behind the three
already-unapplied migrations recorded in
`10-production-schema-reconciliation-2026-09-11.md`. The required order is
unchanged: `20260905144848` → `20260905155357` → `20260905163900` →
`20260911*` → application code.

No release is proposed here.
