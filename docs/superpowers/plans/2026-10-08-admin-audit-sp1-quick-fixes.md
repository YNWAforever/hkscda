# Admin Audit SP-1 Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the code-only items from the 2026-10-07 admin audit (F-05..F-09) and make a local test run mean what CI's does.

**Architecture:** Six independent tasks on one branch. A contract test pins the test command and Bun version. A `pageHead()` helper sets public page metadata. Token replacements plus a guard test cover admin colours. One copy-table move fixes `/donate`. Three read-only adoptions endpoints replace the last browser database reads in admin, and a guard test keeps them out.

**Tech Stack:** TanStack Start (React 19, file routes), Bun 1.3.14 + `bun:test`, Supabase JS, Tailwind 4 with `var(--color-*)` tokens.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-audit-sp1-quick-fixes-design.md`

## Global Constraints

- Work only in `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\audit-final-sp1-20261008` on branch `codex/audit-final-sp1-20261008`. Never touch the main checkout, which holds another session's uncommitted work.
- Shell is Windows PowerShell 5.1. The Bash tool here has no coreutils or git. Read files containing Chinese with the Read/Grep tools or `Get-Content -Encoding UTF8`; a plain `Get-Content` garbles them.
- **Gate** (run after every task, full tree, never scoped):
  `bunx tsc --noEmit` → exit 0; `bun run lint` → `0 errors` (52 existing warnings are baseline);
  `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test` → `0 fail`. Before Task 1 lands, use `bun test --isolate` for the last command. Baseline at `4bfca5c`: 4,823 pass, 654 skip, 0 fail.
- Never run `supabase db reset` or `supabase stop`. The local stack on 55321/55322 is shared with other sessions.
- Colours: `var(--color-*)` tokens from `src/styles.css` only, never Tailwind palette classes.
- Copy: zh-HK is primary. Add no copy beyond the strings this plan lists.
- No migrations. `src/routeTree.gen.ts` is generated; regenerate it with `bun run build` after adding route files, and commit the result.
- Commits: Conventional Commits, explicit `git add <paths>`, re-run `git status --short; git log --oneline -3` right before each commit, and end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not merge to `main`; merging deploys production and needs explicit release approval.

## Review Focus

1. **A treasurer, or an expired session, calls a new adoptions endpoint.** Expect 403 or 401 from the existing `withErrors` mapping, with the service never called. Pinned in Task 6, Step 1.
2. **A private token page leaks its token through metadata.** The private `pageHead` kind must emit no canonical, `og:url` or other URL. Pinned in Task 3, Step 1.
3. **An empty or null lookup table.** `positions`, `arrivalSources` and `animals` must come back as `[]`, never `null`, so the components' `EMPTY_*` defaults hold. Pinned in Task 6, Step 1 (repository fake returning `data: null`).
4. **The login page in English mode.** The h1 is the same element showing `copy.login.subtitle`, so English shows `Admin sign in`. Pinned in Task 4, Step 1, through the copy table, because the provider cannot be started in `en`.
5. **A guard that can never fail.** Every new guard test includes a self-check that its matcher catches a known-bad sample, as `publicCopyGuard.test.ts` does. Pinned in Tasks 3, 4 and 6.

---

### Task 1: Local test command matches CI

**Files:**
- Create: `src/lib/testRunnerContract.test.ts`
- Modify: `package.json` (`"test"` script), `.github/workflows/ci.yml:38`, `CLAUDE.md:22`, `AGENTS.md:22`
- Maybe modify: `bunfig.toml` (only if the Step 1 probe passes)

**Interfaces:**
- Produces: `src/lib/testRunnerContract.test.ts` with helpers `readRepoFile(path: string): string` (reads relative to the repo root via `new URL("../../" + path, import.meta.url)`). Task 2 extends this file.

- [ ] **Step 1: Probe whether bunfig honours `[test] isolate`**

Create `.isolate-probe/a.test.ts` (`test("a", () => { (globalThis as Record<string, unknown>).__probe = 1; })`) and `.isolate-probe/b.test.ts` (`test("b", () => expect((globalThis as Record<string, unknown>).__probe).toBeUndefined())`).
Run `bun test ./.isolate-probe/a.test.ts ./.isolate-probe/b.test.ts`. Expected: `b` FAILS (the leak).
Append `[test]` with `isolate = true` to `bunfig.toml` and run again. If `b` now passes, keep the bunfig change. Otherwise revert `bunfig.toml`.
Delete `.isolate-probe/` either way. Record the outcome in the commit message.

- [ ] **Step 2: Write the failing contract test**

```ts
test("the package test script isolates each file, as CI does", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
  expect(pkg.scripts.test).toBe("bun test --isolate");
});

test("CI runs the unit suite through the package test script", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  expect(ci).toMatch(/- name: Test\r?\n\s+run: bun run test\r?\n/);
  expect(ci).not.toMatch(/run: bun test --isolate\s*$/m);
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `bun test src/lib/testRunnerContract.test.ts`. Expected: both FAIL.

- [ ] **Step 4: Implement**

Set `package.json` `"test": "bun test --isolate"`. Change `ci.yml:38` to `run: bun run test`.
Replace `CLAUDE.md:22` and `AGENTS.md:22` with:
`` - Test: `bun run test` (adds `--isolate`, as CI does; ≈5,480 tests in 636 files, about two minutes). `supabase/rls-tests` run only when a local stack answers on port 55321; a stack shared with other worktrees gives false failures, so for a unit-only run set `SUPABASE_LOCAL_URL=http://127.0.0.1:1`. ``
If Step 1 kept the bunfig change, add: `` A bare `bun test` is isolated too (`bunfig.toml` `[test] isolate`). ``

- [ ] **Step 5: Verify**

Run `bun test src/lib/testRunnerContract.test.ts` → PASS. Run the Gate. Then run the test leg under 1.4.2 as well:
`$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; npx -y bun@1.4.2 test --isolate` → `0 fail`.

- [ ] **Step 6: Commit**

`git add package.json .github/workflows/ci.yml CLAUDE.md AGENTS.md src/lib/testRunnerContract.test.ts` (plus `bunfig.toml` if kept), then commit: `fix(test): run the local suite with --isolate, matching CI`.

---

### Task 2: One Bun version for CI and local

**Files:**
- Create: `.bun-version`
- Modify: `.github/workflows/ci.yml` (lines 27, 72, 176, 267, 408), `src/lib/testRunnerContract.test.ts`

**Interfaces:**
- Consumes: `readRepoFile` from Task 1.

- [ ] **Step 1: Write the failing tests** (append to `testRunnerContract.test.ts`)

```ts
test(".bun-version pins one exact Bun release", () => {
  expect(readRepoFile(".bun-version").trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("every workflow reads the Bun version from .bun-version", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  expect(ci).not.toMatch(/bun-version:\s*\d/);
  expect(ci.match(/bun-version-file: \.bun-version/g)?.length).toBe(5);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `bun test src/lib/testRunnerContract.test.ts` → the 2 new tests FAIL.

- [ ] **Step 3: Implement**

Create `.bun-version` containing `1.3.14` and a trailing newline. In each of the five `oven-sh/setup-bun@v2` steps, replace `bun-version: 1.3.14` with `bun-version-file: .bun-version`. Keep the comment above the first step ("Bump this deliberately"), now pointing at `.bun-version`.

- [ ] **Step 4: Verify** — the contract test passes, then run the Gate.

- [ ] **Step 5: Commit**

Commit: `chore(ci): read the Bun version from .bun-version`. In the body, note that Vercel's handling of `.bun-version` is unverified: compare the post-merge production build log.

---

### Task 3: Every public page has its own title

**Files:**
- Create: `src/lib/pageHead.ts`, `src/lib/pageHead.test.ts`, `src/routes/publicRouteHead.test.ts`
- Modify (`head`): `src/routes/animals/cat.tsx:42-44`, `src/routes/animals/dog.tsx:42-44`, `src/routes/sponsors.tsx:28-30`, `src/routes/sponsors_.pledge.tsx:8-10`, `src/routes/adoption/apply.tsx:8-10`, `src/routes/internships.tsx`, `src/routes/supporter.tsx`, `src/routes/volunteer/operations.tsx`, `src/routes/adoption/status.$token.tsx:7-12`, `src/routes/sponsors_.status.$token.tsx:7-12`, `src/routes/volunteer/status.$token.tsx:18-23`

**Interfaces:**
- Produces:
  ```ts
  export type IndexablePage = { title: string; description: string; path: string };
  export type PrivatePage = { title: string; private: true };
  export type HeadMeta = Record<string, string>;
  export function pageHead(page: IndexablePage | PrivatePage): {
    meta: HeadMeta[];
    links: { rel: string; href: string }[];
  };
  export const SITE_TITLE_SUFFIX = "香港拯救貓狗協會 HKSCDA";
  ```

- [ ] **Step 1: Write the failing helper tests** (`src/lib/pageHead.test.ts`)

- `indexable pages get a suffixed title, description, social tags and canonical`: `pageHead({ title: "待領養貓貓", description: "D", path: "/animals/cat" })` produces meta containing `{ title: "待領養貓貓 · 香港拯救貓狗協會 HKSCDA" }`, `{ name: "description", content: "D" }`, `{ property: "og:title", content: "待領養貓貓 · HKSCDA" }`, `{ property: "og:description", content: "D" }`, `{ name: "twitter:title", content: "待領養貓貓 · HKSCDA" }` and `{ name: "twitter:description", content: "D" }`. Links equal `[{ rel: "canonical", href: publicUrl("/animals/cat") }]`.
- `private pages are noindex, no-referrer and carry no URL`: `pageHead({ title: "申請狀態", private: true })` produces meta exactly `[{ title: "申請狀態 · 香港拯救貓狗協會 HKSCDA" }, { name: "robots", content: "noindex, nofollow, noarchive" }, { name: "referrer", content: "no-referrer" }]` and `links` equal to `[]`. `JSON.stringify` of the result contains no `http`.

- [ ] **Step 2: Write the failing route guard** (`src/routes/publicRouteHead.test.ts`)

Walk `src/routes` recursively for `*.tsx`. Skip `admin/` and `api/`, `__root.tsx`, `*.test.tsx`, names starting with `-`, and the allowlist `["about/cccp.tsx"]` (a 301 redirect). Each remaining file must match `/pageHead\(|\{\s*title\s*[:}]/`.
Test `every public route declares its own title`: the list of offenders equals `[]`, so the failure message names the files.
Test `the matcher sees a title`: `/…/.test('head: () => pageHead({ title: "x", private: true })')` is true, and it is false for `'head: () => ({ links: [] })'`.

- [ ] **Step 3: Run both to confirm they fail**

Run `bun test src/lib/pageHead.test.ts src/routes/publicRouteHead.test.ts`. Expected: the helper tests fail on the missing module, and the guard lists the 11 route files.

- [ ] **Step 4: Implement `pageHead` in `src/lib/pageHead.ts`**

Use `publicUrl` from `@/lib/publicOrigin`. The title is `` `${title} · ${SITE_TITLE_SUFFIX}` ``, and social titles use `` `${title} · HKSCDA` ``.

- [ ] **Step 5: Apply it to the routes**

Each route's `head` becomes `head: () => pageHead({...})`, replacing its existing canonical-only or robots-only object. The strings are fixed: they reuse each page's visible `h1` and intro sentence, except the two rows marked *new*.

| Route file | `title` | `description` / kind | `path` |
| --- | --- | --- | --- |
| `animals/cat.tsx` | 待領養貓貓 | 查看目前可申請領養的貓貓，搜尋名字或編號，按生活需要縮窄結果，再了解牠們的需要。 | `/animals/cat` |
| `animals/dog.tsx` | 待領養狗狗 | 查看目前可申請領養的狗狗，搜尋名字或編號，按生活需要縮窄結果，再了解牠們的需要。 | `/animals/dog` |
| `sponsors.tsx` | 每月助養 | 以每月支持分擔長期照護、膳食與醫療需要，讓仍在等待家庭的動物得到穩定照顧。 | `/sponsors` |
| `sponsors_.pledge.tsx` | 確認助養承諾 | *new:* 選擇想助養的動物及每月金額並提交承諾；本會職員會再聯絡你確認正式付款安排。 | `/sponsors/pledge` |
| `adoption/apply.tsx` | 領養申請 | 開始前請準備聯絡及住屋資料、照顧安排、可探望日期，以及家居安全相片；相片請勿包含證件或門牌。 | `/adoption/apply` |
| `internships.tsx` | 獸醫學生實習申請 | 實習由職員獨立審核院校及課程證據，不按一般義工級別或出席次數批准。 | `/internships` |
| `supporter.tsx` | 找回支持者紀錄 | 使用電郵驗證身份，以找回領養、助養及收條紀錄。 | `/supporter` |
| `volunteer/operations.tsx` | 團體申請及義工改期 | *new:* 提交團體義工申請，或為已確認的義工時段申請改期。 | `/volunteer/operations` |
| `adoption/status.$token.tsx` | 申請狀態 | private | — |
| `sponsors_.status.$token.tsx` | 助養狀態 | private | — |
| `volunteer/status.$token.tsx` | 義工登記 | private | — |

For `internships.tsx` and `volunteer/operations.tsx`, add `head` beside the existing `ssr`/`component` options. Remove imports of `publicUrl` that become unused.

- [ ] **Step 6: Verify**

The two new test files pass. Existing route tests that read `head()` (for example `src/routes/animals/*.test.tsx`) still pass. Run the Gate.

- [ ] **Step 7: Commit**

Commit: `feat(seo): give every public page its own title`. In the body, list the two *new* descriptions for content-owner review.

---

### Task 4: Admin uses design tokens; login and reset have an h1

**Files:**
- Create: `src/components/admin/adminTokenGuard.test.ts`
- Modify: `src/routes/admin/login.tsx` (lines 101, 106, 114, 124, 138, 154, 161, 215, 222), `src/routes/admin/reset-password.tsx` (127, 132, 138, 145, 191, 198), `src/routes/admin/animals/$id.edit.tsx` (44-45), `src/components/admin/AnimalForm.tsx` (441, 451, 850, 947, 954), `src/components/admin/sponsorship/AnimalPicker.tsx` (46), `src/components/admin/content/ContentEditor.tsx` (561, 624), `src/components/admin/content/FaqManagement.tsx` (174, 296), `src/components/admin/content/GovernanceManagement.tsx` (140, 191), `src/components/admin/content/PaymentMethodsManagement.tsx` (40), `src/components/admin/volunteers/VolunteerPolicySources.tsx` (259), `src/components/admin/volunteers/VolunteerPolicySimulation.tsx` (184)
- Test: `src/routes/admin/login.test.tsx`, `src/routes/admin/reset-password.test.tsx`

**Interfaces:**
- Produces: `export const PALETTE_CLASS: RegExp` in `adminTokenGuard.test.ts`, local to the test.

- [ ] **Step 1: Write the failing tests**

`adminTokenGuard.test.ts`:
```ts
const PALETTE_CLASS =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|accent|shadow|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
```
- `admin code uses colour tokens, not palette classes`: scan every non-test `*.ts`/`*.tsx` file under `src/routes/admin` and `src/components/admin` and collect `file:line` hits; expect `[]`.
- `the matcher catches palette classes`: matches `"hover:bg-slate-700"` and `"text-emerald-800"`, but not `"bg-[var(--color-panel)]"`.

`login.test.tsx`: add `renders exactly one h1 naming the sign-in page`. The zh markup has `/<h1[\s>]/g` matched exactly once, and that h1 contains `管理後台登入`. `AdminLanguageProvider` starts in `zh` and takes no initial-language prop (`adminI18n.tsx:544`), so the English side is checked through the copy table the h1 renders: `adminCopy.en.login.subtitle === "Admin sign in"` and `adminCopy.en.login.resetTitle === "Reset password"`.
`reset-password.test.tsx`: add the same single-`h1` test for each rendered status, with the h1 containing `重設密碼`.

- [ ] **Step 2: Run them to confirm they fail**

Run `bun test src/components/admin/adminTokenGuard.test.ts src/routes/admin/login.test.tsx src/routes/admin/reset-password.test.tsx`. Expected: the guard lists 32 lines, and both h1 tests FAIL.

- [ ] **Step 3: Implement**

On login and reset, the subtitle `<div>` (`copy.login.subtitle` / `copy.login.resetTitle`) becomes an `<h1>` with the same visual classes. The "HKSCDA" line becomes a `<p>`.
Replace every hit with tokens, using this mapping:

| From | To |
| --- | --- |
| `bg-slate-900` | `bg-[var(--color-panel)]` |
| `bg-slate-800` + `hover:bg-slate-700` + `text-white` (primary buttons) | `bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)]` |
| `text-gray-500`, `text-gray-600` | `text-[var(--color-text-muted)]` |
| `text-gray-400` | `text-[var(--color-text-faint)]` |
| `bg-emerald-50` / `text-emerald-800` | `bg-[var(--color-success-highlight)]` / `text-[var(--color-success)]` |
| `bg-red-50` / `text-red-500`, `-600`, `-700` | `bg-[var(--color-error-highlight)]` / `text-[var(--color-error)]` |
| `border-amber-300`, `-500` / `bg-amber-50` / `text-amber-900` | `border-[var(--color-warning)]` / `bg-[var(--color-warning-highlight)]` / `text-[var(--color-warning)]` |
| `border-blue-600` / `bg-blue-50` | `border-[var(--color-primary)]` / `bg-[var(--color-primary-highlight)]` |
| `border-gray-300` / `bg-gray-50`, `bg-slate-50` | `border-[var(--color-border)]` / `bg-[var(--color-surface-offset)]` |

`VolunteerPolicySimulation.tsx:184` uses `bg-slate-900` as a code/preview background: map it to `bg-[var(--color-panel)]`, and pair it with `text-[var(--color-text-inverse)]` if its text is currently white.

- [ ] **Step 4: Verify** — the three test files pass; run the Gate.

- [ ] **Step 5: Commit**

Commit: `fix(admin): use colour tokens everywhere and give login and reset an h1`.

---

### Task 5: `/donate` has no English heading in zh-HK

**Files:**
- Modify: `src/routes/donate.tsx` (copy record at 117-206; legend at 797-799)
- Test: `src/routes/donate.test.tsx`

- [ ] **Step 1: Write the failing test**

`the consent legend follows the page language`: render `<DonatePage initialSlots={[]} initialMethods={[]} initialSearch={{}} />` (default zh-HK) and expect markup to contain `收據及通訊同意` and not `Receipts and communication consent`.

- [ ] **Step 2: Run it to confirm it fails** — `bun test src/routes/donate.test.tsx` → the new test FAILS.

- [ ] **Step 3: Implement**

Add `consentLegend: "收據及通訊同意"` to `copy["zh-HK"]` and `consentLegend: "Receipts and communication consent"` to `copy.en`. Render `{t.consentLegend}` inside the `<legend>`. The `satisfies` clause at line 206 enforces both keys.

- [ ] **Step 4: Verify** — the file passes; run the Gate.

- [ ] **Step 5: Commit** — `fix(donate): translate the consent legend on the zh-HK page`.

---

### Task 6: Admin browser code does not query the database

**Files:**
- Create: `src/lib/adoptions/matchableAnimals.ts`, `src/lib/adoptions/http/animalLookupHandlers.server.ts`, `src/lib/adoptions/http/animalLookupHandlers.server.test.ts`, `src/routes/api/admin/adoptions/animals/match-options.ts`, `src/routes/api/admin/adoptions/positions.ts`, `src/routes/api/admin/adoptions/arrival-sources.ts`, `src/components/admin/adminBrowserDataGuard.test.ts`
- Modify: `src/lib/adoptions/types.ts`, `src/lib/adoptions/service.ts` (repository type at 84; service factory at 211), `src/lib/adoptions/repository.server.ts` (factory at 1707), `src/lib/adoptions/repository.server.test.ts`, `src/lib/adoptions/http.server.ts`, `src/components/admin/adoptions/matchPanelLogic.ts`, `src/components/admin/adoptions/MatchPanel.tsx` (6, 23-29, 150-165), `src/components/admin/adoptions/AnimalPipeline.tsx` (11, 64-76, 174-192), `CLAUDE.md` and `AGENTS.md` ("Legacy exception" paragraph), `src/routeTree.gen.ts` (regenerated)

**Interfaces:**
- Produces in `src/lib/adoptions/matchableAnimals.ts`: `export const MATCHABLE_ANIMAL_STATUSES = ["available", "fostered"] as const;`. `matchPanelLogic.getMatchableAnimalStatuses()` returns `[...MATCHABLE_ANIMAL_STATUSES]` from it.
- Produces in `src/lib/adoptions/types.ts`:
  ```ts
  export type MatchableAnimalOption = { id: string; name: string; name_en: string | null; type: string; status: string };
  export type AnimalPositionRecord = AnimalPositionSummary & {
    for_cat: boolean; for_dog: boolean; address: string | null;
    contact_person: string | null; phone: string | null; email: string | null; is_active: boolean;
  };
  export type ArrivalSourceRecord = ArrivalSourceSummary & { is_active: boolean };
  ```
- Repository and service methods (same names on both):
  `listMatchableAnimals(): Promise<MatchableAnimalOption[]>`,
  `listAnimalPositions(): Promise<AnimalPositionRecord[]>`,
  `listArrivalSources(): Promise<ArrivalSourceRecord[]>`.
- Handlers: `createAnimalLookupHandlers({ requireCoordinator, service })` returns `{ listMatchableAnimals, listAnimalPositions, listArrivalSources }`, each `(context: HandlerContext) => Promise<Response>`. The response bodies are `{ animals }`, `{ positions }` and `{ arrivalSources }`.

- [ ] **Step 1: Write the failing tests**

`animalLookupHandlers.server.test.ts`, following `taskHandlers.server.test.ts`:
- `lists matchable animals after authorization`: 200, body `{ animals: [fixture] }`, one `requireCoordinator` call.
- `lists positions` → `{ positions: [...] }`; `lists arrival sources` → `{ arrivalSources: [...] }`.
- `refuses before reading when the coordinator check fails`: `requireCoordinator` throws `Response.json({ error: "Forbidden" }, { status: 403 })`, the response status is 403, and the service records no calls. Repeat with a 401 Response, expecting 401.

`repository.server.test.ts` (reuse its fake-client pattern):
- `listMatchableAnimals reads available and fostered animals in type, then name order`: the fake records `.from("animals")`, `.select("id,name,name_en,type,status")`, `.in("status", ["available","fostered"])`, `.order("type")` and `.order("name", { ascending: true })`.
- `lookup reads return [] when Supabase returns null data`, for all three methods.
- `listAnimalPositions` and `listArrivalSources` use the exact select strings and orderings now at `AnimalPipeline.tsx:177-179` and `:187-189`.

`adminBrowserDataGuard.test.ts`:
- `admin browser code does not query tables or RPCs`: scan non-test `*.ts`/`*.tsx` files under `src/components/admin` and `src/routes/admin` for `/\bsupabase\s*\.\s*(?:from|rpc)\s*\(/` and expect `[]`.
- `the matcher ignores auth and storage`: it matches `"supabase\n  .from(\"animals\")"` but not `"supabase.storage.from(bucket)"` or `"supabase.auth.getSession()"`.

- [ ] **Step 2: Run them to confirm they fail**

Run `bun test src/lib/adoptions/http/animalLookupHandlers.server.test.ts src/lib/adoptions/repository.server.test.ts src/components/admin/adminBrowserDataGuard.test.ts`. Expected: missing-module failures, and the guard lists `MatchPanel.tsx` and `AnimalPipeline.tsx` (2 hits).

- [ ] **Step 3: Implement the server side**

Add the constant and types, then the three repository methods (null data → `[]`, throw on error, as the neighbouring methods do) and the service pass-throughs. Add `animalLookupHandlers.server.ts` using `withErrors`, `jsonResponse` and `requireCoordinator` from `./shared.server`, and spread it into `createAdoptionCoordinatorHandlers` in `http.server.ts`.
Add three route files shaped like `src/routes/api/admin/adoptions/animals/pipeline.ts`, each `GET: ({ request }) => createHandlers().<handlerName>({ request })`. Then run `bun run build` to regenerate `src/routeTree.gen.ts`.

- [ ] **Step 4: Switch the components**

In `MatchPanel.tsx`, the `queryFn` becomes `async () => (await fetchCoordinatorJson<{ animals: MatchableAnimalOption[] }>("/api/admin/adoptions/animals/match-options")).animals`. Keep the query key `["admin-active-animal-options"]`, drop the local `AnimalOption` type and the `supabase` import.
In `AnimalPipeline.tsx`, `readPositions` and `readArrivalSources` call `/api/admin/adoptions/positions` and `/api/admin/adoptions/arrival-sources` the same way. Use the new record types in place of the local ones, keep `POSITIONS_QUERY_KEY` and `ARRIVAL_SOURCES_QUERY_KEY`, and drop the `supabase` import.

- [ ] **Step 5: Update the docs**

In `CLAUDE.md` and `AGENTS.md`, replace the paragraph starting `**Legacy exception**` with:
`**Animal audit trigger**: admin browser code no longer reads or writes tables directly — every admin surface goes through the API layer (\`adminBrowserDataGuard.test.ts\` enforces it). The \`log_animal_mutation\` trigger (migrations \`20260803120000\` + \`20260805120000\`) still audits any animal-table write that carries a real JWT (\`auth.uid()\` is set); service-role writes are skipped there and must write their own \`audit_log\` row at the app layer instead, so the same event is never logged twice with two different actors.`
Then keep the existing sentences from "Write that row inside a `*_with_audit` RPC" through "enforces the pairing." unchanged. In `AGENTS.md`, this also replaces the `??` mojibake.

- [ ] **Step 6: Verify**

The Step 2 files pass, `MatchPanel.test.tsx` and `AnimalPipeline` tests still pass, and the Gate passes.
`git grep -n -E "supabase\s*\.(from|rpc)\(" -- src/components/admin src/routes/admin` prints nothing.

- [ ] **Step 7: Commit**

Commit: `refactor(adoptions): serve match options and pipeline lookups from the API`.

---

### Task 7: Branch verification and draft PR

- [ ] **Step 1:** Run the Gate once more on the final tree, plus `bun run build` (expected to succeed), and record the pass/skip/fail counts.
- [ ] **Step 2:** `git push -u origin codex/audit-final-sp1-20261008`. The `codex/audit-*` pattern disables Vercel previews.
- [ ] **Step 3:** Open a **draft** PR against `main` titled `fix: admin audit SP-1 quick fixes`. The body should give the spec link, the three audit corrections, the two new page descriptions for owner review, the `.bun-version`/Vercel post-merge check, and the gate counts. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge.
