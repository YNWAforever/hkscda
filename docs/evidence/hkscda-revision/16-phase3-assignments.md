# Phase 3 — confirmed supporter–animal assignments

Branch `feat/hkscda-phase3-sponsorship` · rehearsed 2026-09-12 against the
isolated local stack (API `127.0.0.1:55321`, DB `127.0.0.1:55322`).
**Nothing in this record was applied to production.**

This record completes the half of the §6.4 gate that
`13-phase3-monthly-ledger.md` had to leave open. That file proved the money;
it also stated plainly that "confirmed supporter–animal assignments do not
exist", so "two isolated test sponsors for the **same animal**" could not be
shown. That is what is shown here.

## What the plan asks for

| Plan | Requirement |
|---|---|
| §6.4 | "Use at least two isolated test sponsors for the **same animal**." |
| §6.4 | "Have one complete two months plus one top-up payment, then test advance payment/refunds. Amounts, months, confirmed relationships, and receipts must agree." |
| §6.2 | pledge / assignment / period / allocation kept apart; "Do not combine preferences, confirmed assignments, and payment into one status field" |
| §6.2 | an animal is not inventory: nothing may cap it at one sponsor |
| §3.1 | "Database transactions are the final authority for capacity and financial consistency." |

## What was built

One migration, `20260912120000_sponsorship_assignments.sql`.

`sponsorship_preference` is a wish list: ranked 1–10, written once by the
supporter at submission, never mutated by any RPC. Nothing recorded that the
association had **agreed** to it. So the database could say "this supporter
would like Cat A" and "this supporter has paid HK$200", but never "this
supporter sponsors Cat A" — which is the relationship §6.4 asks two sponsors to
share.

`public.sponsorship_assignment` is that fourth thing, alongside pledge, period
and payment. It carries **no amount**: a pledge's monthly commitment is not
divided per animal, so `sponsorship_period` and
`sponsorship_payment_allocation` are untouched and no second set of books
appears. It is a relationship, not money.

Three functions:

- `assign_sponsorship_animal_with_audit(pledge, animal, actor, note)` — confirms
  one animal, re-checking eligibility at the database even though the caller
  (`src/lib/sponsorshipAdmin/autoAssign.ts`) already checked.
- `end_sponsorship_assignment_with_audit(assignment, actor, reason, note)` —
  always a staff decision. There is deliberately no trigger that ends
  assignments when an animal is adopted or dies: the money keeps arriving and a
  person has to decide what happens to it.
- `review_sponsorship_payment_proof(..., p_assign_animal_id)` — a sixth,
  defaulted parameter. Approving a payment, attributing it to months, and
  confirming the animal now commit in **one** transaction.

The uniqueness is `(pledge_id, animal_id) where ended_on is null` — one open
assignment per supporter per animal, and deliberately **not** unique on
`animal_id`, because §6.4 requires two sponsors on one animal.

## Invariants, and the proof that each holds

Exercised against real Postgres after `bunx supabase db reset --local`
(exit 0, 63 migrations applied from zero). Each probe ran in its own
autocommitted statement, so a refusal could not be confused with a poisoned
transaction. Error text below is verbatim.

| # | Invariant | Attempt | Result |
|---|---|---|---|
| 1 | an **adopted** animal cannot be assigned | assign Cat A after it was adopted | `ERROR:  Animal 4a111111-1111-4111-8111-111111111111 cannot be sponsored` |
| 2 | a **deceased** animal cannot be assigned | assign Cat C (`animal_profile_internal.deceased_at` set) | `ERROR:  Animal 4c333333-3333-4333-8333-333333333333 cannot be sponsored` |
| 3 | a **retired** animal cannot be assigned | assign Cat D (`retired_at` set) | `ERROR:  Animal 4d444444-4444-4444-8444-444444444444 cannot be sponsored` |
| 4 | an **ineligible** animal cannot be assigned | assign Cat E (`sponsorship_eligible = false`) | `ERROR:  Animal 4e555555-5555-4555-8555-555555555555 cannot be sponsored` |
| 5 | an **unpublished** animal cannot be assigned | assign Cat F (`publication_state = 'unpublished'`) | `ERROR:  Animal 4f666666-6666-4666-8666-666666666666 cannot be sponsored` |
| 6 | a **cancelled** pledge cannot be assigned to | assign to a pledge with `status = 'cancelled'` | `ERROR:  Sponsorship pledge is already cancelled` |
| 7 | one **open** assignment per (pledge, animal) | assign the same pair twice | `ERROR:  duplicate key value violates unique constraint "sponsorship_assignment_one_open_per_animal"` · `DETAIL:  Key (pledge_id, animal_id)=(3c333333-…, 4b222222-…) already exists.` |
| 8 | ending twice is refused | end the same assignment again | `ERROR:  Sponsorship assignment is already ended` |
| 9 | a non-staff actor is refused | assign as an active **treasurer** | `ERROR:  Actor 19999999-9999-4999-8999-999999999999 is not an active staff/admin user` (errcode `42501`) |
| 9 | " | end as an actor with **no `admin_user` row** | `ERROR:  Actor 99999999-9999-4999-8999-999999999999 is not an active staff/admin user` |

Probes 1–5 raise from one line of
`assign_sponsorship_animal_with_audit` (line 48). One consequence is worth
naming: **the message does not say which of the five conditions failed.** An
operator handed "Animal … cannot be sponsored" has to go and look. That is a
legibility gap, not a correctness one.

### Atomicity (§3.1)

Assignment is not a second transaction bolted onto approval. Forcing the
assign step to fail during an approval:

```
review_sponsorship_payment_proof(pledge5, 'approve', staff, …,
  '[{"periodMonth":"2026-09-01","amountCents":10000}]', <ineligible Cat E>)

  ERROR:  Animal 4e555555-5555-4555-8555-555555555555 cannot be sponsored
  CONTEXT: PL/pgSQL function assign_sponsorship_animal_with_audit(…) line 48 at RAISE
           PL/pgSQL function review_sponsorship_payment_proof(…) line 135 at assignment

 pledge_status | proof_status | months | assignments
---------------+--------------+--------+-------------
 provisional   | pending      |      0 |           0
```

The proof is **still pending**, no month was opened, and no assignment exists —
the whole approval rolled back. (`provisional` is the status the *earlier,
separate* recording call left behind; the failed approval did not advance it to
`active`.) Approving the money while silently skipping the assignment would
have left a paying supporter with no animal and no signal that anything went
wrong.

## The §6.4 relationship journey

Two isolated supporters, HK$100/month each, **one** animal, both naming it
rank 1.

### Both sponsors confirmed on the same animal

```
### STAGE 4 - THE GATE: two sponsors, one animal
       supporter       |     animal      |              animal_id               | started_on | ended_on |         created_by          | is_open
-----------------------+-----------------+--------------------------------------+------------+----------+-----------------------------+---------
 Rehearsal Sponsor One | Rehearsal Cat A | 4a111111-1111-4111-8111-111111111111 | 2026-09-12 |          | rehearsal.staff@hkscda.test | t
 Rehearsal Sponsor Two | Rehearsal Cat A | 4a111111-1111-4111-8111-111111111111 | 2026-09-12 |          | rehearsal.staff@hkscda.test | t
(2 rows)

 assignment_rows | distinct_animals | open_rows | rows_missing_created_by
-----------------+------------------+-----------+-------------------------
               2 |                1 |         2 |                       0
(1 row)
```

Two confirmed relationships, **one** animal, both open, both attributed to the
staff member who confirmed them. This is the requirement that could not be
demonstrated before this migration.

### A second month does not create a second assignment

Each pledge then recorded and approved month 2, passing the same animal id
again:

```
### STAGE 6 - a second approval must NOT create a second assignment
 assignment_rows_after_month_2 | pledges_with_assignment | distinct_animals
-------------------------------+-------------------------+------------------
                             2 |                       2 |                1
```

The auto-assign step runs only when the pledge has **never** had an assignment
row — not merely when it has none open now — so a supporter whose animal was
adopted and whose assignment staff ended must be given a new animal by a
person, not silently by their next payment.

### Amounts and months still agree

```
### STAGE 7 - the monthly ledger for both pledges
       supporter       |  month  | committed | paid  | allocations
-----------------------+---------+-----------+-------+-------------
 Rehearsal Sponsor One | 2026-08 |     10000 | 10000 |           1
 Rehearsal Sponsor One | 2026-09 |     10000 | 10000 |           1
 Rehearsal Sponsor Two | 2026-08 |     10000 | 10000 |           1
 Rehearsal Sponsor Two | 2026-09 |     10000 | 10000 |           1

       supporter       | received_cents | attributed_cents
-----------------------+----------------+------------------
 Rehearsal Sponsor One |          20000 |            20000
 Rehearsal Sponsor Two |          20000 |            20000
```

Received equals attributed for both. Two sponsors backing one animal produced
two independent ledgers; nothing was pooled, double-counted, or lost.

### The animal is adopted — the attention signal, at the database

```
### STAGE 8 - the animal is adopted
      name       | status
-----------------+---------
 Rehearsal Cat A | adopted

### STAGE 8b - OPEN assignments whose animal has left the programme
       supporter       |     animal      | animal_status |    signal
-----------------------+-----------------+---------------+--------------
 Rehearsal Sponsor One | Rehearsal Cat A | adopted       | needs review
 Rehearsal Sponsor Two | Rehearsal Cat A | adopted       | needs review
```

No trigger ended anything. Both relationships stayed open and both were
surfaced for a person to decide about — which is the intended behaviour, since
both supporters are still paying. The application derives the same signal on
every read (`reviewReasonFor` in `src/lib/sponsorshipAdmin/service.ts`) rather
than storing a flag that would drift the moment the CMS changed the animal.

### Ending one relationship keeps why it began

```
### STAGE 9
       supporter       |                     opening_note                      | end_reason |                               end_note                               |  ended_on  |          ended_by
-----------------------+-------------------------------------------------------+------------+----------------------------------------------------------------------+------------+-----------------------------
 Rehearsal Sponsor One | Supporter asked for this cat by name at the open day. | adopted    | Cat A went home 2026-09-12; supporter offered a new animal by phone. | 2026-09-12 | rehearsal.staff@hkscda.test
```

`note` (why the relationship began) and `end_note` (why it ended) are two
columns because they are two sentences written by two people at two moments.
Ending did not overwrite the first.

### Sponsor 2 is untouched

```
### STAGE 10
       supporter       | pledge_status |     animal      |    assignment    | months | paid_cents
-----------------------+---------------+-----------------+------------------+--------+------------
 Rehearsal Sponsor One | active        | Rehearsal Cat A | ended 2026-09-12 |      2 |      20000
 Rehearsal Sponsor Two | active        | Rehearsal Cat A | open             |      2 |      20000

### STAGE 10b - audit trail written by this journey
                   action                   | count
--------------------------------------------+-------
 sponsorship_pledge.animal_assigned         |     2
 sponsorship_pledge.animal_assignment_ended |     1
 sponsorship_pledge.proof_recorded          |     4
 sponsorship_pledge.proof_reviewed          |     4
```

Ending one supporter's relationship changed nothing about the other's. Both
pledges remain `active` with two settled months each — ending an assignment is
not cancelling a sponsorship, and the two are not the same field.

## What is NOT done

Stated plainly. §6.4 asks that "amounts, months, confirmed relationships, **and
receipts** must agree". Three of those four now agree. The fourth does not.

- **Sponsorship receipts remain unbuilt — §6.4 is still not fully met.** A
  sponsorship payment never becomes a `donation`/`payment` row, and
  `public.issue_receipt` is keyed on `donation_ids[1]`
  (`20260628120000_harden_receipt_and_payment_lifecycle.sql`), so it cannot
  fire for a sponsorship at all. Nothing in `src/lib/sponsorship*` creates a
  donation, a payment or a receipt. This slice closes the **relationship** half
  of the gate; the receipts clause is untouched and remains open, exactly as
  `13-phase3-monthly-ledger.md` recorded it.
- **The animal picker is a raw UUID box.** `PledgeDetailDrawer.tsx:598` renders
  a plain `<Input>` whose placeholder is literally `動物 UUID` / `Animal UUID`.
  Staff must paste an identifier. There is no search, no name lookup, and no
  eligibility preview — the only thing standing between a typo and a wrong
  confirmation is the database refusing an ineligible animal, which a typo that
  happens to name an *eligible* animal will pass.
- **An assignment outside the supporter's preference list is never flagged.**
  `getPledgeDetail` builds its animal-state map from the pledge's
  `preferences` only (`service.ts:144–148`); the assignment query embeds no
  animal state. So `reviewReasonFor` receives `null` and returns `null` for any
  animal confirmed by hand that the supporter did not rank — precisely the
  animals the UUID box above makes it easy to confirm. The database-level query
  in stage 8b has no such blind spot; the admin UI does.
- **There is no needs-attention indicator in the pledge LIST.** Both derived
  signals — an assignment's `reviewReason` and the pledge's `needsAnimal` — are
  computed in `getPledgeDetail`, not `listPledges`. Staff must open each drawer
  to discover that anything needs a decision.
- **The refusal message does not name the reason.** All five ineligibility
  conditions raise the same `Animal … cannot be sponsored`.
- **Fostered animals are still hidden from the public catalogue** —
  unrelated to this slice, and its own follow-up. `20260911170000` widened the
  RLS policy to admit `status = 'fostered'`, but five application queries still
  filter `status = 'available'` themselves, so the 65 fostered animals that
  migration was written to reveal remain invisible:
  `src/lib/animals/eligibility.server.ts:14`,
  `src/lib/animals/publicAnimal.functions.ts:21`,
  `src/lib/animals/publicImpact.functions.ts:24`,
  `src/lib/animals/publicListing.server.ts:18`,
  `src/routes/sitemap[.]xml.ts:49`.

## An incidental fix this rehearsal forced

`bun run lint` **failed** on the first attempt with 1 error — a `prettier/prettier`
violation already committed in `supabase/rls-tests/sponsorshipAssignment.rls.test.ts`
(commit `a946c9c`, the RLS coverage for this table). It was whitespace only;
`bunx eslint --fix` on that one file resolved it, and the gate below is the
re-run. Worth recording because the lint gate was red on the branch head and
nothing had caught it.

## Gates

Run on the full tree, not scoped to changed files, against a database reset
from zero.

| Gate | Command | Result |
|---|---|---|
| Migrations | `bunx supabase db reset --local` | exit 0, **63** applied from zero |
| Typecheck | `bunx tsc --noEmit` | exit 0, no output |
| Lint | `bun run lint` | **0 errors**, 41 pre-existing `react-refresh` warnings (after the fix above) |
| Tests | `bun test` | **2164 pass, 46 skip, 0 fail** (2210 tests across 332 files, 41.82s) |
| RLS | `bun run test:rls` | **43 pass, 0 fail** (2 files) |
| Database | `bun run test:db` | **37 pass, 0 fail** (4 files) |
| Build | `bun run build` | exit 0, built in 28.67s |

The RLS count rose from 38 to 43: the five added tests are
`supabase/rls-tests/sponsorshipAssignment.rls.test.ts`, covering anon denial and
staff/treasurer reads on the new table.

## Deployment position

`20260912120000_sponsorship_assignments.sql` is **not applied to production**,
and it is the last migration in a queue that is currently blocked.

Production is in the broken state recorded in
`14-live-incident-sponsorship-submissions.md`: PR #112's code is deployed and
its migrations are not, so the public sponsorship form fails on a missing
`resolve_public_supporter_identity`. **Fixing that comes first.** This
migration sits behind it, and behind the rest of the unapplied backlog in
`10-production-schema-reconciliation-2026-09-11.md`:

```
20260905144848  ->  20260905155357  ->  20260905163900
   ->  20260911120000  ->  20260911140000 .. 20260911190000
   ->  20260912120000  ->  application code
```

Two further cautions carried forward from `14-…` and
`15-production-state-migration-rehearsal.md`:

- everything above was applied **from zero**, which is not the same operation as
  applying onto production's populated schema;
- nothing here proposes a release. Applying any of it is a production data
  change and needs explicit approval.
