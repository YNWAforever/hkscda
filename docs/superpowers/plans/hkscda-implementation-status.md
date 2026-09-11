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

### Slice C — Production-write guard on the animal importer

Commit `75736c3`. **Reviewable implementation complete + isolated acceptance passed.**

`bun run import:hkscda` built a service_role client from `VITE_SUPABASE_URL` with
no project-ref check. It reads `.env.local`, which in this checkout points at the
live project, so one command would have written scraped animal rows and public
storage objects over real animal records with RLS bypassed. Now guarded by the
tested `isProductionProjectRef` already exported by `seed-admin.js`, checked
before the client is constructed.

Verified both directions: the production ref exits 1 with a refusal; a local
stack URL passes and proceeds to fail only on the genuinely missing scraped-data
file.

`scripts/import-adoption-guide-drafts.mjs` has the same missing guard and was
deliberately **not** blocked — it needs an explicit `--apply` plus an actor id and
creates content drafts rather than overwriting master records, so production use
may be legitimate. Flagged for an owner decision.

### Slice D — Failure states on the remaining admin surfaces

Commit `d757070`. **Reviewable implementation complete.**

Applied the Slice B contract to `routes/admin/index.tsx`, `PaymentsReconcile`
and `AccessManagement`. Each previously rendered an outage as real data: an empty
animal table, "0 awaiting reconciliation / HK$0.00 confirmed", and
"0 active admins / 0 pending invites" — the last a misleading answer to a
security question.

### Slice E — CRM supporter detail resilience

Commit `0e8200c`. **Reviewable implementation complete + isolated acceptance passed.**

The supporter detail read selected `*,donation_delivery_job(id,status)` and threw
on any error from it, so an absent extension table removed the entire supporter
master record — the failing detail page the audit recorded. The donation read now
retries without the embed when the embedded form fails, and reports the extension
as absent rather than as a delivery job in a default state.

Not a blanket catch: if the plain donation select also fails, the original error
propagates. Tests cover both directions, and that the fallback preserves
`amount_cents` exactly.

### Slice F — Animal photo immutable path (Phase 2)

Commit `dd101e3`. **Reviewable implementation complete + isolated acceptance passed.**

AnimalForm uploaded to the fixed path `${animalId}.jpg` with `upsert: true`
*before* the database write, and the save-failure branch returned without
touching storage — so the existing photograph was destroyed the moment a file
was chosen. Uploads now land on a new immutable path via a signed URL from a new
admin route; a failed save removes only its own orphan.

Two further defects found and fixed: no migration ever created the
`animal-images` bucket (a clean install had no bucket at all), and a new
animal's photo path used a UUID never sent in the insert, so it was unrelated to
its own row. **Acceptance T07.**

### Slice G — Catalogue eligibility in the CMS (Phase 2)

Commit `3f79f02`. **Reviewable implementation complete.**

Admin filtered `.eq("type", section)` while the public side filters on the
eligibility booleans, so a sponsorship-eligible cat was visible to the public but
unreachable by staff. The admin list now filters sponsorship by eligibility, and
the editor gained explicit 可供領養 / 可供助養 controls. A test pins admin/public
parity. **Acceptance T06/T11.**

### Slice H — Photo-led public cards and the 助養區 entry (Phase 2)

Commit `957ca2d`. **Reviewable implementation complete + browser-verified.**

The card was an 88px avatar card; the photograph now leads at 4:3. 助養區 is a
top-level navigation group with 助養區小朋友, which existed nowhere in the
product before. Verified in a real browser: `verify:brand` 26 routes × 5
viewports and `verify:a11y` 26 routes, both exit 0. **Acceptance T10/T11.**

### Slice I — Database transaction suites actually run (Phase 1.6)

Commit `d011766`. **Isolated acceptance passed.**

The Phase 1.6 coverage already existed and had never run, because no CI job set
the suites' opt-in variables. `test:db` now runs them from the job that already
starts the stack: 37 pass, plus 38 RLS — 75 database-backed tests executing
instead of skipping, including rollback-on-audit-failure and
capacity-reduction-racing-approval. **Acceptance T01/T03.**

### Working records

Commits `382ca5d`, `fb47f72`. Baseline verification, 217-entry source defect
inventory, data/API contracts, the D01–D10 decision log, this status record and
the migration/release plan.

## Gate results for the current branch head

Run against the local Supabase stack with all 55 migrations applied.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Test | `bun test` | 2043 pass · 46 skip · 0 fail (same under `--isolate`, as CI runs) |
| Database | `bun run test:db` | 37 pass · 0 fail |
| Brand | `bun run verify:brand` | 26 routes × 5 viewports, exit 0 |
| A11y | `bun run verify:a11y` | 26 routes, exit 0 |
| Lint | `bun run lint` | 0 errors, 41 warnings |
| RLS | `bun run test:rls` | 38 pass · 0 fail |
| Build | `bun run build` | exit 0 (at baseline; re-run before any release candidate) |
| Migration rehearsal | `bunx supabase db reset` | all 55 migrations applied from zero, exit 0 |

**Not yet run:** `verify:performance` (Lighthouse). Recorded as **not run**, not
as passed.

**A constraint on claim-making:** the 46 remaining skips are still
database-backed tests, but the main transaction suites now run via `test:db`
against a real Postgres. `rls-matrix` remains `continue-on-error: true`, so a red
database test still reports as a green CI run until the owner promotes that job
through branch protection.

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
2. **Demonstration-data inventory (Phase 1.5).** Four of the seven named demo
   items appear nowhere in source, so the inventory must be built from the
   database per-ID, not from a source grep.
3. **Basic transaction verification (Phase 1.6).** With isolated data, exercise a
   volunteer activity edit/approval and a manual donation through success, retry,
   version conflict, and rollback on audit failure. Restoring reads does not
   establish that the administration system works.
4. **Remaining failure-state surfaces.** Slices B and D covered the highest-value
   screens; the defect inventory lists further `?? []` / `?? 0` sites to work
   through with the same primitives.
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
