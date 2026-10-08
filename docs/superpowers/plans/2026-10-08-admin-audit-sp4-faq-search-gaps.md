# Admin audit SP-4: FAQ search-gap report and answer tester — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff see the last 30 days of FAQ searches that found no answer or a weak one, and can
test what any phrasing (including an unsaved draft) retrieves, with the data kept minimal,
deleted after 90 days and disclosed in the privacy notice.

**Architecture:** The public `HelpSearch` sends a sanitised topic, as a fire-and-forget beacon,
to a new rate-limited JSON endpoint. The endpoint re-sanitises the topic and calls a
`security definer` RPC, which increments a daily-count row in a new `faq_search_gap` table.
`/admin/faq` gains:

- a report panel, fed by an aggregating RPC through a new admin GET route;
- an in-browser answer tester that shares the public search's code.

Rows older than 90 days are purged on every insert and by the existing daily
`/api/jobs/public-uploads` job.

**Tech Stack:** TypeScript, TanStack Start file routes, React 19, TanStack Query, Supabase
Postgres (RLS, RPC), zod, Bun 1.3.14 (`bun:test`), Upstash rate limiting.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-audit-sp4-faq-search-gaps-design.md`

## Plan decisions (where the plan differs from the spec's wording)

1. **Task order: tester (Task 3) before report (Task 4).** The spec lists the report first.
   But the report's 「測試」 button fills the tester, so building the tester first lets Task 4
   wire both row actions in one place.
2. **A separate admin handler factory.** The spec says to add `listSearchGaps` to
   `createAdminFaqHandlers`. Instead, the admin GET handler is a separate factory,
   `createAdminFaqSearchGapHandler`, in the same `src/lib/faq/http.ts`, reusing its
   `withFaqErrors` and `jsonNoStore`. Adding a dependency to the existing factory would
   ripple through all eight `http.test.ts` call sites and the `/api/admin/faq` route for no
   gain.
3. **Separate search-gap service and repository** (`searchGaps.ts`,
   `searchGapRepository.server.ts`) instead of growing `FaqRepository`. The existing FAQ
   fakes in `service.test.ts` and `http.test.ts` stay untouched.
4. **"`HelpSearch` sends one beacon per submitted search" is pinned through a small pure
   function**, `recordHelpSearch`. The repo has no interactive DOM test library; component
   tests use `renderToStaticMarkup`, which cannot submit a form.
5. **Lone surrogates are dropped server-side.** The 80-character slice can cut an emoji in
   half. The service drops lone surrogates before recording; `toWellFormed` is not in the
   ES2022 lib, and `tsconfig.json` stays unchanged.

## Global Constraints

- **Worktree:** `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\audit-final-sp4-20261008`,
  branch `codex/audit-final-sp4-20261008`, stacked on `origin/codex/audit-final-sp1-20261008`
  (PR #202). Run every command there. If a shell starts elsewhere, use `Set-Location` to the
  worktree first. Never touch the main checkout or any other worktree.
- **Shared Supabase stack:** never run `supabase db reset`, `supabase stop`, or any
  migration against it.
- **Production:** never write to the production database or Vercel. Never read `.env.local`,
  `.claude/settings*.json`, `.mcp.json` or credential files.
- **Migration file:** `supabase/migrations/20261008143512_faq_search_gaps.sql`.
- **Data values, verbatim from the spec:**
  - topic: 1..80 characters;
  - language: `zh-HK` | `en`;
  - confidence: `none` | `low`;
  - day: `(now() at time zone 'Asia/Hong_Kong')::date`;
  - report window: 30 days, limit 100;
  - retention: 90 days;
  - `list_faq_search_gaps` bounds: `p_days` 1..90, `p_limit` 1..500.
- **Rate limit:** `{ prefix: "help-search-gap", max: 30, window: "1 m" }`.
- **Beacon body cap:** 1024 bytes.
- **Never stored or sent:** the raw query, IP address, user agent, session or page path.
- **Admin copy, zh-HK, verbatim:**
  - heading 「搜尋未有答案的主題（過去 30 日）」;
  - labels 沒有答案 (`none`) and 配對較弱 (`low`);
  - buttons 「測試」 and 「以此新增問題」;
  - error title 「無法載入搜尋主題報告」;
  - empty text 「過去 30 日未有訪客搜尋找不到答案。」;
  - outcome labels 直接答案 / 相關答案 / 轉介職員.
- **Admin UI styling:** `var(--color-*)` tokens only. It must pass SP-1's admin guards,
  which are already on this base.
- **Admin data access:** admin browser code reads only through `fetchAdminJson`
  (`adminBrowserDataGuard.test.ts`).
- **Every new or changed route:** run `bun run build`, which regenerates
  `src/routeTree.gen.ts`, and commit that file. CI fails on a stale route tree.
- **Reading files:** read `CLAUDE.md`, `AGENTS.md`, `privacy.tsx` and other files with
  Chinese text using the Read tool; PowerShell 5.1 `Get-Content` garbles it. Never run
  `prettier --write` on `CLAUDE.md` or `AGENTS.md`.
- **Commits:** write the message with
  `[IO.File]::WriteAllText($p, $msg, (New-Object Text.UTF8Encoding $false))` to a file in
  the session scratchpad, then `git commit -F $p`. Conventional Commits, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, and
  check `git status --short` and `git log --oneline -3` first. No bare `git stash`. Never
  push.
- **The gate, after every task:** `bunx tsc --noEmit` exits 0; `bun run lint` reports
  0 errors and no new warnings; `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test`
  reports 0 fail (`bun run test` includes `--isolate`).

## Review Focus

1. **A topic cut mid-emoji at 80 characters.** It should still be recorded, not lost to a
   database encoding error. Pinned in Task 2 by a service test.
2. **The same topic in two languages or with two labels.** It stays as separate report rows
   and is never merged. Pinned in Task 1's behaviour test.
3. **Code deployed before the migration.** The beacon still answers 204, and the admin
   report shows its error state instead of crashing. Pinned in Task 2 (handler) and Task 4
   (handler 500 and panel error state).
4. **Editing an existing FAQ in the tester.** The draft replaces that FAQ in the results; it
   never appears twice. Pinned in Task 3.
5. **A browser where `fetch` throws synchronously.** The visitor's search still works. Pinned
   in Task 2's beacon test.

---

### Task 1: Migration and database layer

**Files:**

- Create: `supabase/migrations/20261008143512_faq_search_gaps.sql`
- Create: `src/lib/faq/searchGaps.ts`
- Create: `src/lib/faq/searchGapRepository.server.ts`
- Test: `src/lib/faq/searchGapMigration.test.ts`, `src/lib/faq/searchGaps.test.ts`,
  `src/lib/faq/searchGapRepository.server.test.ts`, `supabase/rls-tests/faqSearchGap.rls.test.ts`

**Interfaces:**

- **Produces, in `searchGaps.ts`.** It is isomorphic (no Supabase import):
  ```ts
  export type SearchGapConfidence = "none" | "low";
  export type SearchGap = {
    topic: string;
    language: FaqLanguage;
    confidence: SearchGapConfidence;
    searchCount: number;
    lastSeenDay: string;
  };
  export type SearchGapReport = { days: number; gaps: SearchGap[] };
  export type SearchGapRecord = {
    topic: string;
    language: FaqLanguage;
    confidence: SearchGapConfidence;
  };
  export const SEARCH_GAP_REPORT_DAYS = 30;
  export const SEARCH_GAP_REPORT_LIMIT = 100;
  export interface SearchGapRepository {
    record(input: SearchGapRecord): Promise<void>;
    list(days: number, limit: number): Promise<SearchGap[]>;
    purge(): Promise<number>;
  }
  export function createSearchGapService({ repo }: { repo: SearchGapRepository }): {
    listReport(): Promise<SearchGapReport>;
  };
  ```
  Task 2 adds `record` to this service.
- **Produces:** `createSupabaseSearchGapRepository(client: SupabaseClient): SearchGapRepository`.
  It calls these RPCs:
  - `record_faq_search_gap({ p_topic, p_language, p_confidence })`;
  - `list_faq_search_gaps({ p_days, p_limit })`, whose rows map `search_count` → `searchCount`
    (via `z.coerce.number()`) and `last_seen_day` → `lastSeenDay`;
  - `purge_faq_search_gaps()`, which returns the deleted count.

  Any RPC `error` is thrown.

- [ ] **Step 1: Write the failing migration-text test** `src/lib/faq/searchGapMigration.test.ts`.
      It reads the migration, finding it with `readdirSync("supabase/migrations")` and the suffix
      `_faq_search_gaps.sql`. It asserts that the SQL contains:
  - `create table public.faq_search_gap`
  - `primary key (day, language, confidence, topic)`
  - `alter table public.faq_search_gap enable row level security`
  - `revoke all on table public.faq_search_gap from public, anon, authenticated`
  - `at time zone 'Asia/Hong_Kong'`

  For each of `purge_faq_search_gaps()`, `record_faq_search_gap(text, text, text)` and
  `list_faq_search_gaps(integer, integer)`, it asserts the SQL contains
  `revoke all on function public.<sig> from public, anon, authenticated` and
  `grant execute on function public.<sig> to service_role`.

  It asserts there are exactly 3 matches of `security definer`, and that each one is
  followed by `set search_path = public, pg_temp` within its header.

- [ ] **Step 2: Write the failing unit tests.**
  - `searchGaps.test.ts`: `listReport` returns `{ days: 30, gaps }` and calls
    `repo.list(30, 100)` exactly once.
  - `searchGapRepository.server.test.ts`, against a fake client whose `rpc` is a `mock`:
    - each method sends the exact RPC name and arguments above;
    - `list` maps `{ topic: "x", language: "en", confidence: "low", search_count: "3", last_seen_day: "2026-10-08" }`
      to `{ topic: "x", language: "en", confidence: "low", searchCount: 3, lastSeenDay: "2026-10-08" }`;
    - an RPC `error` rejects each method.
- [ ] **Step 3: Run them and see them fail.**
      `bun test src/lib/faq/searchGapMigration.test.ts src/lib/faq/searchGaps.test.ts src/lib/faq/searchGapRepository.server.test.ts`
      → FAIL (the files are missing).
- [ ] **Step 4: Write the migration.** Table `public.faq_search_gap`:
  - `day date not null`
  - `language text not null check (language in ('zh-HK','en'))`
  - `confidence text not null check (confidence in ('none','low'))`
  - `topic text not null check (char_length(topic) between 1 and 80)`
  - `search_count integer not null default 1 check (search_count > 0)`
  - `last_seen_at timestamptz not null default now()`
  - `primary key (day, language, confidence, topic)`

  Enable RLS and add no policies. Revoke all on the table from public, anon and
  authenticated. All three functions are `plpgsql`, `security definer`,
  `set search_path = public, pg_temp`, and use
  `v_today date := (now() at time zone 'Asia/Hong_Kong')::date`.
  - **purge:** deletes rows where `day < v_today - 90` and returns the count.
  - **record:** runs `perform public.purge_faq_search_gaps();`, then
    `insert … values (v_today, p_language, p_confidence, p_topic) on conflict (day, language, confidence, topic) do update set search_count = <alias>.search_count + 1, last_seen_at = now()`.
  - **list:**
    - raises `errcode '22023'` when `p_days` is outside 1..90 or `p_limit` is outside
      1..500;
    - `return query` over `where g.day > v_today - p_days`;
    - `group by g.topic, g.language, g.confidence`;
    - `order by sum(g.search_count) desc, max(g.day) desc, g.topic`, then `limit p_limit`.

  **Qualify every column with the alias `g.`.** `RETURNS TABLE` column names are plpgsql
  variables, so unqualified `topic` or `language` would be ambiguous. Then add the
  revoke/grant lines.

- [ ] **Step 5: Verify the SQL on a throwaway Postgres** (not the shared stack). In
      PowerShell:
  1. `docker run -d --name pg-sp4-faq-gaps -e POSTGRES_PASSWORD=postgres postgres:16-alpine`.
  2. Wait until `docker exec pg-sp4-faq-gaps pg_isready -U postgres` succeeds.
  3. Write a stub file containing
     `create role anon; create role authenticated; create role service_role;`.
  4. `docker cp` the stub and the migration into the container.
  5. Run each with `docker exec pg-sp4-faq-gaps psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/<file>`.
  6. Run a smoke script:
     - call `record_faq_search_gap('test','en','none')` twice;
     - `select search_count from faq_search_gap` → 2;
     - `select * from list_faq_search_gaps(30,100)` → 1 row with `search_count` 2;
     - `select list_faq_search_gaps(0,100)` → error;
     - insert a row with `day = current_date - 120`, then `select purge_faq_search_gaps()`
       → 1.
  7. `docker rm -f pg-sp4-faq-gaps`.

  Expected: every statement succeeds except the deliberate error. Paste the outputs in the
  report.

- [ ] **Step 6: Implement `searchGaps.ts` and `searchGapRepository.server.ts`.** The
      repository parses rows with a zod schema; rows that fail to parse are dropped.
- [ ] **Step 7: Write the database behaviour test** `supabase/rls-tests/faqSearchGap.rls.test.ts`.
      Mirror `sponsorshipAssignment.rls.test.ts`: the reachability check, the
      `describe.skipIf(!reachable)`, local demo keys, an authenticated client created as that
      file does, and cleanup in `afterAll`. Use a unique topic prefix
      `rls-faq-gap-<random>`. Tests:
  - anon and authenticated can neither `select` nor `insert` on `faq_search_gap`, and
    neither can `rpc("record_faq_search_gap")` (each returns an error);
  - service `record` twice for one topic → one row with `search_count` 2;
  - the same topic recorded for `zh-HK`/`none`, `en`/`none` and `en`/`low` → three separate
    `list` rows (Review Focus 2);
  - service inserts rows at HK today − 91 and today − 90; `purge` deletes the −91 row and
    keeps the −90 row;
  - rows at today and today − 29 are summed by `list(30, …)`, but a row at today − 30 is
    not;
  - ordering is by total desc;
  - `list(0, 1)`, `list(91, 1)`, `list(1, 0)` and `list(1, 501)` each error.

  Compute HK today in the test with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" })`.
  The gate skips it (`SUPABASE_LOCAL_URL` points nowhere); CI's `test:rls` runs it on a
  fresh stack.

- [ ] **Step 8: Run the unit tests and see them pass,** then run the full gate.
- [ ] **Step 9: Commit.** Stage the four tests, the migration and the two modules.
      Message: `feat(faq): add the faq_search_gap table and its database layer`.

### Task 2: Shared sanitiser, beacon, public endpoint

**Files:**

- Create: `src/lib/help/sanitizeQuery.ts`
- Modify: `src/lib/help/analytics.ts`, which keeps exporting `sanitizeHelpQuery` and
  `SanitizedHelpQuery`
- Modify: `src/lib/faq/schemas.ts`, `src/lib/faq/searchGaps.ts`
- Create: `src/lib/faq/searchGapHttp.server.ts`, `src/routes/api/help/search-gap.ts`,
  `src/lib/help/searchGapBeacon.ts`, `src/lib/help/recordSearch.ts`
- Modify: `src/components/site/help/HelpSearch.tsx` (`runSearch` only),
  `src/routeTree.gen.ts` (regenerated), `CLAUDE.md`, `AGENTS.md`
- Test: `src/lib/faq/searchGaps.test.ts`, `src/lib/faq/searchGapHttp.server.test.ts`,
  `src/lib/help/searchGapBeacon.test.ts`, `src/lib/help/recordSearch.test.ts`; the existing
  `src/lib/help/analytics.test.ts` must pass unchanged

**Interfaces:**

- **Consumes:** Task 1's `createSearchGapService`, `createSupabaseSearchGapRepository`,
  `SearchGapRecord`.
- **Produces:**
  - `searchGapBeaconSchema` in `schemas.ts`:
    `z.object({ topic: z.string().min(1).max(80), language: z.enum(["zh-HK","en"]), confidence: z.enum(["none","low"]) }).strict()`.
  - On the service: `record(input: unknown): Promise<"recorded" | "dropped">`.
  - `createSearchGapBeaconHandler(deps: { rateLimit(request: Request): Promise<RateLimitResult>; record(input: unknown): Promise<"recorded" | "dropped">; log?: Pick<Console, "error"> }): (request: Request) => Promise<Response>`.
  - `reportSearchGap(input: { query: string; language: HelpLanguage; confidence: HelpSearchConfidence }, deps?: { fetch?: typeof fetch }): void`.
  - `recordHelpSearch(input: { query: string; language: HelpLanguage; response: HelpSearchResponse }, deps?: { track?: typeof trackHelpEvent; reportGap?: typeof reportSearchGap }): void`.

- [ ] **Step 1: Write the failing tests.**
  - **`searchGaps.test.ts` additions:**
    - `record` with a valid body calls `repo.record` with the **re-sanitised** topic. Input
      `"Adoption Fee?"` gives the topic `sanitizeHelpQuery("Adoption Fee?").queryTopic`,
      and the call returns `"recorded"`.
    - A topic that sanitises to redacted, for example `"call me 91234567"`, returns
      `"dropped"` with no repo call.
    - An extra field, an 81-character topic, `language: "fr"` and `confidence: "high"` each
      reject with a `ZodError`.
    - A topic of 79 `"a"` characters plus `"\uD83D"` (a lone high surrogate) records a
      topic with no lone surrogate (Review Focus 1).
  - **`searchGapHttp.server.test.ts`.** The handler is built with fake `rateLimit`,
    `record` and `log`:
    - over the limit → 429 with a `retry-after` header, and `record` is not called;
    - `content-type: text/plain` → 415;
    - a 1025-byte body → 413;
    - invalid JSON → 400;
    - `record` throwing a `ZodError` → 400;
    - `record` returning `"dropped"` → 204;
    - `record` throwing an `Error` → 204, with `log.error` called once (Review Focus 3);
    - a success → 204 with an empty body.
  - **`searchGapBeacon.test.ts`.** With an injected `fetch` mock:
    - sent once for `none` and once for `low`, to `"/api/help/search-gap"` with
      `method: "POST"`, `keepalive: true` and `content-type: application/json`;
    - the parsed body's keys are exactly `["confidence","language","topic"]`, and its
      `topic` is not the raw query when the raw query has uppercase or punctuation;
    - not sent for `medium`, for `high`, or for a redacted query such as
      `"my phone is 91234567"`;
    - a rejecting `fetch`, and a `fetch` that throws synchronously, both return without
      throwing (Review Focus 5).
  - **`recordHelpSearch.test.ts`:** one call to `track` with
    `("help_search", { language, resultCount, confidenceBucket, query })` and exactly one
    call to `reportGap` with `{ query, language, confidence }`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - **The sanitiser move.** Move `sanitizeHelpQuery`, `SanitizedHelpQuery` and their
    private pattern helpers verbatim into `sanitizeQuery.ts`. `analytics.ts` then imports
    and re-exports them.
  - **`record`.** It parses with `searchGapBeaconSchema`, re-sanitises, drops lone
    surrogates from the topic, and calls the repository.
  - **The handler.** It runs these steps in order, and each failure returns immediately:
    1. `rateLimit(request)`: not ok → 429 with `retry-after: retryAfterSeconds(result)`.
    2. The content type, lowercased and with no parameters, is not `application/json` → 415.
    3. `readBoundedText(request, 1024)` returns `null` → 413.
    4. `JSON.parse` fails → 400.
    5. `record(parsed)`:
       - a `ZodError` → 400;
       - any other error → `log.error("FAQ search gap record failed", error)` and 204;
       - `"dropped"` or `"recorded"` → 204.

    Every 204 has a `null` body.

  - **The route** (`src/routes/api/help/search-gap.ts`). It defines POST only, and passes:
    - `rateLimit` as `enforceRateLimit(getClientIp(request), { prefix: "help-search-gap", max: 30, window: "1 m" })`;
    - `record` as a function that builds
      `createSearchGapService({ repo: createSupabaseSearchGapRepository(createSupabaseServiceClient()) })`
      **inside** the call, so a client-creation failure is also caught and answered with 204.
  - **The beacon.** It wraps everything in `try`/`catch` and attaches `.catch(() => {})`.
  - **`HelpSearch.runSearch`.** Replace its `trackHelpEvent(...)` call with
    `recordHelpSearch({ query: nextQuery, language, response: nextResponse })`.

- [ ] **Step 4: Add the security-invariant sentence.** Insert it into both `CLAUDE.md` and
      `AGENTS.md`, directly after the `/api/csp-report` sentence in Security Invariants:
      `Page-JS telemetry beacons that carry only a server-re-sanitised, non-identifying value (e.g. /api/help/search-gap) are rate limited, JSON-only and size-capped instead of Turnstile-verified: there is no form to attach a token to.`
- [ ] **Step 5: Regenerate the route tree** with `bun run build` and check that
      `git diff --stat src/routeTree.gen.ts` lists the new route. Run the tests, then the full
      gate.
- [ ] **Step 6: Commit.** Message: `feat(faq): collect sanitised zero-result search topics`.

### Task 3: Shared helpers and the answer tester

**Files:**

- Create: `src/lib/faq/toHelpFaq.ts`; modify `src/lib/faq/repository.server.ts`, which now
  imports it
- Create: `src/lib/help/outcome.ts`; modify `src/components/site/help/HelpSearch.tsx`,
  which uses it for `directResult`, `showRelated` and `showFallback`
- Create: `src/lib/faq/answerTester.ts`, `src/components/admin/content/FaqAnswerTester.tsx`
- Modify: `src/components/admin/content/FaqManagement.tsx`
- Test: `src/lib/help/outcome.test.ts`, `src/lib/faq/answerTester.test.ts`,
  `src/components/admin/content/FaqAnswerTester.test.tsx`; the existing
  `FaqManagement.test.tsx` and `repository.server.test.ts` must still pass

**Interfaces:**

- **Produces:**
  - `toHelpFaq(entry: FaqEntry): HelpFaq`, moved unchanged.
  - `describeHelpOutcome(response: HelpSearchResponse, submittedQuery: string): { direct: HelpSearchResult | undefined; related: HelpSearchResult[]; showFallback: boolean }`.
  - `buildTesterFaqs(entries: FaqEntry[], draft: FaqEntryInput | null): { faqs: HelpFaq[]; draftHidden: boolean }`.
  - `FaqAnswerTester` props:
    `{ faqs: HelpFaq[]; draftHidden: boolean; query: string; language: FaqLanguage; onQueryChange(query: string): void; onLanguageChange(language: FaqLanguage): void }`.
  - `FaqManagement` holds `testerQuery` and `testerLanguage` state (default `""` and
    `"zh-HK"`). Task 4 sets them.

- [ ] **Step 1: Write the failing tests.**
  - **`outcome.test.ts`.** Build responses with `searchHelpFaqs` over two fixture FAQs:
    - `high` → `direct` is the first result, `related` is empty, `showFallback` is false;
    - `medium` → `direct` is undefined, `related` holds the results, `showFallback` is
      false;
    - `low` → `showFallback` is true;
    - `none` → `related` is empty and `showFallback` is true;
    - a `high` match on a query for which `requiresStaffContact` is true (for example
      "my application status" against a fixture whose keyword is "application") →
      `showFallback` is true;
    - an empty submitted query → `related` is empty and `showFallback` is false.
  - **`answerTester.test.ts`:**
    - inactive entries are excluded;
    - a draft with no id is appended under the id `"draft"`;
    - a draft carrying an existing entry's id replaces that entry, and the result has no
      duplicate id (Review Focus 4);
    - `draftHidden` is true exactly when the draft has `isActive: false`;
    - the draft's `ctaKey` maps through `resolveFaqCta`.
  - **`FaqAnswerTester.test.tsx`.** Using `renderToStaticMarkup`, with props built from
    fixtures:
    - a matching query shows the confidence, 直接答案 and the matched question;
    - a non-matching query shows 轉介職員;
    - `draftHidden: true` shows 「此草稿目前設為不顯示，訪客在啟用前不會看到。」;
    - the standing line 「已發佈的修改最多需要 5 分鐘才會在訪客的頁面上出現。」 is always
      present;
    - with `language: "en"`, matched questions render in English.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - The tester computes `searchHelpFaqs(query, faqs, { language, limit: 8 })` in `useMemo`.
  - It shows, in order:
    - the confidence (高 / 中 / 低 / 沒有 for high, medium, low and none);
    - the outcome label;
    - matched questions in the chosen language;
    - 「此問題會建議訪客聯絡職員」 when `requiresStaffContact(query)` is true.
  - **`FaqManagement`:**
    - render `<FaqAnswerTester>` under the page header and above the table;
    - feed it `buildTesterFaqs(entries, draft ? toInput(draft) : null)`;
    - keep the query and language state in `FaqManagement`.
  - **`HelpSearch`:** it renders exactly as before, but takes its three booleans and the
    direct result from `describeHelpOutcome`.
- [ ] **Step 4: Run the tests and the full gate.**
- [ ] **Step 5: Commit.** Message: `feat(faq): add an answer tester that shares the public search logic`.

### Task 4: Admin report endpoint and panel

**Files:**

- Modify: `src/lib/faq/http.ts`, adding the export `createAdminFaqSearchGapHandler`
- Create: `src/routes/api/admin/faq/search-gaps.ts`, `src/components/admin/content/FaqSearchGapsReport.tsx`
- Modify: `src/components/admin/content/FaqManagement.tsx`, `src/routeTree.gen.ts` (regenerated)
- Test: `src/lib/faq/http.test.ts` (add a describe block), `src/components/admin/content/FaqSearchGapsReport.test.tsx`

**Interfaces:**

- **Consumes:** Task 1's `createSearchGapService().listReport()` and `SearchGapReport`;
  Task 3's `FaqManagement` tester state and `draftFromEntry`.
- **Produces:**
  - `createAdminFaqSearchGapHandler({ requireFaqAdmin, service }: { requireFaqAdmin: (request: Request) => Promise<AdminUser>; service: { listReport(): Promise<SearchGapReport> } }): (ctx: { request: Request }) => Promise<Response>`.
  - `FaqSearchGapsReport` props:
    `{ onTest(topic: string, language: FaqLanguage): void; onCreate(topic: string, language: FaqLanguage): void }`.
  - Query key: `ADMIN_FAQ_SEARCH_GAPS_QUERY_KEY = ["admin-faq-search-gaps"]`.

- [ ] **Step 1: Write the failing tests.**
  - **`http.test.ts` additions:**
    - the handler calls `requireFaqAdmin` once and returns `listReport()`'s value with
      `cache-control: no-store` and status 200;
    - a `Response` thrown by `requireFaqAdmin` passes through (403);
    - `listReport` throwing → 500 `{ error: "Could not process FAQ request" }`
      (Review Focus 3).
  - **`FaqSearchGapsReport.test.tsx`.** Mock `@tanstack/react-query`'s `useQuery` as
    `FaqManagement.test.tsx` does:
    - loading shows 載入中…;
    - error shows 「無法載入搜尋主題報告」 and 「重試」;
    - an empty `gaps` array shows 「過去 30 日未有訪客搜尋找不到答案。」;
    - two rows (`none`/`zh-HK` and `low`/`en`) show 沒有答案, 配對較弱, 中文, English, their
      counts and days, and the buttons 「測試」 and 「以此新增問題」;
    - the heading 「搜尋未有答案的主題（過去 30 日）」 is present.

    The row buttons call `onTest` / `onCreate` with `(topic, language)`. Test this through
    an exported pure helper `searchGapRowActions(gap, { onTest, onCreate })` that returns
    the two click handlers, because static markup cannot click.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - **The route.** It has GET only. It builds `createSupabaseServiceClient()` and passes
    `requireFaqAdmin: (request) => requireAdmin(request, ["staff", "admin"], client)`
    (that exact call appears in the route file, as in `src/routes/api/admin/faq.ts`). It
    also passes
    `service: createSearchGapService({ repo: createSupabaseSearchGapRepository(client) })`.
  - **The panel.** It reads `fetchAdminJson<SearchGapReport>("/api/admin/faq/search-gaps")`
    and renders a token-styled table plus the four states.
  - **`FaqManagement`.** Render the panel above the tester.
    - `onTest` sets the tester's query and language.
    - `onCreate` runs
      `setDraft({ ...draftFromEntry(), [language === "en" ? "questionEn" : "questionZh"]: topic })`.
- [ ] **Step 4: Regenerate the route tree** with `bun run build`, then run the tests and the
      full gate.
- [ ] **Step 5: Commit.** Message: `feat(faq): show recent zero-result search topics in the FAQ admin`.

### Task 5: Daily purge step and privacy notice

**Files:**

- Modify: `src/routes/api/jobs/public-uploads.ts`, `src/routes/api/jobs/public-uploads.test.ts`,
  `src/routes/about/privacy.tsx`
- Create: `src/routes/about/privacy.test.ts`

**Interfaces:**

- **Consumes:** Task 1's `createSupabaseSearchGapRepository(client).purge()`.
- **Produces:** a new handler dependency,
  `runFaqSearchGapPurge(client: SupabaseClient): Promise<{ removed: number; preserved: number; failed: number }>`.
  By default it returns `{ removed: await createSupabaseSearchGapRepository(client).purge(), preserved: 0, failed: 0 }`.
  Its result appears in the response JSON as `faqSearchGaps`.

- [ ] **Step 1: Write the failing tests.**
  - **`public-uploads.test.ts`:**
    - Every existing handler that reaches the cleanup branch gets a
      `runFaqSearchGapPurge` override returning `{ removed: 0, preserved: 0, failed: 0 }`.
      Its default would call a real RPC on the fake client.
    - The "runs only daily orphan cleanup domains" test also expects `"faqSearchGaps"` in
      its `calls`.
    - New: a success puts `faqSearchGaps: { removed: 2, preserved: 0, failed: 0 }` in the
      body.
    - New: a purge rejection logs `"FAQ search gap purge failed"` and answers 500, while
      the other four still run.
  - **`privacy.test.ts`.** It reads `src/routes/about/privacy.tsx` as text and asserts that
    it contains:
    - 「最後更新：2026年10月」;
    - the title 「6. 常見問題搜尋」;
    - this paragraph verbatim (approved wording; the owner confirms it before merge):
      「當您使用網站的常見問題搜尋而未找到合適答案時，我們會保存已移除個人資料的搜尋主題、所用語言及日期，以了解需要補充哪些答案。我們不會一併保存您的 IP 位址或任何可識別您身分的資料，並會在 90 日內刪除這些記錄。請勿在搜尋中輸入個人資料。」;
    - the title 「7. 查閱及更正權利」;
    - no remaining 「6. 查閱及更正權利」.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - Add the dependency, the fifth `Promise.allSettled` entry, the log line and the
    `faqSearchGaps` response field, following the four existing cleanups.
  - In `privacy.tsx`:
    - insert the new section object after section 5;
    - renumber 「6. 查閱及更正權利」 to 「7.」;
    - change line 29's date to 2026年10月.
- [ ] **Step 4: Run the tests and the full gate.**
- [ ] **Step 5: Commit.** Message: `feat(faq): purge old search topics daily and disclose them in the privacy notice`.
