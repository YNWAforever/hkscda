# Admin audit SP-5b: admin UX conformance

Status: approved design, 2026-10-10. Branch: `codex/audit-final-sp5b-20261010`, stacked on SP-5a
(PR #205, `codex/audit-final-sp5a-20261009`).

This is sub-project SP-5b of the 2026-10-07 admin audit follow-up. SP-5a settled the language rule
of the audit's section 8 ("Admin UX specification"). SP-5b closes the rest of section 8 where it
matters to a part-time volunteer using the admin every day.

## Goal

Every admin screen behaves the same way at the moments that matter:

- when a screen fails to load;
- when the session runs out;
- when staff confirm something destructive or financial;
- when staff look for where they are.

Each shared piece is built once and used everywhere, and a guard test keeps it that way.

## Evidence

A read-only survey of SP-5a's head (2026-10-10) checked 32 section 8 rules. The full reports are in
`docs/evidence/sp5b-survey-20261010/` (`nav.md`, `components.md`, `a11y.md`).

- **Navigation and templates (11 rules): 0 done, 8 partly done, 3 missing.**
  - No `$id` route shows the record name in its breadcrumb.
  - Three breadcrumb implementations exist, and volunteer pages show two at once.
  - The `h1` matches the nav label in both languages on 11 of 25 destinations.
  - Nine pages render no `h1` while loading or on error.
  - Ten volunteer pages are registered only in `volunteerWorkspace.ts`.
  - `TaskOverview` and `SupporterDetail` nest a second `<main>`.
- **Components and page states (12 rules): 1 done, 7 partly done, 4 missing.**
  - No destructive or financial action uses a dialog. There are 16 `window.confirm` calls, and the
    only `AlertDialog` is a discard prompt.
  - About 26 of 43 such actions record no reason, and voiding a receipt stores `'manual'`.
  - `fetchAdminJson` drops the HTTP status for most routes. No 401 handling exists, and the login
    route takes no `redirect`.
  - `LoadFailure` has no status classes. About 20 screens show a bare banner with no retry, and
    some show an error and an empty sentence together.
  - Four private `StatusChip` copies remain (`AdopterDetail`, `CaseDetail`, `MatchPanel`,
    `TaskPanel`).
  - Eight zh date formats and four zh money formats are in use. CRM zh money drops cents, and
    adoption and sponsorship dates take the UTC day.
- **Copy, accessibility and maintainability (9 rules): 2 done, 6 partly done, 1 missing.** The
  missing cron rule is met on `main` through SP-2.
  - About half the zh error strings give no next step.
  - 15 zh action buttons are named after states.
  - About 20 error messages are silent to assistive technology.
  - The animal form's "draft saved" shows in error red.
  - 45 `<button>`s have no class.
  - The app mounts no toast.
- **Corrections to the audit:**
  - The volunteer workspace is a grouped vertical sidebar of 13 pages, not an overflowing tab bar.
  - Login and reset-password have an `h1`.
  - `MatchPanel` no longer writes from the browser.
  - The design-token guard exists (`adminTokenGuard.test.ts`).
  - There are 7 bulk panels, not 3.

## Decisions (owner, 2026-10-10)

1. **Scope.** Build the shared behaviour and structure. zh wording changes (verb labels, next-step
   errors, one conflict sentence, new labels) are drafted into an owner review list, not shipped.
   The one deliberate zh output change is the unified zh date and money format, which also fixes
   the UTC-day and lost-cents bugs.
2. **Reasons.** A required reason that lands in `audit_log` applies to financial and irreversible
   actions only. Every other destructive action gets the same dialog without a reason field.
3. **Extras.** The volunteer sidebar regroup (日常 · 人員 · 政策) is included. Upload progress and
   retry, unified bulk panels and copy buttons on IDs become follow-ups.
4. **Delivery (Option A).** One spec, two PRs:
   - **SP-5b-1:** everything except reason storage. It has no migration.
   - **SP-5b-2:** the server and audit changes for required reasons, stacked on SP-5b-1. Its
     migrations must reach production before merge.

## Design

### 1. Failure states and session expiry (SP-5b-1)

**Status survives.** `fetchAdminJson` (`src/lib/admin/session.ts`) keeps the HTTP status on the
error it throws, through a typed error that carries `status`. Its message behaviour, including the
server-message mapping, is unchanged.

**`LoadFailure` names the failure class and always offers retry.** The status maps to a class and
a next step:

| Status  | Class                  | Next step                                |
| ------- | ---------------------- | ---------------------------------------- |
| 403     | No access              | A link to the role's first allowed route |
| 404     | Not found              | Back to the list                         |
| 5xx     | Server problem         | Retry                                    |
| Network | Can't reach the server | Retry                                    |

- **Wording.** The English class lines are new copy. The zh class lines are drafted for the owner
  list. Until they are approved, zh keeps today's generic `LoadFailure` text and shows no class
  line.
- **Every error goes through `LoadFailure`.** Every screen that renders a query error as a bare
  banner switches to `LoadFailure` with retry. A screen in error never also shows its empty
  sentence.
- **Guard.** A static guard fails when an admin query error is rendered outside `LoadFailure`. The
  existing raw-error-render guard stays.

**Session expiry returns staff to their page.**

- **Detection.** `AdminLayout` watches for an expired session in two ways: the React Query cache's
  global error hook (for `AdminSessionError` or a 401), and Supabase `onAuthStateChange`
  `SIGNED_OUT`.
- **Redirect.** On either, it navigates to `/admin/login?redirect=<path and search>`.
- **Validation.** The login route accepts `redirect` only as a same-origin path starting with
  `/admin/`. Tests reject `//host`, `/\host`, absolute URLs, `javascript:` and encoded variants.
- **After sign-in.** It navigates to the redirect, or to the role's first allowed route.
- **Unsaved edits.** Edits in open forms are not preserved across the redirect.

**Forbidden.** Page-level access already redirects to `/admin/access-denied`, so it stays. An API
403 inside a page is covered by the "No access" class.

**Conflicts (409).** Each editor keeps its handling, and edits already stay in the form. There are
about a dozen zh conflict sentences today, two of them in English. They go on the owner list with
one proposed sentence, 「另一位同事已更新此記錄」, plus reload.

### 2. Confirmation dialog (SP-5b-1) and required reasons (SP-5b-2)

**`ConfirmActionDialog`** (`src/components/admin/ConfirmActionDialog.tsx`) is built on the shadcn
`AlertDialog`.

- **Props:**
  - `title`;
  - a consequence sentence;
  - the confirm button's verb;
  - a `destructive` variant;
  - `reason: "none" | { required: true, minLength }`;
  - an async `onConfirm`.
- **Focus.** It traps focus, Esc cancels, and focus returns to the trigger.
- **Reason field.** A required reason disables confirm until the trimmed text meets `minLength`.
  It is capped at 500 characters.
- **Pending and error.** Both show inside the dialog. A failure keeps the dialog open with the
  reason intact, and error text goes through `adminErrorMessage`.
- **Copy.** Its copy is bilingual. New zh labels are drafted for the owner list. Until they are
  approved, zh uses the nearest existing wording (原因 for the reason label).
- **Rollout in SP-5b-1.** It replaces all 16 `window.confirm` calls and the remaining ad hoc
  confirms, with `reason: "none"`, so server behaviour is unchanged. A guard fails on any
  `window.confirm` in admin code.

**Required reasons (SP-5b-2).** These actions use `reason: { required: true }`:

- void and refund a receipt;
- reallocate or reconcile a payment;
- end a sponsorship;
- reject a pledge proof, a registration, an application or an internship;
- delete a status, a FAQ, a document, an estate, a fee, a board member or a payment method;
- cancel an activity or a case;
- the bulk versions of these.

The reason travels:

1. from the dialog to the API route, where zod checks it (trimmed, 1-500 characters);
2. through the service to the domain's `*_with_audit` RPC;
3. into the reason in the `audit_log` row.

**Server changes.**

- Where an RPC does not take a reason yet, a new migration adds a `p_reason text` argument. The
  function keeps its pinned `search_path` and its `service_role` grant.
- Voiding a receipt stores the staff reason instead of `'manual'`.
- The internship review keeps writing `internship_event`, and also writes its `audit_log` row.

**Tests.**

- One test lists every required-reason action and proves its route passes the reason through.
- Migration and RLS tests cover each new argument.
- Each domain gets an English and a zh render of the dialog.

### 3. Navigation, page titles, status badges and formats (SP-5b-1)

**`AdminBreadcrumb`.** One breadcrumb, driven by the nav model, reading group / destination /
record name.

- It replaces the three current implementations and removes the duplicate on volunteer pages.
- Record pages pass the name they have already loaded: the case applicant and reference, the
  supporter name, the pledge reference, the volunteer name, the registration, the content title
  and the animal name.
- While the name loads, the crumb ends at the destination.
- A test renders each `$id` route's crumb in both languages.

**One `h1` per page.** Each `h1` matches its nav or tab label in both languages.

- It renders through `AdminLayout`, while loading and on error too.
- The adoption "page content" tab gains its `h1`.
- The nested `<main>` in `TaskOverview` and `SupporterDetail` becomes a `div`.
- A guard asserts exactly one `h1` on every smoke-rendered destination, in each state the smoke
  test renders.

**Volunteer sidebar.**

- It regroups into 日常 · 人員 · 政策, reusing existing labels where possible. New group labels go
  on the owner list, with English meanwhile.
- The 10 pages registered only in `volunteerWorkspace.ts` move into the `adminNav.ts` model with
  their roles.
- `adminNav.test.ts` and the smoke test cover them.

**`StatusBadge`.** The four private `StatusChip` copies are replaced by `StatusBadge`.

- Its nine colour keys stay, because staff already pick among them.
- A guard fails on a new local status chip or status colour map in admin code.

**One zh date and money format.**

- Every zh branch uses the shared `formatAdminDate`, `formatAdminDateTime` and `formatAdminMoney`
  (`src/components/admin/i18n/format.ts`). These already render `2026年10月7日 (三)` and
  `HK$1,234.00` in Hong Kong time.
- `formatLegacyAdminDateTime` and the per-screen zh formatters are removed. This fixes the UTC-day
  bug at every `slice(0, 10)` display site, and the CRM lost-cents rounding.
- The zh render pins for dates and money are updated in the same commits. No other zh pin may
  change.
- Items D1 and D2 of the SP-5a owner review list close.

### 4. Accessibility (SP-5b-1)

- **Status and error messages.** Save and status messages use `role="status"`, and errors use
  `role="alert"`. This covers the silent error messages the survey found.
- **Success styling.** The animal form's "draft saved" uses the success style, not the error style.
- **Live counts.** The result counts in `DataTable` and `TablePager`, and the bulk preview counts,
  sit in an `aria-live="polite"` region.
- **Buttons.** The 45 unstyled `<button>`s use the shared `Button`, or get a 44 px minimum target.
  A guard fails on an admin `<button>` with neither the shared primitive nor a class.
- **Focus after mobile navigation.** It lands on the page `h1`. Section 3 guarantees the `h1`, and
  a unit test pins the focus move.

### 5. The owner review list (SP-5b-1)

`docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md` holds the drafted zh wording
for approval. Each item has its file:line and its current text. It covers:

- the `LoadFailure` class lines;
- the dialog labels;
- verb button labels: the 15 state-named buttons, and the 確定 wording of the replaced confirms;
- next-step error wording: about 108 copy strings and 21 server strings;
- the conflict sentence;
- the volunteer group labels.

Nothing on the list ships in SP-5b. Applying approved items is a copy-only follow-up.

## Non-goals

- Upload progress and retry, unified bulk panels, copy buttons on IDs, and autosave. These are
  follow-ups.
- Full template conformance (the zones of the list, detail, editor and settings templates), beyond
  the shared pieces above.
- Preserving unsaved form edits across a session redirect.
- Any zh wording change other than the date and money formats.
- The pre-existing bugs already spun off: the assessments job list and the volunteer 403 message.

## Global constraints

- **Branches and merging.**
  - Stacked on #205. SP-5b-2 is stacked on SP-5b-1.
  - Merging to `main` deploys production and needs release approval.
- **zh rendering** stays byte-identical, except for the date and money formats in section 3.
- **SP-5a's rules still hold:**
  - bilingual copy modules;
  - the copy guard and the raw-error-render guard;
  - the English smoke test;
  - glossary terms;
  - no invisible characters or BOMs.
- **Project rules:**
  - injectable clocks, with new tests clock-shift checked;
  - `var(--color-*)` tokens only;
  - zero `any`;
  - admin data only through `/api/admin/**` with `requireAdmin`;
  - service-role mutations audited inside a `*_with_audit` RPC.
- **The gate:**
  - `bunx tsc --noEmit`;
  - `bun run lint`, with no new warnings;
  - `bun run test`, with `SUPABASE_LOCAL_URL` pointed nowhere;
  - `bun run build`, with `routeTree.gen.ts` current.
- **Migrations (SP-5b-2 only).**
  - Timestamped, with a pinned `search_path`, RLS kept, and a `service_role` grant.
  - Never run against the shared local stack.
  - Applied to production before merge.

## Testing

- TDD for every shared piece.
- A guard test for every new rule:
  - query errors rendered outside `LoadFailure`;
  - `window.confirm`;
  - local status maps;
  - a missing or duplicate `h1`;
  - unstyled buttons;
  - an unsafe `redirect`.
- Every existing test stays green. The only zh pins that change are the date and money ones.
- The English smoke test keeps its empty allow-list.

## Delivery order

**SP-5b-1**, one PR on #205, subagent-driven:

1. Failure plumbing: the status on errors, `LoadFailure` classes and retry, and the banner sweep.
2. Session expiry and the login `redirect`.
3. `ConfirmActionDialog`, replacing every confirm.
4. `AdminBreadcrumb`, the `h1` rule and the `<main>` fixes.
5. Volunteer nav regroup and registration.
6. `StatusBadge` consolidation.
7. zh date and money unification.
8. Accessibility.
9. The owner list, guards and finish.

**SP-5b-2**, a second PR on SP-5b-1: the required reasons, with migrations, server changes, tests
and the production gate.

## Owner gates

- **Before SP-5b-1 merges:**
  - #205 merged;
  - the drafted owner list reviewed (its decisions can follow later);
  - release approval.
- **Before SP-5b-2 merges:**
  - its migrations applied to production;
  - release approval.
