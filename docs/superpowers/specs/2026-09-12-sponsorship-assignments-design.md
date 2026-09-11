# Sponsorship assignments — confirmed supporter–animal relationships

Date: 2026-09-12 · Phase 3 (§6.2) · follows the second-month and monthly-ledger slices

## Why

Phase 3 §6.2 separates four things: a **pledge** is an intention, a **period** is
one month's commitment, a **payment** is money that moved, and an **assignment**
is a confirmed supporter–animal relationship. The first three now exist. The
fourth does not.

`sponsorship_preference` is the only supporter–animal link in the system, and it
is a *wish*: ranked 1–10, written once at submission, never mutated by any RPC.
Nothing records that the association agreed to it. So §6.4's delivery gate —
"use at least two isolated test sponsors for the **same animal**" — cannot be
demonstrated, and the monthly ledger has no relationship to point at.

## Decisions

Settled with the product owner before design:

| # | Decision |
|---|---|
| 1 | A pledge may hold **several concurrent assignments**; an animal may have **many sponsors**. The plan forbids treating an animal as inventory permitting one sponsor. |
| 2 | The pledge's monthly amount is **not divided** per animal. The ledger stays exactly as built. |
| 3 | On the **first payment approval**, the top-ranked still-eligible preference is assigned automatically. Staff add or end assignments thereafter. |
| 4 | Ending is **always a manual staff action**. No database trigger. A derived query flags assignments whose animal has left. |
| 5 | Assignments are **staff-only**. Nothing is added to the supporter's public status page. |

Decision 5 was taken on evidence, not preference. The status token cannot be
revoked or re-issued — nothing writes `public_status_token.revoked_at`, and only
`submission.server.ts:310` inserts one — so widening what that page shows is
irreversible per supporter. And `end_reason` carries values like `deceased`:
publishing it would deliver distressing news about an animal through a web page
with no staff contact. That is a welfare problem before it is a privacy one.

## Data model

```
public.sponsorship_assignment
  id                    uuid pk
  pledge_id             uuid not null -> sponsorship_pledge(id) on delete cascade
  animal_id             uuid          -> animals(id) on delete set null
  animal_name_snapshot  text not null
  started_on            date not null
  ended_on              date
  end_reason            text
  note                  text
  created_by            uuid -> admin_user(id)
  ended_by              uuid -> admin_user(id)
  created_at            timestamptz not null default now()
  updated_at            timestamptz not null default now()
```

`started_on` is the database's `current_date` at the moment the assignment is
made, whether automatically on approval or by hand; `ended_on` is `current_date`
when it is ended. Both come from the database clock, consistent with the existing
sponsorship RPCs, which already use `now()`. Nothing here depends on a wall-clock
comparison, so no injectable clock is needed — the one rule that could have
(`selectAutoAssignPreference`) is a pure ranking with no time in it.

`animal_name_snapshot` mirrors what `sponsorship_preference` already does, so
history survives an animal record changing. `on delete set null` matches the
existing preference FK; animals are retired via `retired_at`, not deleted
(`20260906162436:31`), so this is a safety net rather than a live path.

Constraints carry the rules:

- `ended_on >= started_on`
- `end_reason` set **exactly when** `ended_on` is — both or neither
- `end_reason in ('adopted','deceased','ineligible','retired','supporter_request','transferred','other')`
- **partial unique `(pledge_id, animal_id) where ended_on is null`** — a supporter
  cannot hold two open assignments to the same animal
- **no uniqueness on `animal_id`** — this is what lets many sponsors back one animal

Index `(pledge_id) where ended_on is null` for the drawer, and
`(animal_id) where ended_on is null` for the review scan, which otherwise has no
supporting index on either side of the join.

### RLS and grants

Staff-only, and written explicitly rather than by omission:

```sql
alter table public.sponsorship_assignment enable row level security;
create policy "staff can read sponsorship assignments" ... to authenticated
  using (private.has_admin_role(array['staff','admin','treasurer']));
grant select on public.sponsorship_assignment to authenticated;
revoke all on public.sponsorship_assignment from anon;
```

No INSERT/UPDATE/DELETE policy for any role. Every write goes through a
`security definer` RPC revoked from `public`, `anon` and `authenticated`, granted
only to `service_role` — matching `20260911190000:426-429`.

`treasurer` is included for read, consistent with the ledger tables and with
§6.3's note that treasurers read payments but do not review sponsorship.

> **Carry-over defect.** `20260911190000` gave `sponsorship_period` and
> `sponsorship_payment_allocation` RLS and an `authenticated` grant but **no
> `revoke all ... from anon`**. Latent today — RLS default-denies with no anon
> policy — but it should be closed in the same migration as this work.

## What "eligible to sponsor" means

Verified against the live schema, because two candidate sources exist and only
one is real.

**`animals.sponsorship_eligible` is the source of truth.** It is what the public
RLS policy, every public read, the pledge gate and the CMS checkbox use, and it
is what the legacy support-pool flag was imported into.
`animal_profile_internal.is_inside_support_pool` is **not** to be used: nothing
in the sponsorship domain reads it, nothing syncs it, and it is almost certainly
absent for imported animals. Trusting it would silently exclude nearly every real
sponsorship animal.

**Adopted and deceased have no common home.** `animals.status = 'adopted'` is
written by the staff status RPC; `adopted_at` and `deceased_at` live only on
`animal_profile_internal`, written by a different form through a different RPC.
`animals.status` has no `deceased` value at all — its CHECK is
`('available','adopted','fostered')`. Any query about departure must consult
both tables, with a **LEFT JOIN**, treating a missing profile row as "nothing
recorded" exactly as `defaultInternalProfile()` already does. An inner join would
flag nothing for the majority of animals.

### The auto-assign predicate

Verified behaviourally against real Postgres, not by inspection:

```sql
select pref.sponsor_animal_id, pref.rank, a.name
from public.sponsorship_preference as pref
join public.animals as a on a.id = pref.sponsor_animal_id
left join public.animal_profile_internal as api on api.animal_id = a.id
where pref.pledge_id = p_pledge_id
  and pref.sponsor_animal_id is not null
  and a.sponsorship_eligible
  and a.status <> 'adopted'
  and a.retired_at is null
  and a.publication_state = 'published'
  and api.deceased_at is null
order by pref.rank asc
limit 1;
```

`status <> 'adopted'` names the excluded state rather than requiring
`= 'available'`, following the precedent set in `20260911170000`: a **fostered**
animal is in temporary care and still needs a sponsor.

`rank` is unique per pledge, so `order by rank` needs no tiebreaker.
`sponsor_animal_id` is nullable — a name-only wish with nothing to assign — and
must be skipped.

**`publication_state` gates the auto-assignment but does not end an existing
one.** Opening a new public-facing commitment against a `draft` or `unpublished`
animal is wrong; withholding a profile from the website is an editorial act and
not a reason to end a sponsorship someone is already paying for.

## Lifecycle

### Creation, automatic

Inside `review_sponsorship_payment_proof` — the same transaction that already
approves the payment and allocates it to months. This **cannot** be a second
repository call: the service and the ledger migration are both explicit that
approval and attribution travel into one RPC, and a relationship established in
a separate transaction could be lost while the payment stood.

Condition: `p_decision = 'approve'` **and** the pledge has no
`sponsorship_assignment` rows at all. If no preference qualifies, nothing is
created and the pledge simply shows as active with no animal.

The step slots between the pledge-status update and the `audit_log` insert.

> **Correction.** An earlier draft of this spec called `v_actor_admin_id` a
> defect — resolved inside the allocation `if`, therefore NULL when
> `p_allocations` is empty. The variable *is* null on that path, but it has no
> consequence: its only consumer is `apply_sponsorship_allocations`, called
> inside the same branch that resolves it, and the auto-assign path does not use
> it at all (`assign_sponsorship_animal_with_audit` resolves its own admin id
> from `p_actor_user_id` for `created_by`). Hoisting it is harmless tidying, not
> a fix. Verified by reading both function bodies.
>
> Still true and worth heeding: `v_proof.review_status` has already been set to
> `approved` by that point, so any "first approval" test must exclude the current
> proof explicitly.

### Creation and ending, manual

Two RPCs, each audited in its own transaction:

- `assign_sponsorship_animal_with_audit(p_pledge_id, p_animal_id, p_actor_user_id, p_note)`
- `end_sponsorship_assignment_with_audit(p_assignment_id, p_actor_user_id, p_reason, p_note)`

Adding a second or third animal is just calling assign again — that is how
"several at once" works without a special path.

### Invariants, enforced in the database

1. An animal that is adopted, deceased, retired, not `sponsorship_eligible`, or
   not `published` **cannot be assigned**.
2. No assigning to a cancelled pledge.
3. At most one open assignment per `(pledge, animal)`.
4. Ending requires an **open** assignment and a reason; ending twice is refused.
5. Every write inserts its `audit_log` row in the same transaction —
   `log_animal_mutation` skips service-role writes, so the app layer must do it.

## The attention signal

Derived, never stored, so it cannot drift from the facts.

- An **assignment needs review** when `ended_on is null` and any of:
  `a.sponsorship_eligible = false`, `a.status = 'adopted'`,
  `a.retired_at is not null`, `api.deceased_at is not null`,
  `api.adopted_at is not null`.
- A **pledge needs an animal** when its status is `active` and it has no open
  assignment.

The second catches the case decision 4 creates: the animal left, staff ended the
assignment, the pledge keeps taking payments, and a person must now talk to the
supporter.

Note this deliberately flags on `retired_at` even though it was not chosen as an
end reason: retirement is worth a human looking, and flagging is not ending.

## Integration

Both actions go through the existing five-layer chain, copying `cancelPledge` at
every layer. No new abstraction.

**New route files** (copying `$id/cancel.ts` and the content
`$id/revisions/$revisionId/restore.ts` shape):

- `src/routes/api/admin/sponsorships/pledges/$id/assignments.ts` — POST
- `src/routes/api/admin/sponsorships/pledges/$id/assignments/$assignmentId/end.ts` — POST

`routeTree.gen.ts` is generated; rebuild and commit it (CI gate).

**Modified:** `schemas.ts` (two zod schemas beside `cancelPledgeSchema`),
`service.ts`, `repository.server.ts`, `http.server.ts`, `-handlers.ts`,
`types.ts`, `PledgeDetailDrawer.tsx`, `adminPageCopy.ts`.

Every mutating repository method calls a `security definer` RPC; none writes a
table directly. These two must not be the first exception.

> **Error mapping is string-matched.** `http.server.ts:40-49` matches domain
> errors on exact `Error.message` strings. New messages — "Sponsorship assignment
> not found", "already ended", "not eligible" — must be added to
> `notFoundDomainErrors` / the conflict set, or they surface as 500 rather than
> 404/409. Separately, `forbiddenDomainErrors` holds a string that appears
> nowhere in production code; the database raises
> "Actor % is not an active staff/admin user" instead, which never matches. Worth
> correcting while in the file.

### UI

One bordered section in `PledgeDetailDrawer.tsx`, after preferences and before
the shared `actionError`:

- open assignments — animal name, `started_on`, an `end` control opening an
  inline reason/note input, and a `StatusPill tone="danger"` carrying the review
  reason when flagged;
- ended assignments, muted, with `ended_on` and `end_reason`;
- an add row — animal picker, optional note, button disabled until chosen.

Both actions copy `submitReview` verbatim, including `refreshAll()` and the
`actionError` handling. Copy strings go in `adminPageCopy`, in **both** `zh` and
`en` — parity is not compile-enforced in that file, and a zh-only key fails at
the component that reads it.

## Scope

**In:** the table, RLS and grants, the two RPCs, the auto-assign step, the
derived queries, the repository/service/HTTP/route wiring, the drawer section,
and the migration hygiene fixes named above.

**Out, deliberately:**

- **Per-animal money.** Decision 2.
- **Automatic transfer or advance** to the next choice. The plan forbids silently
  moving payments to another animal.
- **Any public exposure.** Decision 5.
- **A needs-attention indicator in the pledge *list*.** `PledgeSummary` carries no
  animal data and `listPledges` issues one pledge select plus a supporter lookup,
  so a per-row flag means a new join and a widened summary type. The drawer
  carries the signal in this slice; the list indicator is a follow-up once the
  relationship exists.

## Testing

**Unit** — `selectAutoAssignPreference` as a pure function, the way
`planPaymentAllocation` and `selectReviewTargetProof` already are, so the rule is
testable without a database and the SQL is not its only home.

**Repository** — `assignments` must be a **required** field on `PledgeDetail`, so
`bun run typecheck` finds every fixture. `bun test` does not type-check: an
optional field would leave every existing service test silently exercising
`undefined`. The fake client needs an `assignmentRows` state, a default, and a
dispatch branch — `rowsForTable()` returns `[]` for unknown tables, so a test
written before the fake is taught about the table passes with no evidence.
`createFakeRepo(...) as Repo` defeats the type system for new repository methods
(verified: `allocateProof` is absent from that literal and typecheck is clean),
so new methods must be added by hand.

**Service** — each validation path, and that a rejected payment assigns nothing.

**RLS** — the new table's policies, including that `anon` is denied.

**Real Postgres** — the journey that closes §6.4's relationship half: **two
isolated sponsors on the same animal**, each running two months plus a top-up;
auto-assignment on first approval choosing the top-ranked eligible preference and
skipping adopted, deceased, retired and ineligible ones; a manual add; an end
with a reason; and the review query proving a departed animal surfaces.

## Deployment ordering

This migration depends on `publication_state`, added by `20260911140000`, which
is **not applied to production** — along with the rest of the `20260911*` set and
the three migrations behind the live incident
(`docs/evidence/hkscda-revision/14-live-incident-sponsorship-submissions.md`).
Referencing it against today's production would fail with `42703`, exactly as
`donation.contact_*` does now.

Nothing here is releasable until that backlog is applied in the recorded order.

## Open question

`animal_profile_internal`'s production row count was not measured. The conclusion
that it is largely empty rests on the import path writing only `public.animals`
and on the application's null-tolerant defaults — strong structural evidence, but
not a measurement. The design is safe either way because every join to it is a
LEFT JOIN treating absence as "nothing recorded", but a read-only
`select count(*)` would confirm how much the deceased/adopted signal is worth in
practice.
