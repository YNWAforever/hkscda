# Admin audit SP-5a: a complete English admin

Date: 2026-10-09 · Base: `origin/codex/audit-final-sp4-20261008 @ a9980d69` (PR #204, which is
stacked on #202) · Branch: `codex/audit-final-sp5a-20261009`

This is sub-project SP-5a of the 2026-10-07 admin audit follow-up. The audit's section 8
("Admin UX specification") is split in two:

- **SP-5a**, this spec, settles the language rule.
- **SP-5b** is a later read-only conformance survey of the rest of section 8, followed by small
  fixes.

The branch is stacked on SP-4 so that SP-4's new admin panels are covered, and so that SP-1's
admin guards (tokens only, `h1`, page titles, no browser Supabase) still apply.

## What the audit said, and what is true

Audit C-05 and the copy rule in section 8: "Either complete the English translation table in
`adminI18n.tsx` and remove the 28 inline `language === "zh"` branches, or hide the EN toggle.
Mixed-language screens are worse than one language."

Measured on 2026-10-08 against this base:

| Fact                                                                                   | Value                                                                                                                        |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Admin source files (`src/components/admin/**`, `src/routes/admin/**`, excluding tests) | 194                                                                                                                          |
| ... that contain Chinese text                                                          | 121 files, about 4,790 Chinese text runs                                                                                     |
| ... that read the admin language setting at all                                        | 28                                                                                                                           |
| ... with Chinese text that ignore the setting                                          | 98, so EN mode is mixed on most screens                                                                                      |
| `src/lib` modules imported by admin that contain Chinese                               | 20 (largest: `volunteers/apiResult.ts` 97 runs, `volunteers/policy/catalogue.ts` 86, `operations/taskOverview.server.ts` 36) |
| Where the toggle is shown                                                              | admin sidebar (`AdminLayout`), `/admin/login`, `/admin/reset-password`                                                       |
| Data that already has English                                                          | coordinator statuses (`label_en`), animal names (`name_en`), adoption-rule and payment-config fields                         |

Chinese text runs per area:

| Area                                                       | Files | Runs  |
| ---------------------------------------------------------- | ----- | ----- |
| `components/admin/volunteers`                              | 27    | 1,569 |
| `components/admin/content`                                 | 31    | 1,042 |
| `components/admin` (top-level shell and animal components) | 13    | 982   |
| `components/admin/crm`                                     | 16    | 289   |
| `components/admin/adoptions`                               | 8     | 235   |
| `components/admin/donations`                               | 6     | 219   |
| `components/admin/sponsorship`                             | 7     | 181   |
| `routes/admin/volunteers`                                  | 3     | 86    |
| `components/admin/internships`                             | 1     | 69    |
| `components/admin/access`                                  | 1     | 45    |
| `routes/admin` (top level)                                 | 4     | 36    |
| `components/admin/bulk`                                    | 2     | 24    |
| `components/admin/operations`                              | 1     | 11    |
| `routes/admin/content`                                     | 1     | 2     |

## Decisions made with the user (2026-10-08)

1. **Finish English** rather than hide the toggle.
2. **Full parity.** Every admin screen, for every role (staff, treasurer, admin), renders
   entirely in English when English is selected.
3. **Copy authorship.** Claude drafts the English from the existing zh-HK copy using a committed
   glossary; the owner or a staff member reviews the glossary and the screens in the PR. zh-HK
   stays the source of truth.
4. **Typed copy modules plus a ratcheting guard** (approach A), not a string-key dictionary or
   inline ternaries.
5. **Stack on SP-4** (#204).

## Goal

With English selected, every admin screen shows no Chinese interface text, apart from data.
`tsc` rejects a missing translation in either language. A guard test stops new hard-coded
Chinese from entering admin code. With Chinese selected, which stays the default, every
screen renders exactly as it does today.

## Non-goals

- The public site, emails, PDF receipts and other generated documents.
- Translating data rows, free text staff typed, or anything at runtime by machine.
- Changing zh-HK copy, except where a task finds an outright bug, reported in its report.
- SP-5b's section 8 items: breadcrumbs, `h1` on `$id` pages, volunteer sub-tabs, page
  templates, `StatusBadge` rules, reason dialogs, the six page states, `aria-live`.
- Moving the toggle, or changing how the choice is remembered (localStorage, per browser).

## Design

### 1. Copy modules

- **The helper.** `src/components/admin/i18n/copy.ts` exports:
  - `defineAdminCopy<T>(copy: { zh: T; en: T }): AdminCopyModule<T>`, typed so that both
    languages must have exactly the same keys and value types. A missing or extra key is a
    `tsc` error.
  - `useAdminCopy<T>(copy: AdminCopyModule<T>): T`, which returns the active language's half
    through the existing `AdminLanguageProvider`.
  - `pickAdminCopy<T>(copy: AdminCopyModule<T>, language: AdminLanguage): T`, for non-React
    callers.
- **Per-area copy.** Each area has one or more `copy.ts` modules beside its components, for
  example `src/components/admin/crm/copy.ts`. A module over about 400 lines is split by screen
  (`crm/supporterCopy.ts`). Values are plain strings, or small functions for interpolation:
  `(count: number) => string`.
- **The existing `adminCopy` object** in `adminI18n.tsx` moves onto `defineAdminCopy`. The
  provider, the `AdminLanguageToggle` and the storage key `hkscda-admin-language` stay. The
  28 language-aware files are converted to the new pattern, and their inline
  `language === "zh"` branches are removed.

### 2. Label and message modules in `src/lib`

- **Code-keyed labels and messages** that admin screens show, such as
  `volunteers/apiResult.ts`, `volunteers/policy/catalogue.ts` and `notifications/deliveryLabel.ts`,
  become bilingual maps (`{ zh, en }` per entry). Their accessors gain a `language`
  parameter that defaults to `"zh"`, so every existing caller's output stays byte-identical.
- **Admin callers** pass the active language.
- **Server-side callers** (`*.server.ts`, HTTP boundaries) keep producing zh-HK, plus the
  stable code they already return. The admin browser shows the message for the code in the
  active language, not the server's text.
- **Public pages** that import a converted module keep zh-HK output. A test pins that for
  each converted module with a public consumer.
- **Not interface text:** Chinese in `src/lib` used for matching rather than display, such as
  the search patterns in `help/search.ts` and `help/sanitizeQuery.ts`, is out of scope.

### 3. Data with an English column

When English is selected, values that have an English column show it: coordinator status
`label_en`, animal `name_en`, and the other bilingual fields the area tasks find. They fall
back to the zh value when the English one is empty. Free text staff typed is shown as typed.

### 4. Formatting and page language

- **Formatters.** `src/components/admin/i18n/format.ts` exports `formatAdminDate`,
  `formatAdminDateTime` and `formatAdminMoney`, each taking `(value, language)` and using Hong
  Kong time:
  - zh dates: `2026年10月7日 (三)`;
  - en dates: `7 Oct 2026 (Wed)`;
  - money in both languages: `HK$1,234.00`.

  Areas switch to these as they migrate.

- **Page language.** `AdminLayout` sets `lang="en"` or `lang="zh-HK"` on the admin root
  element. The login and reset-password pages do the same.

### 5. The guard and its ratchet

`src/components/admin/adminCopyGuard.test.ts` scans every non-test `.ts`/`.tsx` file under
`src/components/admin` and `src/routes/admin`, apart from copy modules (`copy.ts`,
`*Copy.ts`).

- **It fails when:**
  - a file not on the pending list contains a Chinese character on a line without an
    exemption marker;
  - a file on the pending list no longer contains Chinese (a stale entry, so the list must
    shrink);
  - the scan finds fewer than 150 files (non-vacuity).
- **The pending list** is `ADMIN_COPY_PENDING`, holding repo-relative paths. Task 1 seeds it
  with every unmigrated file, and each area task removes its own.
- **Exemption marker.** `// admin-copy-exempt: <reason>`, on the same line or the line above,
  allows Chinese that is not interface text, such as a parsing pattern or a data constant.
  Every exemption is listed in the task report and the final review.

### 6. Glossary

`docs/admin-glossary.md` is a table of about 60 core terms: zh-HK, English, and a usage note.
Examples: 領養 adoption, 助養 sponsorship, 義工 volunteer, 捐款 donation, 支持者 supporter,
個案 case, 收據 receipt, 封存 archive, 作廢 void, 批核 approve.

- Task 1 writes the glossary, and every later task uses it.
- New terms are added to the glossary before they are used.
- It is the one document the owner reviews for terminology.

### 7. English style

- Sentence case, plain and short.
- Buttons are verbs (Save, Publish, Archive, Void, Approve, Reject); never "OK".
- Error messages say what to do next.
- Interpolated values use the formatters above.

### 8. Tests every area adds

- **An English render test.** It wraps the area's main screens in the provider with English
  selected and asserts that the rendered markup contains no Chinese outside the fixture data.
  It uses `renderAdminInEnglish` and `expectNoChineseText(markup, { allow })` from
  `src/components/admin/i18n/testing.tsx`, added in Task 1. For this, the provider gains an
  optional `initialLanguage` prop.
- **A zh check:** a few key zh-HK strings on those screens are unchanged.

## Tasks

1. **Foundation:**
   - `i18n/copy.ts`, `i18n/format.ts` and `i18n/testing.tsx`;
   - the provider's `initialLanguage` prop;
   - the `lang` attribute;
   - `adminCopy` moved onto `defineAdminCopy`;
   - the glossary;
   - the guard test, seeded with every pending file.
2. **Shell and shared components:**
   - `AdminLayout`, navigation and page copy;
   - `LoadFailure`, the table and pager, the bulk panels;
   - `access` and `operations`;
   - the routes `/admin/login`, `/admin/reset-password` and `/admin` (dashboard);
   - `src/lib/admin/session.ts` and `src/lib/operations/taskOverview.server.ts` messages
     shown in the shell.
3. **Animals and adoptions:** the top-level animal components, `components/admin/adoptions`,
   and their `src/lib` labels (`animals/*`, `adoptions/assignmentBulkSelection.ts`).
4. **Supporters, donations and payments:** `crm` and `donations`, and their labels and
   messages.
5. **Sponsorship and internships:** `sponsorship`, `internships`, and `src/lib/sponsorshipAdmin/*`
   and `internships` labels.
6. **Content, CMS and FAQ:** `content` (SP-4's report and tester panels included),
   `routes/admin/content`, and `contentReview/*` and `faq` labels.
7. **Volunteers, part 1:** daily work, people and registrations, and the `volunteers`
   labels and `apiResult.ts` messages those screens use.
8. **Volunteers, part 2:** policy, settings, `routes/admin/volunteers`, and
   `volunteers/policy/*`.
9. **Finish:**
   - the guard asserts `ADMIN_COPY_PENDING` is empty;
   - a whole-admin English smoke test renders each top-level admin page in English;
   - the glossary is finalised;
   - `CLAUDE.md` and `AGENTS.md` gain a rule: admin copy lives in bilingual `copy.ts` modules,
     and the guard enforces it.

Gates after each task:

- `bunx tsc --noEmit`;
- `bun run lint` (0 errors, existing warnings as baseline);
- `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test` (0 fail);
- for any route change, `bun run build` and a current `src/routeTree.gen.ts`.

No migration ships. The `codex/audit-*` branch name means no public preview. Merging to `main`
deploys production and waits for explicit release approval. Because zh stays the default,
merging changes nothing for staff who never pick English.

## Risks

- **Volume.** Thousands of strings means some English will read awkwardly. This is mitigated
  by the glossary, owner review in the PR, and zh-HK staying authoritative.
- **Overlap with other admin work in flight,** such as the `feat/story-promotion-*` branches.
  Area-sized commits on the stacked base keep conflicts local. Whichever branch lands second
  converts the new strings and updates the pending list.
- **Shared `src/lib` modules.** The `"zh"` default and the byte-identical public-output tests
  keep public pages unchanged.
- **Tests that assert Chinese admin text.** They keep passing because zh is the default. Any
  test that changes is named in the task report.
- **Missing translations.** `tsc` parity means one cannot ship.
