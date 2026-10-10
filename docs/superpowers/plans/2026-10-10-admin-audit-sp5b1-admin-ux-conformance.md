# Admin audit SP-5b-1: admin UX conformance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every admin screen handles load failures, session expiry, confirmations, navigation, status labels, dates and money, and accessibility the same way. Each of these comes from one shared piece, and a test guards each one.

**Architecture:** each shared piece is built once in `src/components/admin/`, then the screens are swept onto it, and a static guard test locks it in. The pieces are:

- `LoadFailure` with status classes;
- a session watcher in `AdminLayout`;
- `ConfirmActionDialog`;
- a breadcrumb driven by the nav model;
- `StatusBadge`;
- the shared formatters.

zh wording changes are drafted into an owner list, not shipped. The one deliberate zh output change is the date and money format (Task 7).

**Tech Stack:**

- TanStack Start (React 19, file routes) and TanStack Query;
- Supabase auth;
- shadcn/Radix `AlertDialog`;
- Tailwind 4 with `var(--color-*)` tokens;
- Bun (`bun:test`, `renderToStaticMarkup`, no DOM library).

**Spec:** `docs/superpowers/specs/2026-10-10-admin-audit-sp5b-admin-ux-conformance-design.md`. The evidence, with per-site lists and file:line references, is in `docs/evidence/sp5b-survey-20261010/` (`nav.md`, `components.md`, `a11y.md`). Each task names the evidence section it sweeps.

## Global Constraints

- **Worktree:** `.worktrees/audit-final-sp5b-20261010`, branch `codex/audit-final-sp5b-20261010`, stacked on SP-5a (`codex/audit-final-sp5a-20261009`). Never push. Never touch another worktree.
- **zh output:**
  - zh rendering stays byte-identical, except for the zh date and money formats in Task 7.
  - New zh wording is never shipped. Where English gains a new line, the zh half keeps today's text, or shows nothing new.
  - Each new zh draft goes on the owner list (Task 9) with its file:line.
- **Existing rules stay in force:**
  - Every admin string lives in a bilingual `copy.ts` or `*Copy.ts` built with `defineAdminCopy`.
  - These stay green: `adminCopyGuard.test.ts`, `adminErrorRenderGuard.test.ts`, `-routeLayoutGuard.test.ts`, and `adminEnglishSmoke.test.tsx` with its empty allow-list.
  - English follows `docs/admin-glossary.md`.
- **Code rules:**
  - `var(--color-*)` tokens only.
  - No `any`.
  - Admin data only through `fetchAdminJson`.
  - No new browser storage.
- **Clocks:**
  - Functions whose behaviour depends on time take `now = () => new Date()`.
  - Run every new test file under a `--preload` that calls `setSystemTime`, once at 2026-12-15 and once at 2026-12-31T16:30:00Z.
- **Files:**
  - Read Chinese with the Read tool.
  - Never write invisible characters or BOMs. The Write and Edit tools decode `\uXXXX`, so convert such escapes back with a PowerShell `[regex]::Replace`.
- **Gate before every commit:**
  - `bunx tsc --noEmit` exits 0.
  - `bun run lint` shows 0 errors and no new warnings over the baseline.
  - `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test` shows 0 fail.
  - After any route change, `bun run build` passes, and `src/routeTree.gen.ts` is committed.
- **Commits:**
  - Conventional Commits, written BOM-free with `[IO.File]::WriteAllText` and committed with `git commit -F`.
  - Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Stage by explicit path. No bare `git stash`.

## Review Focus

1. **Open redirect.** A crafted `redirect` on the login page could send staff off-site. `//evil.example`, `/\evil`, `https://…`, `javascript:…`, `%2F%2Fevil` and `/admin@evil` must all be rejected, falling back to the role's first allowed route (Task 2).
2. **Concurrent session failures.** Several queries can fail with 401 at once, or the session can lapse while the login page itself is open. Staff must get exactly one navigation to login, no redirect loop, and a `redirect` that never points at `/admin/login` (Task 2).
3. **A failing or doubled confirm.** When a confirm fails mid-request or is double-clicked, `onConfirm` runs once, the dialog stays open showing the error, and the typed reason is kept (Task 3).
4. **A record page with no name.** When the record fails to load (404) or has an empty name, the crumb ends at the destination. It never shows "undefined" or an empty last crumb (Task 4).
5. **Boundary and broken dates in zh.** At the Hong Kong day boundary, `2026-10-06T16:30:00Z` renders `2026年10月7日 (三)`. An empty or invalid stored date renders the screen's existing placeholder, never "Invalid Date" (Task 7).

---

### Task 1: Failure plumbing (status, `LoadFailure` classes, banner sweep)

**Evidence:** `components.md` S3, C6 and S1-S2. That covers about 20 bare banners and the screens that render an error and an empty state together.

**Files:**

- Modify:
  - `src/lib/admin/session.ts`;
  - `src/components/admin/LoadFailure.tsx` and its copy module;
  - every bare-banner screen listed in the evidence.
- Create: `src/components/admin/adminQueryErrorGuard.test.ts`.
- Test: `src/lib/admin/session.test.ts`, `src/components/admin/LoadFailure.test.tsx`.

**Interfaces:**

- Produces:
  - `AdminApiError`, and every error that `fetchAdminJson` throws, carries `status: number | null` (`null` for a network failure). `AdminSessionError` has `status: 401`.
  - `export type FailureClass = "forbidden" | "not_found" | "server" | "network" | "unknown"`.
  - `export function failureClass(error: unknown): FailureClass`, in `LoadFailure.tsx`.
  - `LoadFailure` props gain `onRetry: () => void`, and it is required.
- Consumed by: Task 2, through `status === 401` and `AdminSessionError`.

- [ ] **Step 1: Write the failing tests.**
  - `fetchAdminJson` preserves the status on 403, 404 and 500, and gives `null` on a network `TypeError`.
  - `failureClass` maps 401 and 403 to `forbidden`, 404 to `not_found`, 5xx to `server`, a network failure to `network`, and anything else to `unknown`.
  - `LoadFailure` renders the English class line for each class, plus a Retry button that calls `onRetry`.
  - In zh it renders exactly today's markup, so the existing zh pins still pass.
- [ ] **Step 2: Run them and confirm they fail.** `bun test --isolate src/lib/admin/session.test.ts src/components/admin/LoadFailure.test.tsx`
- [ ] **Step 3: Implement.**
  - The English class lines:
    - forbidden: "You don't have access to this. Go to a page your role can open.", with a link to `firstAllowedAdminRouteForIdentity`;
    - not found: "This record could not be found. Go back to the list and check it still exists.";
    - server: "The server had a problem. Try again in a moment.";
    - network: "Could not reach the server. Check your connection and try again.";
    - unknown: today's English text.
  - The zh half adds no line.
  - Draft the zh lines into a scratch list, `docs/superpowers/plans/sp5b-owner-drafts.md`. Every later task appends to it.
- [ ] **Step 4: Sweep the screens.**
  - Every screen in the evidence that renders a query error as a banner renders `<LoadFailure error onRetry={() => query.refetch()} />` instead.
  - A screen in error never also renders its empty sentence.
  - zh pins stay byte-identical. If a zh banner had text that `LoadFailure` lacks, keep that text through a prop rather than adding new wording.
- [ ] **Step 5: Add the guard.** `adminQueryErrorGuard.test.ts` fails when admin code renders a query's `error` without a `LoadFailure`, or renders a `LoadFailure` with no `onRetry`.
  - A line may opt out with the marker `// admin-load-failure-ok: <reason>`.
  - Include a non-vacuity check and synthetic self-tests, following `adminErrorRenderGuard.test.ts`.
- [ ] **Step 6: Gate, then commit** `feat(admin): name the failure and offer retry on every load error`.

### Task 2: Session expiry and the login `redirect`

**Files:**

- Create:
  - `src/lib/admin/loginRedirect.ts` and `src/lib/admin/loginRedirect.test.ts`;
  - `src/components/admin/useSessionExpiryRedirect.ts` and its test.
- Modify:
  - `src/components/admin/AdminLayout.tsx`, to mount the hook;
  - `src/routes/admin/login.tsx`, whose `validateSearch` gains `redirect`;
  - the login page component, to navigate after sign-in.

**Interfaces:**

- Consumes: Task 1's `status` and `AdminSessionError`.
- Produces:
  - `export function safeAdminRedirect(value: unknown): string | null`. It returns the value only if all of these hold:
    - it is a same-origin path matching `^/admin(/|$)`;
    - it has no `//` and no `\` anywhere;
    - it is not `/admin/login` or `/admin/reset-password`.

    Otherwise it returns `null`.

  - `export function loginUrlFor(pathWithSearch: string): string`.
  - `useSessionExpiryRedirect(queryClient)`, used in `AdminLayout`.

- [ ] **Step 1: Write the failing tests.**
  - `safeAdminRedirect` accepts `/admin/animals?page=2` and `/admin`.
  - It rejects every Review Focus 1 input, plus `/admin/login?x=1`, `""`, `null` and non-strings.
  - `loginUrlFor("/admin/cases/abc?tab=notes")` returns `/admin/login?redirect=%2Fadmin%2Fcases%2Fabc%3Ftab%3Dnotes`.
  - The hook (with an injected `navigate` spy and a real `QueryClient`):
    - navigates exactly once when three cached queries fail with `AdminSessionError` in the same tick;
    - navigates once on a Supabase `SIGNED_OUT` event (with an injected `onAuthStateChange`);
    - does nothing while the current path is `/admin/login`.
  - After sign-in, the login page navigates to `safeAdminRedirect(search.redirect) ?? firstAllowedAdminRouteForIdentity(admin)`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Subscribe through `queryClient.getQueryCache().subscribe`, filtering to error events whose error is an `AdminSessionError` or has `status === 401`. Do the same for `getMutationCache()`.
  - A ref guard ensures a single navigation.
  - Unsubscribe on unmount.
  - Inject the Supabase listener so tests can supply their own.
- [ ] **Step 4: Gate plus `bun run build`** (the login route changes), then commit `feat(admin): return to the same page after the session expires`.

### Task 3: `ConfirmActionDialog`, replacing every confirm

**Evidence:**

- `components.md` C2, the action table: 16 `window.confirm` calls plus ad hoc confirms.
- `a11y.md` L1: the 確定 wording.

**Files:**

- Create:
  - `src/components/admin/ConfirmActionDialog.tsx`;
  - `src/components/admin/confirmActionCopy.ts`;
  - `src/components/admin/ConfirmActionDialog.test.tsx`;
  - `src/components/admin/adminConfirmGuard.test.ts`.
- Modify: each confirm site in the evidence.

**Interfaces:**

- Produces:
  ```ts
  type ConfirmReason = "none" | { required: true; minLength: number };
  type ConfirmActionDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    consequence: string;
    confirmLabel: string;
    destructive?: boolean;
    reason: ConfirmReason;
    onConfirm: (reason: string | null) => Promise<void>;
  };
  export function ConfirmActionDialog(props: ConfirmActionDialogProps): JSX.Element;
  export function canConfirm(reason: ConfirmReason, text: string, pending: boolean): boolean;
  ```
- Consumed by: SP-5b-2, which passes `{ required: true, minLength }` per action.

- [ ] **Step 1: Write the failing tests.**
  - `canConfirm`:
    - `canConfirm("none", "", false)` is true;
    - `canConfirm({ required: true, minLength: 5 }, "  abcd ", false)` is false, and the same with `"abcde"` is true;
    - anything with `pending: true` is false.
  - The reason input caps at 500 characters.
  - Rendered open in English and in zh:
    - it shows the title, the consequence and the confirm verb;
    - the reason field appears only when the reason is required, and the zh reason label is 原因;
    - error text is shown through `adminErrorMessage`.
  - A rejected `onConfirm` keeps the dialog open with the reason text intact (Review Focus 3). If the render kit cannot click, test this through an exported pure state reducer.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** on `src/components/ui/alert-dialog`. A pending flag blocks a second `onConfirm`, and focus returns to the trigger.
- [ ] **Step 4: Replace every site** in the evidence (each `window.confirm` and ad hoc confirm) with `ConfirmActionDialog` and `reason: "none"`.
  - The existing zh confirm sentence becomes the `consequence`, verbatim.
  - The verb is the action's existing zh button label. If none exists, use the nearest existing label and draft a better one into the owner-drafts file.
- [ ] **Step 5: Add `adminConfirmGuard.test.ts`.** It fails on `window.confirm(`, `confirm(` or `alert(` in non-test code under `src/components/admin` and `src/routes/admin`, and includes a non-vacuity check.
- [ ] **Step 6: Gate, then commit** `feat(admin): confirm destructive actions in one shared dialog`.

### Task 4: `AdminBreadcrumb`, one `h1`, and the `<main>` fixes

**Evidence:**

- `nav.md` N2: the per-`$id`-route table, covering 7 routes and the name each one has already loaded.
- `nav.md` N3: the per-route `h1` table. 11 of 25 routes match, and 9 have no `h1` while loading or on error.
- The nested `<main>` in `TaskOverview` and `SupporterDetail`.

**Files:**

- Create:
  - `src/components/admin/AdminBreadcrumb.tsx`;
  - `src/components/admin/adminBreadcrumb.ts`, a pure model;
  - tests for both;
  - `src/components/admin/adminHeadingGuard.test.tsx`.
- Modify:
  - `AdminLayout.tsx` and `VolunteerAdminShell.tsx`, which render the one breadcrumb. Remove the second breadcrumb on volunteer pages.
  - The 7 `$id` routes or their components.
  - The pages in the N3 table.

**Interfaces:**

- Produces:
  - `export function breadcrumbTrail(pathname: string, language: AdminLanguage, recordName?: string | null): { label: string; to?: string }[]`. It resolves the group and destination from `ADMIN_NAV_ITEMS` and `VOLUNTEER_WORKSPACE_PAGES`; after Task 5, from `ADMIN_NAV_ITEMS` only.
  - `AdminLayout` props gain `recordName?: string | null`.
- Consumed by: Task 5 (the volunteer pages move into the nav model) and Task 8 (focus moves to the `h1`).

- [ ] **Step 1: Write the failing tests.**
  - `breadcrumbTrail`:
    - gives group → destination for every `ADMIN_NAV_ITEMS` path, in both languages;
    - adds the record name on each of the 7 `$id` paths;
    - ends at the destination when `recordName` is `undefined`, `null`, `""` or whitespace (Review Focus 4);
    - truncates a name longer than 80 characters, ending it with `…`.
  - `adminHeadingGuard.test.tsx` renders every smoke destination in its loading and empty states, in both languages, and asserts:
    - exactly one `<h1`;
    - the `h1` text equals the nav label for that language (any allow-list entry must state its reason in the test);
    - no `<main` inside the rendered page body, because `AdminLayout` owns the only `<main>`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and sweep.**
  - Render the breadcrumb from `AdminLayout`, with an `aria-label` and the breadcrumb copy from `adminCommonCopy`.
  - Pass the record name each `$id` page has already loaded. Add no new fetch.
  - Render each page's `h1` in its loading and error branches.
  - Fix an `h1` that differs from its nav label by reusing the nav label's copy key, not by writing new copy.
  - Turn the nested `<main>` elements into `div`s.
- [ ] **Step 4: Gate, then commit** `feat(admin): one breadcrumb with the record name and one h1 per page`.

### Task 5: Volunteer sidebar regroup and nav registration

**Evidence:** `nav.md` N5 and M3: 13 pages in 2 groups, 10 of them missing from `adminNav.ts`.

**Files:**

- Modify:
  - `src/components/admin/volunteerWorkspace.ts`, `volunteerWorkspaceCopy.ts` and `VolunteerAdminShell.tsx`;
  - `adminNav.ts`;
  - `src/lib/admin/access.ts`, only if a role mapping is missing;
  - `adminNav.test.ts` and the volunteer shell tests.

**Interfaces:**

- Consumes: Task 4's `breadcrumbTrail`, which reads the volunteer pages from the nav model after this task.
- Produces:
  - `VolunteerWorkspacePage` gains `group: "daily" | "people" | "policy"`.
  - Every volunteer page has an `AdminNavItem` (or child) entry in `ADMIN_NAV_ITEMS`, with its roles.

- [ ] **Step 1: Write the failing tests.**
  - `getVolunteerNavigation(role)` returns three groups in the order 日常, 人員, 政策. Each page sits in the group listed in the evidence table.
  - Every `VOLUNTEER_WORKSPACE_PAGES` path resolves in `ADMIN_NAV_ITEMS`, with the same roles as `access.ts`.
  - The shell renders the three group headings in both languages.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The group labels are zh 日常, 人員 and 政策, and English "Daily work", "People" and "Policy".
  - These are new zh labels unless the evidence shows existing ones. Put them on the owner-drafts list.
  - They ship, because they are the approved structure and the audit names them.
- [ ] **Step 4: Gate, then commit** `feat(admin): group the volunteer workspace into daily work, people and policy`.

### Task 6: `StatusBadge` consolidation

**Evidence:** `components.md` C1: four private `StatusChip` copies, plus ad hoc status renders per domain.

**Files:**

- Modify: `adoptions/AdopterDetail.tsx`, `CaseDetail.tsx`, `MatchPanel.tsx`, `TaskPanel.tsx`, and the other ad hoc sites the evidence lists.
- Create: `src/components/admin/adminStatusBadgeGuard.test.ts`.

**Interfaces:**

- Consumes: the existing `StatusBadge({ status, className })` and `StatusPill`, with their nine tone keys. The tones are unchanged.

- [ ] **Step 1: Write the failing tests.**
  - The guard fails on a local `function StatusChip`, or on a `Record<…status…, string>` map of colour classes outside `StatusBadge.tsx`. Include a non-vacuity check.
  - Each replaced site renders the same label text in zh as before. Pin this before swapping.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Replace** the four copies and the listed ad hoc renders with `StatusBadge` or `StatusPill`.
  - The label text must not change.
  - A colour may change only to the nearest of the nine tones. List each colour change in the commit message.
- [ ] **Step 4: Gate, then commit** `refactor(admin): render every status through StatusBadge`.

### Task 7: zh date and money unification

**Evidence:**

- `components.md` C4: 8 zh date formats, 4 zh money formats, the `slice(0, 10)` sites, and the CRM cents that are dropped.
- D1 and D2 in `docs/superpowers/plans/2026-10-09-admin-audit-sp5a-owner-review.md`.

**Files:**

- Modify:
  - every `formatCopy.ts` and per-screen zh formatter in the evidence;
  - `src/components/admin/adminPageCopy.ts`, to remove `formatLegacyAdminDateTime`;
  - the zh date and money pins in the tests.
- Create: `src/components/admin/adminFormatGuard.test.ts`.

**Interfaces:**

- Consumes: `formatAdminDate`, `formatAdminDateTime` and `formatAdminMoney(value, language)` from `src/components/admin/i18n/format.ts`. These are unchanged.

- [ ] **Step 1: Write the failing tests.**
  - On each swept screen, zh renders `2026年10月7日 (三)` for `2026-10-07T04:00:00Z`.
  - `2026-10-06T16:30:00Z` renders `2026年10月7日 (三)`, because Hong Kong time crosses midnight (Review Focus 5).
  - zh money renders `HK$1,234.50`, keeping the cents.
  - An empty or invalid date renders the screen's existing placeholder, never `Invalid Date`.
  - `adminFormatGuard.test.ts` fails on any of these in non-test admin code outside `i18n/format.ts`: `.slice(0, 10)` on a date value, `toLocaleDateString(`, `toLocaleString(`, `Intl.DateTimeFormat(`. A line may opt out with the marker `// admin-format-ok: <reason>`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Point every zh branch at the shared formatters.
  - Remove `formatLegacyAdminDateTime` and the per-screen zh formatters.
  - Update only the date and money zh pins, and name them in the commit message.
- [ ] **Step 4: Gate, then commit** `fix(admin): one Hong Kong-time zh date and money format everywhere`.

### Task 8: Accessibility

**Evidence:** `a11y.md`:

- A4: silent errors; save status; "draft saved" shown in red at `AnimalForm.tsx:845`; counts.
- A2: 45 unstyled buttons.
- A5: `handleMobileNavigate`.

**Files:**

- Modify:
  - the evidence sites;
  - `DataTable.tsx` and `TablePager.tsx`;
  - the bulk preview count in `bulk/BulkReview.tsx`;
  - `AdminLayout.tsx` (`handleMobileNavigate`).
- Create: `src/components/admin/adminButtonGuard.test.ts`.

**Interfaces:**

- Consumes: Task 4's single `h1`.

- [ ] **Step 1: Write the failing tests.**
  - `DataTable` and `TablePager` render their result count inside `aria-live="polite"`, and so does the bulk preview count.
  - Each swept error message renders with `role="alert"`, and each save or status message with `role="status"`.
  - The animal form's "draft saved" uses the success token class, not the error one.
  - The mobile-navigate handler, extracted as a pure function with an injected `document`, focuses the first `h1`. It sets `tabIndex=-1` first if the `h1` is not focusable.
  - `adminButtonGuard.test.ts` fails on a `<button` in non-test admin code that has no `className` and does not come from `ui/button`. A line may opt out with the marker `// admin-button-ok: <reason>`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Give each listed button either the shared `Button`, or `min-h-11 min-w-11` plus focus styles. Use token classes only.
- [ ] **Step 4: Gate, then commit** `fix(admin): announce status and errors, and size every button`.

### Task 9: The owner list, glossary and finish

**Files:**

- Create: `docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md`, built from `sp5b-owner-drafts.md`. Delete the drafts file afterwards.
- Modify:
  - `docs/admin-glossary.md`, for new English terms;
  - `CLAUDE.md` and `AGENTS.md`, with one Conventions line;
  - `adminEnglishSmoke.test.tsx`, only if a new state needs coverage.

- [ ] **Step 1: Write the owner list.** Each item has an ID, file:line, the current zh, the drafted zh, and the English. It has six sections:
  1. the `LoadFailure` class lines (Task 1);
  2. the dialog labels and the 確定 wording (Task 3);
  3. verb button labels, for the 15 state-named buttons in `a11y.md` L1;
  4. next-step error wording, for about 108 copy strings and 21 server strings (`a11y.md` L2);
  5. one conflict sentence, 「另一位同事已更新此記錄」 with a reload, replacing the variants in `components.md` S5;
  6. the volunteer group labels (Task 5).
- [ ] **Step 2: Add the Conventions line** to `CLAUDE.md` and `AGENTS.md`, after the admin-copy line, with the Edit tool only:
      `- Admin UX: load errors render LoadFailure with retry; destructive actions use ConfirmActionDialog; status uses StatusBadge; dates and money use the shared formatters in both languages. The admin*Guard.test.ts files enforce each rule.`
- [ ] **Step 3: Run the full gate and `bun run build`.** Also run every guard and smoke file under the two clock preloads.
- [ ] **Step 4: Commit** `docs(admin): record the SP-5b owner review list and lock in the admin UX rules`.
