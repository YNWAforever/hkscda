# Rehearsing the fix against production's actual state

Recorded 2026-09-12 · isolated local stack only · **nothing applied to production**

`13-phase3-monthly-ledger.md` rehearsed migrations **from zero**. That is not the
operation production needs. This rehearses the real one: applying the unapplied
migrations onto a database that already holds data, at the exact schema state
production is in — the remedy for the incident in
`14-live-incident-sponsorship-submissions.md`.

## Building a production-state database

All migrations were applied except the ones the read-only probe found missing:
`20260905144848`, `20260905155357`, `20260905163900`, and the `20260911*` set
(which is newer than production). 51 of 62 applied, exit 0.

The result matches the probe object for object:

| Check | Production (probe) | Rehearsal target |
|---|---|---|
| `resolve_public_supporter_identity` | ABSENT | ABSENT |
| `donation.contact_*` | ABSENT | ABSENT |
| `supporter_consent_intent` | ABSENT | ABSENT |
| `record_sponsorship_payment_proof` | present | present |

Representative existing data was then seeded — a supporter with a name, phone
and `source` of `manual_import`, a HK$123.45 donation, and an active pledge —
because the question is not only "does the migration run" but "does it leave
existing records alone".

## Applying the four, in order

```
OK   20260905144848_public_supporter_identity_claims
OK   20260905155357_crm_manual_gift_delivery_jobs
OK   20260905163900_volunteer_atomic_approval
OK   20260911120000_sponsorship_public_identity_protection
```

### Existing data is untouched

| | Before | After |
|---|---|---|
| supporters / donations / pledges | 1 / 1 / 1 | 1 / 1 / 1 |
| supporter name | 陳大文 | 陳大文 |
| supporter phone | +85290000001 | +85290000001 |
| supporter source | manual_import | manual_import |
| donation amount | 12345 | 12345 |

HK$123.45 is still 123.45.

### The failing call now succeeds

With the exact `source` value the deployed code sends:

```sql
select public.resolve_public_supporter_identity(
  jsonb_build_object(..., 'source','sponsorship_pledge_form'));
-- {"kind": "created", "supporterId": "4ffad966-…"}
```

Both migrations are required. `20260905144848` creates the function;
`20260911120000` widens its accepted `source` list to include
`sponsorship_pledge_form`. Applying only the first would move the failure from
"function does not exist" to a CHECK violation — still a broken form.

### The identity protection actually protects

An unverified public form submitted with an **existing** supporter's email:

```
-- {"kind": "existing", "supporterId": "dd000000-…"}
name: 陳大文 | phone: +85290000001 | source: manual_import   (unchanged)
```

The stranger's name, phone and language did not overwrite the real supporter's.
That is the whole point of the function, and it is verified rather than assumed.

### The payment reconciliation error clears

The select that returns `42703` in production today — the one behind
`PAYMENT_WITH_DONATION_SELECT` — returns its row.

## Idempotency: one migration is not rerunnable

Re-applying each a second time:

| Migration | Rerun |
|---|---|
| `20260905144848` | OK |
| `20260905155357` | **FAILS** — `relation "manual_gift_request" already exists` |
| `20260905163900` | OK |
| `20260911120000` | OK |

`20260905155357` uses bare `create table` for `manual_gift_request` and
`donation_delivery_job`, with no `if not exists` and no explicit transaction. It
violates the branch's own migration rule ("Idempotent reruns").

This does not block a first clean apply — it succeeded. It matters for what
happens if an apply is interrupted.

**Mitigation, verified:** applied with `--single-transaction`, a failed attempt
leaves nothing behind. Re-running it against a database that already has the
tables errors and rolls back completely, with every pre-existing object and row
intact:

```
manual_gift_request=manual_gift_request  donation_delivery_job=donation_delivery_job
supporters=2  name=陳大文
```

So the apply should be run as a single transaction per migration, not statement
by statement. Do **not** "fix" this by editing the migration to add
`if not exists` — the rules forbid rewriting a migration whose state is already
deployed elsewhere, and the transaction makes it unnecessary.

## Recommended order

1. `20260905144848` — restores `resolve_public_supporter_identity`,
   `supporter_consent_intent`, `donation.contact_*`. Fixes the payment
   reconciliation failure.
2. `20260911120000` — widens the accepted source list. **Required with step 1**
   or the sponsorship form still fails.
3. `20260905155357` — manual gift / delivery jobs. Apply in a single transaction.
4. `20260905163900` — volunteer atomic approval.

Steps 1–2 are what clears the live incident. Steps 3–4 clear separately broken
paths and are not needed for the sponsorship form.

The remaining `20260911*` migrations (Phase 2 publication state, Phase 3 second
month and monthly ledger) are **not** part of this remedy and are not proposed
for release here.

## Position

This is rehearsal evidence and a recommended order. **No migration was applied
to production, and no release action is taken.** Applying them is a production
change requiring explicit approval.
