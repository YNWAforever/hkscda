# HKSCDA Migration and Release Plan

Created: 2026-09-11 · Branch `feat/hkscda-six-phase-revision` · Base `c037cc1`

Companion to `hkscda-implementation-status.md`. This document governs schema
change, data migration, rehearsal and activation. It is not a release request.

## 1. Environments and the rule that constrains everything

| Environment | Identity | Use |
|---|---|---|
| Production database | Supabase `iihqjzilgawhfdhdevam` | **Never** a rehearsal target |
| Production deployment | Vercel `hkscda` / `ynwaforevers-projects`, currently built from `c037cc1` | Changed only by an approved merge to `main` |
| Isolated rehearsal | local Supabase stack, API `127.0.0.1:55321`, DB `127.0.0.1:55322` | All migration and RLS rehearsal |

**`.env.local` in this checkout points at the production project.** Every command
that could write — `supabase db reset`, `db push`, seed scripts, import scripts —
must therefore be run with an explicitly local target and never inherit that
environment. No replacement production database is created; restoration is
rehearsed only against an isolated target.

## 2. Migration rules

- **Forward and additive.** No destructive rewrite of existing rows. Prefer new
  columns/tables with safe defaults over altering meaning in place.
- **Idempotent reruns.** `if not exists`, `drop … if exists` before create,
  `on conflict do nothing`. A rerun must not duplicate seeding.
- **Coexistence.** Before release, confirm the currently deployed application can
  run against the new schema. Switching back to the old interface does not
  restore data, and old write paths must not bypass new quotas or identity
  protections.
- **Never** replay every migration missing from the ledger, and never update the
  ledger without fixing the schema. Write a migration for the *actual* state.
- Every `security definer` function pins `search_path`; app-called RPCs live in
  `public` and are granted to `service_role`. `supabaseMigrations.test.ts`
  enforces both.
- Each migration is verified against **both** a clean installation and a
  rehearsal environment representing the current state.

## 3. Data migration rules

Migrations that move or reconcile records require, before anything is applied:

1. a **dry run** with no writes;
2. **ID-level mapping** — source ID → reference number → existing UUID, with a
   matching-confidence field;
3. a **conflict list** for every ambiguous or unresolved record;
4. **before/after reconciliation** of counts *and relationships*, not counts
   alone;
5. proof the operation is **idempotent**.

Prohibited outright: resetting the database, reseeding existing data, merging
animals by name, overwriting a supporter because an email matches, substituting
demonstration data for a missing record, and replacing a real animal's photo with
a generated image. Names are supporting evidence only; IDs and reference numbers
decide identity. Where a source is unavailable, the record is listed as missing
**by ID with a reason** — never filled in.

## 4. Migrations added on this branch

### `20260911120000_sponsorship_public_identity_protection.sql`

**Status: applied to the isolated rehearsal target only. Not applied to production.**

| Change | Kind |
|---|---|
| `supporter_consent_intent.source` CHECK widened to accept `sponsorship_pledge_form` | additive |
| `supporter_consent_intent.submission_type` CHECK widened to accept `sponsorship_pledge` | additive |
| `sponsorship_pledge.consent_email_requested` / `.consent_whatsapp_requested` | new columns, `NOT NULL DEFAULT false` |
| `resolve_public_supporter_identity(jsonb)` accepts the new source | replace; conflict behaviour unchanged |
| `record_public_consent_intents()` handles `sponsorship_pledge` | replace; existing branches verbatim |
| trigger `record_public_consent_intents` on `sponsorship_pledge` | new trigger |

No existing row is modified. Previously-accepted source values keep working.
Defaulting the two new columns to `false` asserts nothing about what historical
pledge supporters were asked.

**Coexistence:** the currently deployed application does not reference the new
columns and continues to work against this schema. The reverse is not true — the
new application code requires the widened `resolve_public_supporter_identity`
source list, so **the migration must be applied before the code is deployed.**

**Rehearsal evidence:** `bunx supabase db reset` applied all 55 migrations from
zero, exit 0, this migration last. Behavioural verification against real
Postgres is recorded in `hkscda-implementation-status.md` (Slice A).

**Rollback:** the migration is additive, so the safe reversal is to redeploy the
previous application revision and leave the schema in place. Dropping the two
columns would destroy consent-intent evidence and is not the rollback path. If
the widened source list must be withdrawn, replace the function with the
two-value list — but only after the application no longer sends the third value,
or public sponsorship submissions begin failing.

## 5. The outstanding schema reconciliation

The audit's central Phase 1 finding is that migrations exist in Git while the
corresponding objects are **absent from the deployed database** — deployment and
schema drift, not missing source. All four migrations the plan names are present
in this repository.

This session did **not** query production, so the drift is recorded as the
audit's finding and as the repository's own recorded preflight
(`docs/evidence/cms-payment-debug-20260906/production-schema-preflight.json`),
**not** as an independently reverified fact. A read-only metadata query must come
first:

```sql
select
  to_regclass('public.donation_delivery_job')                                  as donation_delivery_job,
  to_regclass('public.manual_gift_request')                                    as manual_gift_request,
  to_regprocedure('public.record_manual_gift_with_audit(uuid,uuid,jsonb)')     as record_manual_gift,
  to_regprocedure('public.claim_donation_delivery_job(uuid,uuid,timestamptz)') as claim_delivery_job,
  to_regprocedure('public.volunteer_activity_counts(uuid[])')                  as activity_counts,
  to_regprocedure('public.resolve_public_supporter_identity(jsonb)')           as resolve_identity;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'donation'
  and column_name in ('contact_name', 'contact_email', 'contact_phone', 'contact_language');
```

The `donation.contact_*` check is the highest-priority item: those columns are
created only by `20260905144848`, which the recorded preflight shows was not part
of the one approved production repair. If they are absent, the donation select in
`donations/reconcile.server.ts` fails with `42703` and **all** receipt,
acknowledgement and reconciliation traffic is broken today — a wider and more
urgent fault than anything else in Phase 1.

Until that query is run, no repair migration is written: a migration for a
guessed state is exactly what these rules forbid.

## 6. Release position and staged activation

Release order, once each batch's gates pass:

1. **Restoration batch** — Phase 1 schema compatibility and core read/transaction
   fixes. Verify existing data is intact *first*.
2. **Public animal batch** — Phase 2 verified assets, CMS, large-photo public
   interface. Photo gaps documented; unverified content never mixed into
   featured selections.
3. **CRM operations batch** — Phase 3 identity, cases, monthly sponsorship and
   finance. Old and new entry points stay compatible; no second set of books.
4. **Volunteer batch** — Phases 4/5 piloted with approved policies and
   representative sessions, then expanded. Unresolved rules stay disabled.

### Current position

**No release action is proposed.** What exists is two reviewable Phase 1 slices,
one additive migration rehearsed from zero on an isolated stack, and recorded
gate results.

Two things must be settled before any push, independent of approval:

- **Preview exposure.** `vercel.json` disables deployments only for
  `feat/public-layout-v2`, `feat/layout-*`, `chore/layout-*`, `fix/layout-*`,
  `ci/layout-*` and `docs/brand-reconciliation`. A push of
  `feat/hkscda-six-phase-revision` **would** publish a preview, against
  AGENTS.md's instruction not to create a public preview while review access is
  meant to remain private. Either add the branch pattern to `vercel.json` or
  rename the branch into a disabled pattern.
- **Ordering.** The migration must be applied before the application code that
  depends on it is deployed.

Merging to `main` triggers a production deployment and requires explicit release
approval. A concrete release request will follow: the pinned candidate commit,
the migration diff, isolated rehearsal evidence, data reconciliation, and the
recovery plan.

## 7. Recovery

- Prefer forward-compatible additive migrations so the previous application
  revision can be redeployed without a schema reversal.
- Reverse **data** revisions with scoped reverse mappings or compensating
  transactions. A full-database restore is a reviewed incident-response option
  only — it would erase applications and payments received after deployment.
- Keep recoverable references for photo versions, public content revisions and
  policy versions. Recovery must never delete historical payments, attendance,
  receipts or consent evidence.
- Errors carry traceable IDs. `LoadFailure` renders a stable reference derived
  from the fault so one outage yields one reference across operators.
- Rehearse monthly logic with a fixed clock; never wait a real month to test a
  basic rule.
