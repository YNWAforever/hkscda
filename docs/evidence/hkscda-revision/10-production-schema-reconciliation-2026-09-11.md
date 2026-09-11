# Phase 1.1 — Deployed Schema Reconciliation (CONFIRMED)

Recorded: 2026-09-11 · Project `iihqjzilgawhfdhdevam` · Deployed commit `c037cc1`

**Method: read-only metadata only.** Every request used `limit=0`, so zero rows
were returned, plus PostgREST's OpenAPI description. No row data, no personal
data, no writes, no RPC invocation. Performed with explicit user authorisation
after an earlier attempt was denied.

This replaces inference with measurement. The drift the audit reported is
**confirmed**, and its consequences are worse than recorded.

## Ledger

| Object | Production | Source migration |
|---|---|---|
| `donation.contact_name` / `_email` / `_phone` / `_language` | **ABSENT** (42703) | `20260905144848` |
| `supporter_consent_intent` | **ABSENT** (PGRST205) | `20260905144848` |
| `resolve_public_supporter_identity` | **ABSENT** | `20260905144848` |
| `donation_delivery_job` | **ABSENT** (PGRST205) | `20260905155357` |
| `manual_gift_request` | **ABSENT** (PGRST205) | `20260905155357` |
| `record_manual_gift_with_audit` | **ABSENT** | `20260905155357` |
| `claim_donation_delivery_job` | **ABSENT** | `20260905155357` |
| `retry_donation_delivery_job_with_audit` | **ABSENT** | `20260905155357` |
| `volunteer_activity_counts` | **ABSENT** | `20260905163900` |
| `set_volunteer_registration_status_with_audit` | **ABSENT** | `20260905163900` |
| `update_volunteer_activity_with_audit` | **ABSENT** | `20260905163900` |
| `crm_supporter_summary`, `crm_read_supporters` | present | applied 2026-09-06 repair |
| `animals.public_profile`, `adoption_eligible`, `retired_at` | present | `20260906162436`, `20260906181657` |
| `sponsorship_pledge` | present | `20260702130000` |

**Three migrations are unapplied: `20260905144848`, `20260905155357`,
`20260905163900`.** 35 RPCs and 68 tables are exposed in total.

## Live incident — payment processing is broken today

`PAYMENT_WITH_DONATION_SELECT` (`reconcile.server.ts:184`) embeds all four
`contact_*` columns. Proven against production:

```
exact production select              -> 400 {"code":"42703",
                                        "message":"column donation_1.contact_name does not exist"}
same select minus the four columns   -> 200 []
```

`findPaymentByProvider` does `if (error) throw error` (line 198), so this is a
hard failure, not a degraded read. Three routes depend on it:

- `src/routes/api/webhooks/stripe.ts`
- `src/routes/api/webhooks/paypal.ts`
- `src/routes/api/admin/payments/$id/reconcile.ts`

**Stripe and PayPal payment webhooks fail, and staff cannot reconcile a
payment.** A provider can take a donor's money while the system never records,
confirms or receipts it. This is an operational incident, not a Phase 1 tidy-up,
and it is the highest-priority item outstanding anywhere in this work.

## Second confirmed cause: the volunteer "zero records" symptom

`volunteer_activity_counts` is absent. `repository.server.ts:180-183` calls it
with `if (error) throw error` and no fallback, on a path that includes the
**anonymous public** activity list. The audit's "UI showed zero records while the
database held 12 activities and 5 registrations" is fully explained: the read
throws, and the UI rendered the failure as an empty list. The display half was
fixed in `6354e37`; the data half needs the migration.

## Deployment ordering — this constrains our own branch

`c924244` routes sponsorship submissions through
`resolve_public_supporter_identity`, **which is absent from production.**

Before that commit, sponsorship used a direct upsert, which works against the
current schema. After it, the code calls an RPC that does not exist there. So:

> **Migration `20260905144848` must be applied to production BEFORE the branch's
> application code is deployed.** Deploying the code first would break public
> sponsorship submissions, which currently succeed.

The same ordering applies to `20260911120000` (this branch's own migration),
which extends that function — it cannot be applied until the function exists.

Required order: `20260905144848` → `20260905155357` → `20260905163900` →
this branch's `20260911*` migrations → application code.

## What this does not establish

- No row counts, no data reconciliation, no PII: metadata only.
- Whether the webhooks are currently receiving live traffic is unknown; the
  failure is in the code path, proven, but volume is not measurable from here.
- Whether the three migrations apply cleanly to production's *current* state was
  rehearsed only against a clean local stack (60 migrations from zero, exit 0).
  A rehearsal against a restored copy of production is still required before any
  release, per the migration plan.
