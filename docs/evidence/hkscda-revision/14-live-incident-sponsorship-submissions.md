# Live incident — public sponsorship submissions are failing in production

Found 2026-09-12 · Project `iihqjzilgawhfdhdevam` · Deployed commit `3c1d26b`

**This is the deployment-ordering hazard recorded in
`docs/superpowers/plans/hkscda-migration-and-release.md` §5. It has now
happened.** That note said, before the merge: "deploying the code first would
break public sponsorship submissions that currently work."

## What happened

PR #112 was merged to `main` at **2026-09-11T14:20:46Z** (merge commit
`3c1d26b`), which triggers a production deployment. The migrations in that PR
are applied separately and were **not** applied.

Production therefore runs new code against the old schema.

## The failing path

`src/lib/sponsorship/submission.server.ts` — the public sponsorship pledge form:

```
resolveIdentity({ ..., source: "sponsorship_pledge_form" })
  -> client.rpc("resolve_public_supporter_identity", ...)     // publicIdentity.server.ts:41
  -> if (error) throw error;                                  //                      :44
  -> catch -> throw new Error("Failed to save sponsorship pledge")
```

`resolve_public_supporter_identity` is **absent from production** (read-only
OpenAPI probe, 2026-09-12, `http=200`, 35 RPCs / 68 tables exposed — unchanged
from the 2026-09-11 ledger). It is created by `20260905144848`, one of the
unapplied migrations.

Before the merge, the deployed commit `c037cc1` used a plain `.upsert` on
`supporter` here and had no RPC dependency. So this path worked until the deploy
and has failed since.

**Symptom:** a supporter completing the public sponsorship form gets a failure;
no pledge row is created. The identity-protection fix the RPC exists to provide
is also absent, so this is not a case where the old behaviour silently continues.

## Read-only verification (2026-09-12)

Method: PostgREST's OpenAPI *description* only — schema, zero rows, no table
selects, no RPC invoked, no writes.

| Object | Production | Created by |
|---|---|---|
| `resolve_public_supporter_identity` | **ABSENT** | `20260905144848` |
| `supporter_consent_intent` | **ABSENT** | `20260905144848` |
| `donation.contact_*` | **ABSENT** | `20260905144848` |
| `record_manual_gift_with_audit` | **ABSENT** | `20260905155357` |
| `claim_donation_delivery_job` | **ABSENT** | `20260905155357` |
| `donation_delivery_job`, `manual_gift_request` | **ABSENT** | `20260905155357` |
| `volunteer_activity_counts` | **ABSENT** | `20260905163900` |
| `record_sponsorship_payment_proof` | present | `20260829180000` |
| `review_sponsorship_payment_proof` | present | `20260829180000` |
| `cancel_sponsorship_pledge`, `issue_receipt` | present | earlier |
| `sponsorship_pledge`, `sponsorship_payment_proof` | present | `20260702130000` |
| `sponsorship_period`, `sponsorship_payment_allocation` | **ABSENT** | this branch, not proposed for release |

A first pass of this probe reported the sponsorship RPCs as absent. That was a
slicing error in the probe script (it trimmed one character too many from every
name, turning `record_…` into `ecord_…`); corrected above. The sponsorship RPCs
**are** deployed, which also re-confirms the earlier B19 finding.

## Still broken from before this deploy

`donation.contact_*` being absent breaks `PAYMENT_WITH_DONATION_SELECT`
(`reconcile.server.ts:184`) with `42703`, so Stripe/PayPal webhook reconciliation
and receipting fail. That predates the merge and is unchanged — see
`10-production-schema-reconciliation-2026-09-11.md`.

## What fixes it

Applying the unapplied migrations, in order. For the sponsorship form
specifically, **two** are required:

1. `20260905144848` — creates `resolve_public_supporter_identity`,
   `supporter_consent_intent`, and `donation.contact_*`. Also fixes the payment
   reconciliation failure above.
2. `20260911120000` — widens that function's accepted `source` list to include
   `sponsorship_pledge_form`, which is exactly the value the deployed code
   passes. Applying only step 1 would leave the form failing on a CHECK
   violation instead of a missing function.

Then `20260905155357` and `20260905163900` for the manual-gift/delivery-job and
volunteer paths, which are separately broken.

## What has NOT been done here

- **No migration has been applied to production.** Applying them is a production
  data change and needs explicit release approval.
- The rehearsal recorded elsewhere on this branch applied all migrations **from
  zero**, which is not the same operation. Applying onto production's current
  populated schema must be rehearsed against a database representing that exact
  state before any approval is sought.
- Nothing here proposes a release action; it reports a fault and the remedy.
