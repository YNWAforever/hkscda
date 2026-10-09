# Admin audit SP-5a: a complete English admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With English selected, every admin screen renders no Chinese interface text (data
excepted). `tsc` rejects a missing translation, and a guard stops new hard-coded Chinese. With
Chinese selected, which stays the default, nothing changes.

**Architecture:**

- **Copy modules.** Typed `{ zh, en }` modules built with `defineAdminCopy` are read through
  `useAdminCopy` and the existing `AdminLanguageProvider`.
- **`src/lib` labels.** Code-keyed labels and messages become bilingual maps whose accessor
  defaults to `"zh"`.
- **The ratchet.** A guard test scans admin code for Chinese outside copy modules. Its pending
  list starts with every unmigrated file and shrinks to empty, one area task at a time.

**Tech Stack:** TypeScript (strict), React 19, TanStack Router/Query, Bun 1.3.14 (`bun:test`,
`renderToStaticMarkup`), `Intl.DateTimeFormat` / `Intl.NumberFormat`.

**Spec:** `docs/superpowers/specs/2026-10-09-admin-audit-sp5a-admin-english-design.md`

## Plan decisions

1. **Ten tasks, not nine.** Content/CMS is 31 files and about 1,040 Chinese runs, so it is split
   into Task 6 (CMS editor, review and media) and Task 7 (adoption information, guides, rules,
   FAQ, documents, governance). Volunteers remain two tasks (8 and 9), and Finish becomes
   Task 10.
2. **The guard skips files named `copy.ts` or `*Copy.ts`.** `adminPageCopy.ts` already matches
   that pattern, so the guard does not force its conversion. Task 2 converts it explicitly, and
   Task 2's English render tests prove it.
3. **Label and string modules inside `src/components/admin` are renamed to `*Copy.ts`** when
   they become bilingual (for example `content/cmsStateLabels.ts` → `content/cmsStateCopy.ts`),
   with their imports updated, because they legitimately hold both languages.
4. **Logic modules with Chinese messages** (`exportFailure.ts`, `paymentsReconcileLogic.ts`,
   `contentAdminLogic.ts` and similar) return codes, or take the copy as a parameter. Their
   strings move into the area's copy module.

## Global Constraints

### Workspace and safety

- **Worktree:** `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\audit-final-sp5a-20261009`,
  branch `codex/audit-final-sp5a-20261009`, stacked on `origin/codex/audit-final-sp4-20261008`
  (PR #204). Never touch the main checkout or another worktree. Never push.
- **Supabase and production:** never run `supabase db reset`, `supabase stop` or any
  migration. No production or Vercel writes. Never read `.env.local`, `.claude/settings*.json`,
  `.mcp.json` or credential files.

### Copy and language

- **zh-HK is the source of truth.** Never change a zh string, except an outright bug, which is
  reported. With `language === "zh"`, every screen's rendered output stays the same.
- **English style:**
  - sentence case, plain and short;
  - buttons are verbs (Save, Publish, Archive, Void, Approve, Reject), never "OK";
  - error messages say what to do next;
  - terms come from `docs/admin-glossary.md`, and a new term is added there before it is used.
- **Data:** show an English column where one exists (`label_en`, `name_en`, and so on), falling
  back to the zh value when it is empty. Free text staff typed is shown as typed, and nothing
  is machine-translated.
- **Formats:**
  - dates zh `2026年10月7日 (三)`, en `7 Oct 2026 (Wed)`;
  - date-times add `HH:mm` (24-hour);
  - money `HK$1,234.00` in both languages;
  - always Hong Kong time.
- **Exemption marker:** `// admin-copy-exempt: <reason>`, on the same line or the line above,
  only for Chinese that is not interface text. Every exemption is listed in the task report.
- **`src/lib` accessors** gain `language: AdminLanguage = "zh"`. Default output stays
  byte-identical. A public consumer of a converted module gets a test pinning its zh output.

### Code rules

- **Styling:** `var(--color-*)` tokens only, and SP-1's admin guards stay green.
- **Data access:** admin data goes only through `fetchAdminJson`.
- **Routes:** after any route-file change, run `bun run build` and commit `src/routeTree.gen.ts`.
- **Reading files:** read files with Chinese using the Read tool; PowerShell 5.1 `Get-Content`
  garbles them.
- **Invisible characters:** the Write and Edit tools decode `\uXXXX`, so never write invisible
  or bidi characters. If one is ever needed, see `memory/project_hkscda_windows_tooling_traps.md`.

### Commits

- Write the message BOM-free with
  `[IO.File]::WriteAllText($p, $msg, (New-Object Text.UTF8Encoding $false))` into the session
  scratchpad, then `git commit -F $p`.
- Conventional Commits, ending exactly with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage by explicit path, and check `git status --short` and `git log --oneline -3` first. No
  bare `git stash`, no `--no-verify`.

### The gate, after every task

- `bunx tsc --noEmit` exits 0.
- `bun run lint` reports 0 errors and no new warnings.
- `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test` reports 0 fail.

## Review Focus

1. **An English column that is empty in the data** (a coordinator status with blank `label_en`,
   an animal with no `name_en`). It must show the zh value, never a blank cell. Pinned in Task 3.
2. **Counts in English** ("1 supporter" against "3 supporters"). Copy functions take the count
   and pluralise; zh is unaffected. Pinned in Task 4.
3. **A timestamp just after HK midnight** (`2026-10-06T16:30:00Z`). It formats as 7 Oct, not
   6 Oct, in both languages. Pinned in Task 1.
4. **A server error code the client has no message for.** English shows a generic English
   message in the active language, never the server's raw zh text. Pinned in Task 8 (volunteer
   `apiResult`).
5. **A new admin file added later with hard-coded Chinese.** The guard names it. Pinned in Task 1
   by the guard's synthetic self-check.

---

### Task 1: Foundation

**Files:**

- Create:
  - `src/components/admin/i18n/copy.ts`
  - `src/components/admin/i18n/format.ts`
  - `src/components/admin/i18n/testing.tsx`
  - `src/components/admin/i18n/adminCommonCopy.ts`
  - `src/components/admin/adminCopyGuard.test.ts`
  - `src/lib/admin/language.ts`
  - `docs/admin-glossary.md`
- Modify:
  - `src/components/admin/adminI18n.tsx`: move the `adminCopy` object into
    `adminCommonCopy.ts` via `defineAdminCopy`, and keep exporting `adminCopy`, `AdminLanguage`,
    `AdminLanguageProvider`, `useAdminLanguage` and `AdminLanguageToggle`;
  - `src/components/admin/AdminLayout.tsx`: the `lang` attribute;
  - `src/routes/admin/login.tsx` and `src/routes/admin/reset-password.tsx`: the `lang`
    attribute.
- Test:
  - `src/components/admin/i18n/copy.test.ts`
  - `src/components/admin/i18n/format.test.ts`
  - `src/components/admin/i18n/testing.test.tsx`
  - the guard test above

**Interfaces (produced, used by every later task):**

```ts
// i18n/copy.ts
export type AdminCopyModule<T> = { readonly zh: T; readonly en: T };
export function defineAdminCopy<T>(copy: { zh: T; en: T }): AdminCopyModule<T>;
export function useAdminCopy<T>(copy: AdminCopyModule<T>): T;
export function pickAdminCopy<T>(copy: AdminCopyModule<T>, language: AdminLanguage): T;
// i18n/format.ts — Hong Kong time
export function formatAdminDate(value: Date | string, language: AdminLanguage): string;
export function formatAdminDateTime(value: Date | string, language: AdminLanguage): string;
export function formatAdminMoney(amount: number, language: AdminLanguage): string;
// i18n/testing.tsx
export function renderAdminInEnglish(element: ReactElement): string; // renderToStaticMarkup inside the provider
export function renderAdminInChinese(element: ReactElement): string;
export function expectNoChineseText(markup: string, options?: { allow?: string[] }): void;
// adminI18n.tsx
AdminLanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: AdminLanguage });
```

**`initialLanguage` behaviour.** When it is given, it is the initial state, and the stored
preference is not read. When it is omitted, behaviour is unchanged: default `"zh"`, then the
stored value read in an effect.

**Guard data.** `ADMIN_COPY_PENDING` is an exported `readonly string[]` in
`adminCopyGuard.test.ts`, listing repo-relative POSIX paths.

**Where `AdminLanguage` lives.** It moves to a new `src/lib/admin/language.ts`
(`export type AdminLanguage = "zh" | "en";`), so `src/lib` accessors can take a language
without importing from `src/components`. `adminI18n.tsx` and `i18n/copy.ts` re-export it.

- [ ] **Step 1: Write the failing tests.**
  - **`copy.test.ts`:**
    - `pickAdminCopy(defineAdminCopy({ zh: { a: "甲" }, en: { a: "A" } }), "en").a === "A"`, and
      likewise `"zh"` returns `"甲"`;
    - `useAdminCopy` inside `renderAdminInEnglish` returns the `en` half;
    - a `// @ts-expect-error` line proves that `defineAdminCopy({ zh: { a: "甲" }, en: {} })` is
      a type error.
  - **`format.test.ts`:**
    - `formatAdminDate("2026-10-07T04:00:00Z", "zh") === "2026年10月7日 (三)"`;
    - `"en"` gives `"7 Oct 2026 (Wed)"`;
    - `formatAdminDate("2026-10-06T16:30:00Z", "en") === "7 Oct 2026 (Wed)"` (Review Focus 3);
    - `formatAdminDateTime("2026-10-06T16:30:00Z", "zh") === "2026年10月7日 (三) 00:30"`;
    - `formatAdminMoney(1234, "en") === "HK$1,234.00"`, and the same for `"zh"`.
  - **`testing.test.tsx`:**
    - `expectNoChineseText("<p>Hi</p>")` passes;
    - `expectNoChineseText("<p>Hi 你好</p>")` throws, naming `你好`;
    - with `{ allow: ["你好"] }` it passes.
  - **`adminCopyGuard.test.ts`:**
    - `test("admin code has no Chinese outside copy modules, except pending files")`;
    - `test("every pending file still contains Chinese")`;
    - `test("the scan sees the whole admin tree")` (≥ 150 files);
    - `test("the guard reports a new file with hard-coded Chinese")` (Review Focus 5). It uses a
      pure `findUncoveredChinese(files: { path: string; text: string }[], pending: readonly
string[])` exported from the test file, with synthetic input: a non-pending file with
      Chinese is reported, and a line with the exemption marker is not.

    The scan covers non-test `.ts`/`.tsx` under `src/components/admin` and `src/routes/admin`,
    skipping `copy.ts` and `*Copy.ts`.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the four i18n modules.**
  - The zh date pattern is `${y}年${m}月${d}日 (${weekday})`, using the `zh-HK` narrow weekday
    in Hong Kong time.
  - English uses `en-GB` day-month-year with the short weekday.
  - Money is `HK$` with two decimals and thousands separators, the same in both languages.
- [ ] **Step 4: Move `adminCopy`, add `lang`, and seed the pending list.**
  - Move `adminCopy` into `i18n/adminCommonCopy.ts`, then delete it from `adminI18n.tsx`.
    `adminI18n.tsx` must end with no Chinese.
  - Set `lang={language === "en" ? "en" : "zh-HK"}` on the admin root in `AdminLayout`, and on
    the login and reset-password page roots.
  - Seed `ADMIN_COPY_PENDING` with the exact output of the scan: every remaining file with
    Chinese, sorted.
- [ ] **Step 5: Write `docs/admin-glossary.md`.** It is a three-column table (zh-HK | English |
      usage note) of at least 60 core terms drawn from the admin. It includes 領養 adoption,
      助養 sponsorship, 義工 volunteer, 捐款 donation, 支持者 supporter, 個案 case, 收據 receipt,
      封存 archive, 作廢 void, 批核 approve, 拒絕 reject, 發佈 publish and 草稿 draft. It ends with a
      "Style" section repeating the English style rules from Global Constraints.
- [ ] **Step 6: Run the tests and the full gate.**
- [ ] **Step 7: Commit.** Message: `feat(admin): add the bilingual copy foundation and the English guard`.

## Area task recipe (applies to Tasks 2-9)

Every area task follows the same recipe, applied to its own file list. The controller
hands this section to each area task's implementer with that task's brief.

1. **Copy modules.** Write the area's copy modules (`copy.ts`, or `<screen>Copy.ts` beside the
   screen when a module would pass about 400 lines) with `defineAdminCopy`, moving every zh
   string out of the area's files verbatim and writing the English beside it. Use functions for
   interpolation and counts.
2. **Components.** Switch them to `useAdminCopy` (or `pickAdminCopy` in non-React code). Remove
   inline `language === "zh"` branches. Use the Task 1 formatters for dates and money, and show
   English data columns with zh fallback.
3. **`src/lib` modules.** Convert the listed ones to bilingual code-keyed maps whose accessor
   defaults to `"zh"`. Admin callers pass the language. Public consumers keep zh output, pinned
   by a test.
4. **Tests:**
   - `<Area>English.test.tsx` renders each listed top-level screen with
     `renderAdminInEnglish`, using the area's existing mock patterns, and calls
     `expectNoChineseText` with only fixture data allowed;
   - plus `renderAdminInChinese` asserting two or three known zh strings per screen are
     unchanged.
5. **Pending list.** Delete the area's files from `ADMIN_COPY_PENDING`. The guard must pass,
   with no stale entries.
6. **Gate and commit.** Run the full gate, then commit with
   `feat(admin): translate the <area> screens into English`.

Each task's report lists every `admin-copy-exempt` line, every renamed file, any existing test
it had to change and why, and any zh bug found.

### Task 2: Shell and shared components

- **Files:**
  - `src/components/admin/AdminLayout.tsx`
  - `adminNav.ts`
  - `adminPageCopy.ts` (convert to `defineAdminCopy`, removing its inline branches; Plan
    decision 2)
  - `DataTable.tsx`
  - `LoadFailure.tsx`
  - `TablePager.tsx`
  - `bulk/BulkResults.tsx`
  - `bulk/BulkReview.tsx`
  - `access/AccessManagement.tsx`
  - `operations/TaskOverview.tsx`
  - `src/routes/admin/index.tsx`
  - `src/routes/admin/access-denied.tsx`
  - `src/routes/admin/tasks.tsx`
- **`src/lib`:** `admin/session.ts`, `operations/taskOverview.server.ts`. The server keeps zh;
  the browser maps its codes.
- **English render tests:** the layout with navigation, the dashboard, access management, the
  task overview, and `LoadFailure`. They also test that every `adminPageCopy` page header
  renders in English.

### Task 3: Animals and adoptions

- **Files:**
  - `src/components/admin/AnimalForm.tsx`
  - `AnimalGalleryEditor.tsx`
  - `AnimalsTable.tsx`
  - `MediaRepairQueue.tsx`
  - everything in `src/components/admin/adoptions/`: `AdopterDetail`,
    `AdoptionAssignmentBulkPanel`, `AnimalPipeline`, `CaseDetail`, `CaseList`,
    `FinalizationPanel`, `intakeInboxLogic`, `MatchPanel`
- **`src/lib`:** `animals/publicProfileInput.ts`, `animals/adminSearch.ts`,
  `adoptions/assignmentBulkSelection.ts`.
- **Data:** coordinator status `label_en` and animal `name_en`, each with zh fallback.
  - Review Focus 1 test: a status whose `label_en` is `""` renders its `label_zh` in English
    mode;
  - an animal with `name_en: null` renders its zh name.
- **English render tests:** the animals table, the animal form, case list, case detail, the
  pipeline and the match panel.

### Task 4: Supporters, donations and payments

- **Files:** everything in `src/components/admin/crm/` and `src/components/admin/donations/`.
- **`src/lib`:** `notifications/deliveryLabel.ts`.
- **Review Focus 2 test:** the supporter list's count copy renders `"1 supporter"` and
  `"3 supporters"` in English.
- **English render tests:** supporter list, supporter detail, the supporter form dialog, the
  export bar, payments reconcile, the bank statement dry run, and the donation delivery
  worklist.

### Task 5: Sponsorship and internships

- **Files:**
  - everything in `src/components/admin/sponsorship/`
  - `src/components/admin/internships/InternshipManagement.tsx`
  - `src/routes/admin/sponsorships.tsx`
- **`src/lib`:** `sponsorshipAdmin/reminderDraft.ts`, `sponsorshipAdmin/followupBulkSelection.ts`,
  `internships/service.ts`.
  - `reminderDraft.ts` produces text staff send to supporters. Only its admin labels are
    translated. The draft body stays zh, because it is outward copy (the spec's non-goal), and
    is marked `admin-copy-exempt` where it lives in admin code.
- **English render tests:** the pledge review lane, the pledge detail drawer, the finance
  panel, the reminder draft panel, the follow-up bulk panel, and internship management.

### Task 6: Content, part 1 (CMS editor, review and media)

- **Files** in `src/components/admin/content/`:
  - `ContentManagement`, `ContentCreateForm`, `ContentEditor`, `ContentReview`,
    `ContentRevisionPanel`, `ContentTimeline`;
  - `CmsReviewBulkPanel`, `AnimalReviewBulkPanel`, `LinkedRecordPicker`,
    `NotificationDraftPanel`, `SocialCopyPanel`;
  - `contentAdminLogic`, `contentMediaUpload`, `editorState`;
  - `cmsStateLabels` → renamed `cmsStateCopy.ts`.
- **`src/lib`:** `contentReview/cmsBulkSelection.ts`, `contentReview/animalBulkSelection.ts`.
- **English render tests:** content management, the editor, review, the revision panel and the
  timeline.

### Task 7: Content, part 2 (adoption information, guides, rules, FAQ, documents, governance)

- **Files** in `src/components/admin/content/`:
  - `AboutPagesManagement`, `AdoptionGuideReleaseManagement`, `adoptionGuideReleaseLogic`;
  - `AdoptionInformationManagement`, `AdoptionInstructionsManagement`, `AdoptionRulesManagement`;
  - `AnnualReportManagement`, `CareTopicsManagement`;
  - `DocumentManagement`, `documentUpload`;
  - `FaqManagement`, `FaqAnswerTester`, `FaqSearchGapsReport`;
  - `GovernanceManagement`, `KnowledgeManagement`, `PaymentMethodsManagement`;
  - `src/routes/admin/content/adoption-preview.tsx`.
- **`src/lib`:** `faq/schemas.ts`, for the admin-facing CTA labels only. Public consumers keep
  their output, pinned.
- **English render tests:**
  - each management screen listed;
  - the FAQ search-gap report with its 沒有答案/配對較弱 labels in English;
  - the answer tester's outcome labels in English.

### Task 8: Volunteers, part 1 (daily work, people, registrations)

- **Files:**
  - `src/components/admin/VolunteerAdminShell.tsx`, `volunteerWorkspace.ts`;
  - in `volunteers/`:
    - `ActivitySchedule`, `VolunteerActivityWorkspace`, `VolunteerOperations`,
      `VolunteerOverview`, `VolunteerTasks`, `WorkflowSections`;
    - `directorySearch`, `QualificationProfileSearch`, `VolunteerDirectory`;
    - `VolunteerDraftForm`, `useUnsavedVolunteerDraft`, `VolunteerLegacyReconciliation`;
    - `VolunteerManagement`, `VolunteerPersonDetail`, `VolunteerRegistrationDetail`,
      `VolunteerReviewBulkPanel`;
    - `GroupEnquiryManagement`, `groupEnquiryAdminLogic`, `volunteerAdminLogic`;
  - `src/routes/admin/volunteers/people.tsx`, `src/routes/admin/volunteers/people/$id.tsx`.
- **`src/lib`:**
  - `volunteers/apiResult.ts`, all of it: `volunteerErrorMessage(value, status, language = "zh")`
    and `normalizeVolunteerResult` keep their zh defaults;
  - `volunteers/labels.ts`, `volunteers/overview.ts`, `volunteers/bulk/service.ts`,
    `volunteers/directory/reviewerBulkSelection.ts`.
- **Review Focus 4 test:** `volunteerErrorMessage({ code: "never_seen" }, 500, "en")` returns
  the generic English fallback and contains no Chinese.
- **English render tests:** the volunteer shell and workspace tabs, overview, operations,
  activity workspace, directory, person detail, registration detail, group enquiries, and the
  review bulk panel.

### Task 9: Volunteers, part 2 (policy and settings)

- **Files:**
  - in `src/components/admin/volunteers/`: `PolicyAdvancedFields`, `PolicyChangeSummary`,
    `PolicySourceFields`, `VolunteerDailySettings`, `VolunteerPolicySettings`,
    `VolunteerPolicySimulation`, `VolunteerPolicySources`, `VolunteerQualifications`;
  - `src/routes/admin/volunteers/assessments.tsx`.
- **`src/lib`:** `volunteers/policy/catalogue.ts`, `volunteers/policy/schemas.ts`. Validation
  messages shown in the admin get English, while server-side zh stays the default.
- **English render tests:** policy settings with advanced fields, policy sources, simulation,
  the change summary, daily settings, qualifications, and the assessments route.

### Task 10: Finish

**Files:**

- Modify: `src/components/admin/adminCopyGuard.test.ts`, `docs/admin-glossary.md`,
  `CLAUDE.md`, `AGENTS.md`.
- Create: `src/components/admin/adminEnglishSmoke.test.tsx`.

- [ ] **Step 1: Make the ratchet permanent.**
  - `ADMIN_COPY_PENDING` must be `[]`.
  - Add `test("no admin file is pending English")`, which asserts the list is empty.
  - The existing tests stay, so any new hard-coded Chinese fails.
- [ ] **Step 2: Write `adminEnglishSmoke.test.tsx`.** It renders the component behind every
      top-level destination in `adminNav.ts` in English, through `renderAdminInEnglish`, with
      minimal mocks, and calls `expectNoChineseText` with no allow-list beyond fixture data. It
      also asserts that the number of destinations rendered equals the nav's destination count.
- [ ] **Step 3: Finalise the glossary.** Add every term the tasks introduced, sorted by zh.
- [ ] **Step 4: Add the rule to `CLAUDE.md` and `AGENTS.md`.** Use the Edit tool only, and
      insert it under **Conventions** in both files:
      `- Admin copy: every admin string lives in a bilingual copy.ts / *Copy.ts module built with defineAdminCopy (tsc enforces zh/en parity); adminCopyGuard.test.ts fails on Chinese anywhere else in src/components/admin or src/routes/admin. Terms follow docs/admin-glossary.md.`
- [ ] **Step 5: Run the full gate and `bun run build`.** The route tree must be current.
- [ ] **Step 6: Commit.** Message: `chore(admin): lock in the complete English admin`.
