# Admin Write-Path Trace Design

## Goal

Find latent data-correctness bugs in the two largest admin screens —
`ContentEditor` (1423 lines) and `AnimalPipeline` (1336 lines) — by tracing every
write back to its source.

This is prophylactic. No staff member has reported a problem on either screen.
The work is justified by precedent rather than symptom: the one genuine
data-correctness bug found so far on this codebase (`GroupEnquiryManagement`
saving operator notes onto the wrong record) came from reading a 165-line file,
and was invisible to every heuristic scan run against it.

## Approved Approach

Backward-trace from each write site, rather than sweeping all state or writing
characterization tests first.

Rejected alternatives:

- **Invariant checklist across all state.** Would cover 28 `useState`/`useEffect`
  declarations instead of 9 write sites, most of them presentational state where
  a desync causes no harm, and offers no natural stopping point.
- **Characterization tests as the discovery method.** The project has no DOM
  testing library, so interaction testing is unavailable. This was hit directly
  when fixing the `adminNotes` bug: the `useEffect` version was untestable under
  `renderToStaticMarkup` and had to be restructured into a keyed remount to be
  verifiable. Tests remain the way to *lock in* findings, not to *discover* them.

## Scope

| | ContentEditor | AnimalPipeline |
| --- | --- | --- |
| `useMutation` definitions | 12 | 3 |
| `.mutate(` call sites | 6 | 3 |
| `useState` declarations | 12 | 9 |
| `useEffect` | 3 | 4 |

The unit of work is the 9 `.mutate(` call sites. Presentational JSX is out of
scope; it is read only when a trace passes through it.

## The Trace Procedure

Each write site answers the same six questions.

1. **Target identity** — what identifies the record being written? A row passed
   into the handler, a `selectedId` read from state, or a value closed over?
2. **Freshness** — can that identifier be stale relative to what is rendered? A
   handler defined before a selection change captures the earlier value.
3. **Payload provenance** — for each field in the payload, where did it come
   from, and is it seeded from the same record the identifier points at? This is
   the question `adminNotes` failed: identifier from one enquiry, text from
   another.
4. **Reset discipline** — if the payload draws on component state, what resets
   that state when the target changes? Keyed remount, explicit reset, or nothing?
5. **Failure handling** — on error, is the operator told, or does the interface
   look as though it saved? Is optimistic state rolled back?
6. **Guard** — is the write destructive, and is it confirmed or status-gated?

9 sites × 6 questions = 54 checks. **The stopping rule is all 54 answered**,
including the answers that are "fine".

## Finding Classification

| Class | Meaning | Handling |
| --- | --- | --- |
| P0 | Writes to the wrong record, or writes wrong data | Fix + regression test |
| P1 | Silent failure; operator believes the write succeeded | Fix + regression test |
| P2 | Unguarded destructive action | Fix inline |
| P3 | Raw enums, missing labels, absent detail | Batch into one trailing commit |

A sweep that finds nothing is a valid result and will be reported as such.
Earlier heuristic scans in this codebase overcounted consistently — 4 pagination
findings resolved to 2 real, 7 destructive-action findings to 2, and 6
accessibility findings to 0. Reporting zero is preferable to padding.

## Verification

Static tracing establishes that a bug is *possible*. Production `audit_log` can
sometimes establish whether it has *happened* — but more weakly than an earlier
draft of this document claimed, and the correction matters enough to state
plainly.

**`AnimalPipeline` does not write browser-direct.** Despite being listed among
the legacy surfaces in CLAUDE.md, its only two writes go through the API layer:

- `lifecycleMutation` → `PATCH /api/admin/adoptions/animals/{id}/status`
- `saveProfileMutation` → `PUT /api/admin/adoptions/animals/{id}/internal`

Both are service-role writes where `auth.uid()` is null, so `log_animal_mutation`
deliberately skips them. Its `detail.changed` `{from, to}` pairs are therefore
**not** available for this screen. The audit rows that do exist come from the
app-layer inserts added on 2026-08-04 (`animals.status_update`,
`animal_profile_internal.upsert`), carrying `actor_user_id`, `entity_id` and the
resulting record — but no before-value.

That still supports a weaker check. For a P0 candidate in `AnimalPipeline`, query
`audit_log` for the affected actor and look for temporal anomalies: the same
actor writing a different `entity_id` than the record they had open, or two
writes seconds apart against different animals. This can corroborate a
stale-identifier bug. It cannot show a wrong-value bug, because there is nothing
to diff against.

The strong `{from, to}` corroboration exists only for the genuinely
browser-direct writers — `AnimalsTable` (`supabase.from("animals").delete()`) and
`AnimalForm` (insert and update). Both are outside this sweep's scope; if a
finding here suggests the same bug shape exists there, that is a follow-up, not a
scope expansion.

`ContentEditor` writes through the API layer throughout and has no corroboration
route at all. It stays static-only.

Connection details for the production query are in the `hkscda-supabase-access`
memory: the direct host is IPv6-only and unreachable, so use the `aws-1`
session pooler.

## Testing

Regression tests use the established pattern — `mock.module` over
`@tanstack/react-query` and `@tanstack/react-router`, then `renderToStaticMarkup`
(see `SupporterList.test.tsx`, `VolunteerManagement.test.tsx`).

Where a fix is not reachable through SSR rendering, the component is restructured
until it is, rather than shipped untested. Any such restructuring is called out
explicitly in its commit message: it changes working production code to satisfy a
test, and that trade-off should be visible to a reviewer rather than folded in
silently.

## Deliverable

A branch off `main` taken *after* the prerequisite pull request below has merged,
containing:

- One commit per coherent fix, each carrying its regression test.
- A findings table in the pull request body covering all 9 sites and their
  answers, including the clean ones.
- P3 cosmetics in a single trailing commit, kept separate so they do not obscure
  the correctness work.

## Risks

- **Restructuring for testability modifies working code.** The keyed remount was
  a net improvement, but it was still a refactor performed to satisfy a test.
  Each instance is flagged rather than absorbed.
- **The sweep may find nothing.** Prophylactic work frequently does not. Nine
  clean traces is a plausible and acceptable outcome.
- **Cost.** The read is bounded but not cheap. The session preceding this design
  had already spent roughly $500.

## Prerequisite

Five commits on `fix/audit-hardening` are stranded: PR #52 merged on 2026-08-03,
and everything pushed afterwards has no open pull request.

```
cfa7e83  test: render the rewritten admin screens instead of grepping their source
16fd830  fix: label the last raw enums in the admin UI
935ed90  fix: page, label and confirm the remaining admin screens
bc218d3  fix: add page controls and a mobile layout to the admin tables
415f911  feat: make the volunteer admin screen show who applied to what
```

These need their own pull request against `main` before this work starts, so the
sweep branches from a clean base rather than stacking on unmerged work.

## Out of Scope

- Admin screens other than the two named.
- Performance work on the admin surface.
- The three migrations still absent from production (`donation.acquisition_*`,
  `webhook_event.processing_*`, `validate_rpc_actor()`).
