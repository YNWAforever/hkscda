# HKSCDA Six-Phase Implementation — Status

Last updated: 2026-09-11
Working branch: `feat/hkscda-six-phase-revision`
Branch base / audit baseline: `c037cc12b299058e2699b126c38322b59406e6ea`

Read this first, then `hkscda-data-and-api-contracts.md`,
`hkscda-volunteer-policy-decisions.md`, `hkscda-migration-and-release.md`, and the
evidence under `docs/evidence/hkscda-revision/`.

## Current phase

**Phase 1 — Restore a Trustworthy System.** In progress.

Three states are tracked separately throughout and must never be conflated:

| State | Meaning |
|---|---|
| **Reviewable implementation complete** | Code exists, is tested, merged to the branch or in a reviewable PR |
| **Isolated acceptance passed** | Verified against isolated data with recorded evidence |
| **Operationally activated** | Approved by HKSCDA and enabled in production |

Nothing in this document has reached **operationally activated**. No production
merge, deployment, production data change, or message send has occurred.

## Baseline facts

| Fact | Value |
|---|---|
| Repository | `YNWAforever/hkscda` |
| `origin/main` at session start | `c037cc1` — identical to the audited revision |
| Production deployment | Vercel `dpl_8jCLNvV4KgkFPdYpMPoinb225UqS`, `READY`, built from `c037cc1` |
| Supabase production project | `iihqjzilgawhfdhdevam` — **`.env.local` points here; never used for rehearsal** |
| Isolated rehearsal target | local Supabase stack, API `127.0.0.1:55321`, DB `127.0.0.1:55322` |
| Gates at baseline | typecheck 0 · test 1969 pass/86 skip/0 fail · lint 0 errors · build 0 |

No commits landed on `main` between the audit and this work, so the audit
baseline was not overtaken on the default branch. 40+ remote branches and 38
local worktrees hold other people's in-flight work; none were modified.

## Completed slices

### Slice A — Sponsorship public identity and consent protection

Commit `c924244`. **Reviewable implementation complete + isolated acceptance passed.**

Closed a live defect on the deployed revision: the public sponsorship form was
the last public entry point writing the supporter master record directly via
`upsert(..., {onConflict:"email"})`, so an unverified submission overwrote an
existing supporter's name, phone, language and source; and it wrote consent rows
unfiltered, so it could flip a prior `opt_out` to `opt_in`. Donations and
volunteer registration already used the protected path; sponsorship was the
outlier.

Now routed through `resolve_public_supporter_identity`, with consent writes
filtered to `opt_out` and opt-in ticks recorded as `supporter_consent_intent`
rows via the existing trigger.

Evidence, against a real Postgres after `supabase db reset` applied all 55
migrations cleanly from zero:

- An unverified submission reusing an existing email resolves `kind=existing`
  and leaves name/phone/language/source untouched, with the prior `opt_out`
  intact and no `opt_in` created. **Acceptance T04 passes.**
- A pledge with an email opt-in tick produces exactly one consent *intent* row
  and zero consent rows.

### Slice B — Admin failure states

Commit `6354e37`. **Reviewable implementation complete + isolated acceptance passed.**

Closed the audit's most visible symptom and its root cause pattern: admin
surfaces destructured query `data`, never read `isError`, and defaulted to
`?? []` / `?? 0`, so an outage rendered as an empty table and zero KPIs.

Added `LoadFailure` / `StatFigure` primitives and `error`/`onRetry` on
`DataTable` with precedence loading → error → empty → rows; applied to
`VolunteerManagement` (tables, three KPIs, both pagers).

Also pinned an invariant a plausible "fix" would break:
`volunteer_activity_counts` is the only source of `approvedParticipants`, and
`rules.ts` derives remaining capacity from it, so degrading an unreadable count
to `0` would present a full activity as empty and permit overbooking. The
repository fails closed; the display half is fixed in the UI.
**Acceptance T02 covered by tests.**

### Working records

Commit `382ca5d`. Baseline verification, 217-entry source defect inventory,
data/API contracts, and the D01–D10 decision log.

## Gate results for the current branch head

Run against the local Supabase stack with all 55 migrations applied.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Test | `bun test` | 2023 pass · 46 skip · 0 fail |
| Lint | `bun run lint` | 0 errors, 41 warnings |
| RLS | `bun run test:rls` | 38 pass · 0 fail |
| Build | `bun run build` | exit 0 (at baseline; re-run before any release candidate) |
| Migration rehearsal | `bunx supabase db reset` | all 55 migrations applied from zero, exit 0 |

**Not yet run:** `verify:brand`, `verify:a11y`, `verify:performance` — these need
a built app and a reachable origin, and belong with the Phase 2 public-layout
work. Recorded as **not run**, not as passed.

**A constraint on claim-making:** all 46 remaining skips are database-backed
tests whose env vars no CI job sets. A green blocking gate proves unit and
boundary behaviour and proves nothing about the database. Any database claim
must cite a real-Postgres run.

## Next slices, in dependency order

1. **Re-check the deployed schema (Phase 1.1).** The audit's central finding is
   that migrations exist in Git but the objects are absent from the deployed
   project. This session did **not** query production. A read-only metadata query
   (`to_regclass` / `to_regprocedure`) for `donation_delivery_job`,
   `manual_gift_request`, `record_manual_gift_with_audit`,
   `claim_donation_delivery_job`, `volunteer_activity_counts`,
   `set_volunteer_registration_status_with_audit`, and the `donation.contact_*`
   columns must come before any repair plan.
   **Blocked on read access to the production database.**
2. **Apply the failure-state contract to the remaining surfaces (Phase 1.3).**
   `routes/admin/index.tsx`, `PaymentsReconcile`, `AccessManagement`, and the CRM
   supporter detail, whose extension sections must fail independently of the
   master record. The primitives from Slice B exist; this is application.
3. **CRM supporter detail resilience (Phase 1.2).** The detail read embeds
   `donation_delivery_job(id,status)` and throws on error, so one absent table
   fails the whole page. Needs the section to fail independently.
4. **Demonstration-data inventory (Phase 1.5).** Four of the seven named demo
   items appear nowhere in source, so the inventory must be built from the
   database per-ID. Also: `scripts/import-hkscda-animals.js` builds a
   service-role client with no project-ref guard and is exposed as
   `bun run import:hkscda` — it can write to production. That guard is
   independent of database access and can be closed now.
5. **Phase 2 asset inventory** may proceed in parallel: original-site page/ID to
   reference number to UUID mapping, with matching confidence and a
   missing-photo list by ID and reason.

## Precise blockers

| Blocker | Blocks | Needed |
|---|---|---|
| No read access to the production database in this session | Phase 1.1 schema reconciliation and any claim about deployed objects | A read-only connection, or the drift re-checked by someone who has one |
| D01, D02, D03, D08 unresolved | Evening auto-opening, 48-hour release, operational daily-20 counting, publishing new morning sessions | HKSCDA decisions; see the decision log. Surrounding functionality proceeds behind policy versions |
| Morning session start/end times never supplied | Publishing morning sessions | Operations input |
| Original-site photo assets | Phase 2 completion | Recoverable original files; unavailable ones are recorded by ID with a reason, not substituted |

## Release position

No release action is proposed yet. `vercel.json` disables preview deployments
only for the `*layout*` branch patterns, so pushing this branch under its current
name **would** publish a preview — which conflicts with AGENTS.md's instruction
not to create a public preview while review access is meant to remain private.
Resolve that before pushing.

Merging to `main` triggers a production deployment and requires explicit release
approval. A concrete release request will follow reviewable code, a migration
diff, isolated rehearsal evidence, data reconciliation, and a recovery plan — not
before.
