# Admin audit SP-4: FAQ search-gap report and answer tester

Date: 2026-10-08 · Base: `origin/codex/audit-final-sp1-20261008 @ 2ebddd7d` (PR #202, stacked) ·
Branch: `codex/audit-final-sp4-20261008`

This is sub-project SP-4 of the 2026-10-07 admin audit follow-up; the SP-1 spec's context
section lists all six. It is stacked on SP-1 because SP-1 also edits
`src/components/admin/content/FaqManagement.tsx` and adds the admin design guards (tokens only,
`h1`, page titles) that the new admin UI must pass. SP-4's PR targets SP-1's branch until
#202 merges, and is then retargeted to `main`.

## What the audit asked for, and what is true

Audit fix F-10 (P3): "Add a zero-result query report to `/admin/faq` and a 'test this answer'
box. Done when staff can see the last 30 days of unanswered topics." The audit says the
analytics module "already emits `queryTopic`" for non-PII queries.

What the code shows:

| Claim                          | Finding                                                                                                                                                                                  | Evidence                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Search topics reach GA4        | **No.** Production has no `VITE_GA_MEASUREMENT_ID`, so `initGA4` never runs, `window.gtag` is undefined, and `gtagEvent` drops every `help_search` event. No search data exists anywhere | Production env-name listing (16 names, 2026-10-08); `src/routes/__root.tsx:155`; `src/lib/analytics.ts:56-60` |
| Searches hit the server        | **No.** `HelpSearch` runs `searchHelpFaqs` in the browser over the FAQ list the page loaded                                                                                              | `src/components/site/help/HelpSearch.tsx:53-81`                                                               |
| A non-PII topic exists         | **Yes.** `sanitizeHelpQuery` redacts personal-data patterns and returns a normalised topic of up to 80 characters                                                                        | `src/lib/help/analytics.ts:74-94`                                                                             |
| The privacy notice covers this | **No.** `/about/privacy` does not mention analytics or search                                                                                                                            | `src/routes/about/privacy.tsx`                                                                                |
| A test box needs a backend     | **No.** The same browser search can run over the admin's FAQ list                                                                                                                        | `src/lib/help/search.ts`                                                                                      |

So the report needs its own first-party collection.

## Decisions made with the user (2026-10-08)

1. Store the sanitised search topics on our own server, and add one privacy-notice section.
   The owner or content owner approves the wording before merge.
2. Record searches whose confidence is `none` or `low`, each labelled in the report.
3. Store daily counts per topic (approach A), not one row per search.
4. Stack the branch on SP-1.
5. Guarantee the 90-day deletion by purging on every insert **and** in the existing daily
   cleanup job `/api/jobs/public-uploads`.

## Goal

Staff can see which visitor search topics found no answer, or only a weak one, in the last
30 days. They can check what any phrasing would retrieve, including an unsaved draft, before
publishing. The data held is the minimum needed, and the privacy notice says so.

## Non-goals

- GA4. Enabling it, reading from it, and consent banners are out of scope.
- Generative answers or any model provider.
- A dismiss or hide action on report rows. Topics age out of the 30-day window.
- English admin copy. The admin screen stays zh-HK inline, like the current FAQ page; the
  EN-toggle decision is SP-5's.
- Any change to search scoring or confidence thresholds.
- Turnstile on the beacon (see §2).
- Applying the migration to production. That is a separate step that needs the user's
  approval (see Release order).

## Design

### 1. Data: one table, three functions

A new migration, `supabase/migrations/<timestamp>_faq_search_gaps.sql`. Its timestamp is later
than every migration on `main` and on SP-1's branch, and `supabaseMigrations.test.ts`
enforces unique versions.

- **Table `public.faq_search_gap`**
  - `day date not null`: the Hong Kong calendar day, `(now() at time zone 'Asia/Hong_Kong')::date`
  - `language text not null`, check `in ('zh-HK','en')`
  - `confidence text not null`, check `in ('none','low')`
  - `topic text not null`, check `char_length(topic) between 1 and 80`
  - `search_count integer not null default 1`, check `> 0`
  - `last_seen_at timestamptz not null default now()`
  - Primary key `(day, language, confidence, topic)`
  - RLS enabled, with no policies.
  - `revoke all on table public.faq_search_gap from public, anon, authenticated`. Only the
    functions below touch the table.
- **`public.purge_faq_search_gaps() returns integer`**
  - Deletes rows whose `day` is more than 90 days before the HK day; returns the count.
- **`public.record_faq_search_gap(p_topic text, p_language text, p_confidence text) returns void`**
  - Calls the purge first.
  - Then inserts the row for today, or on conflict adds 1 to `search_count` and sets
    `last_seen_at = now()`.
- **`public.list_faq_search_gaps(p_days integer, p_limit integer)`**
  - Returns `table (topic text, language text, confidence text, search_count bigint, last_seen_day date)`.
  - Raises on `p_days` outside 1..90 or `p_limit` outside 1..500.
  - Sums `search_count` over rows whose `day` falls within the last `p_days` HK days,
    including today, grouped by topic, language and confidence.
  - Orders by total searches desc, then last day desc, then topic.
- **Every function:**
  - `security definer`, `set search_path = public, pg_temp`;
  - `revoke all … from public, anon, authenticated`;
  - `grant execute … to service_role`.

What is never stored: IP address, user agent, session, page path, a timestamp finer than
the day in the key, or the raw query.

### 2. Collection: browser beacon and public endpoint

- **A shared sanitiser.** `sanitizeHelpQuery` moves out of `src/lib/help/analytics.ts`
  (which imports the browser-only `gtagEvent`) into `src/lib/help/sanitizeQuery.ts`.
  `analytics.ts` keeps re-exporting it, so existing imports and tests are unchanged.
- **Browser beacon.** `reportSearchGap({ query, language, confidence }, deps?)` lives in
  `src/lib/help/searchGapBeacon.ts`.
  - If `confidence` is not `none` or `low`, it does nothing.
  - It sanitises the query. If the result is redacted, it does nothing.
  - Otherwise it sends
    `fetch("/api/help/search-gap", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, language, confidence }) })`
    and ignores both the result and any error.
  - `fetch` is injectable for tests.
  - The raw query is never sent.
- **Where it is called.** `HelpSearch.runSearch` calls it once per submitted search, beside
  the existing `trackHelpEvent("help_search", …)`. Nothing the visitor sees changes.
- **Endpoint `POST /api/help/search-gap`.** The route file
  `src/routes/api/help/search-gap.ts` is thin. It wires a handler factory in
  `src/lib/faq/searchGapHttp.server.ts`, whose dependencies are injected: rate limiter,
  record function and logger. The handler, in order:
  1. `enforceRateLimit(getClientIp(request), { prefix: "help-search-gap", max: 30, window: "1 m" })`.
     When over the limit it answers 429 with `retry-after`.
  2. Content type must be `application/json`, otherwise 415. That type is not
     CORS-safelisted, so a cross-origin POST needs a preflight, which this route never
     answers; this is the same reasoning as `/api/csp-report`.
  3. The body is capped at 1024 bytes with `readBoundedText`, otherwise 413.
  4. JSON parse and the zod schema `{ topic: string 1..80, language: "zh-HK" | "en", confidence: "none" | "low" }`
     must pass, otherwise 400. The schema lives in `src/lib/faq/schemas.ts`.
  5. It runs `sanitizeHelpQuery(topic)` again. If the result is redacted, it answers 204 and
     records nothing. Otherwise it records the **re-sanitised** topic.
  6. If the record call throws, it calls `console.error` once and still answers 204.

  It answers 204 with no body in every success case.

- **Why there is no Turnstile.** The beacon is page-JS telemetry, sent after a search, and
  carries only a re-sanitised, non-identifying topic. A Turnstile challenge per search
  would add cost and delay for no benefit. The security invariants in `CLAUDE.md` and
  `AGENTS.md` get one sentence stating this class of endpoint and its controls: rate
  limited, JSON-only, size-capped, re-sanitised server-side, no Turnstile.

### 3. Admin report

- **Endpoint `GET /api/admin/faq/search-gaps`.** The route file is
  `src/routes/api/admin/faq/search-gaps.ts`; nesting beside `faq.ts` follows the existing
  `supporters.ts` + `supporters/` pattern.
  - It calls `requireAdmin(request, ["staff", "admin"], client)`, the same roles as the FAQ
    editor.
  - It adds a `listSearchGaps` handler to `createAdminFaqHandlers` in `src/lib/faq/http.ts`,
    plus a service method and a repository method that calls
    `list_faq_search_gaps(30, 100)`.
  - It responds `{ days: 30, gaps: Array<{ topic, language, confidence, searchCount, lastSeenDay }> }`,
    with `cache-control: no-store`.
  - It is read-only, so it writes no audit-log row.
- **Panel `src/components/admin/content/FaqSearchGapsReport.tsx`.** It sits on `/admin/faq`
  above the FAQ table, with a section heading
  「搜尋未有答案的主題（過去 30 日）」.
  - It reads through `fetchAdminJson`, following the admin browser-data guard.
  - Each row shows the topic, the language (中文 / English), a label (沒有答案 for `none`,
    配對較弱 for `low`), the search count and the last day seen.
  - Each row has two buttons:
    - 「測試」 puts the topic and its language into the answer tester.
    - 「以此新增問題」 opens a new FAQ draft with the topic as the question in that language.
  - States:
    - loading: 載入中…
    - error: the existing `LoadFailure`, titled 「無法載入搜尋主題報告」
    - empty: 「過去 30 日未有訪客搜尋找不到答案。」
  - Colours use `var(--color-*)` tokens only, and the panel passes SP-1's admin guards.

### 4. Answer tester and shared helpers

- **`toHelpFaq` moves.** It moves from `src/lib/faq/repository.server.ts`, which the
  browser cannot import, to `src/lib/faq/toHelpFaq.ts`. It uses `resolveFaqCta` from
  `schemas.ts`. The repository imports it from there.
- **The outcome rule is shared.** It moves out of `HelpSearch.tsx` (lines 89-96) into a pure
  helper,
  `describeHelpOutcome(response: HelpSearchResponse, submittedQuery: string): { direct: HelpSearchResult | undefined; related: HelpSearchResult[]; showFallback: boolean }`,
  in `src/lib/help/outcome.ts`.
  - It keeps today's rule exactly:
    - **direct:** the first result when confidence is `high`;
    - **related:** shown when there is no direct answer and at least one result;
    - **fallback:** shown for `low` or `none` confidence, or whenever `requiresStaffContact`
      is true.
  - `HelpSearch` uses it, and its rendered behaviour does not change.
- **Panel `src/components/admin/content/FaqAnswerTester.tsx`.**
  - It has a text input, a 中文 / English choice and a result area. It runs
    `searchHelpFaqs(query, faqs, { language, limit: 8 })`; 8 is the full-page limit.
  - Its FAQ list is the active entries mapped by `toHelpFaq`. If a draft is open, the draft
    replaces the entry with the same id, or is added if it is new, as though it were saved.
  - It shows:
    - the confidence;
    - what a visitor would see (直接答案 / 相關答案 / 轉介職員), via `describeHelpOutcome`;
    - the matched FAQ questions;
    - whether the query would be sent to staff.
  - If the open draft is set to hidden, a note says visitors will not see it until it is
    shown.
  - A standing line tells staff that published changes can take up to 5 minutes to reach
    returning visitors (`PUBLIC_FAQS_STALE_TIME_MS`).
  - The query and language state live in `FaqManagement`, so the report's 「測試」 button
    can set them.

### 5. Guaranteed retention: daily cleanup step

`src/routes/api/jobs/public-uploads.ts` gains an injected dependency,
`runFaqSearchGapPurge(client)`, which calls `purge_faq_search_gaps()` and returns
`{ removed, preserved: 0, failed: 0 }`. It runs alongside the four existing cleanups.

- Its result appears in the response as `faqSearchGaps`.
- A rejection is logged and makes the job answer 500, like the other cleanups.
- Its tests follow the existing `public-uploads.test.ts` pattern.

This gives a deletion guarantee once background jobs are switched on (SP-2's runbook). The
insert-time purge covers active periods before that.

### 6. Privacy notice

`src/routes/about/privacy.tsx` gets a new section 「常見問題搜尋」 after section 5. Later
sections are renumbered, and 「最後更新」 becomes 2026年10月. The draft text, which the owner
approves before merge:

> 當您使用網站的常見問題搜尋而未找到合適答案時，我們會保存已移除個人資料的搜尋主題、所用語言及日期，以了解需要補充哪些答案。我們不會一併保存您的 IP 位址或任何可識別您身分的資料，並會在 90 日內刪除這些記錄。請勿在搜尋中輸入個人資料。

## Release order

1. The migration is verified locally on a throwaway `postgres:16-alpine` container, never
   the shared local Supabase stack, and in CI on CI's own Supabase stack.
2. **Before merge**, the migration is applied to production. That is a production database
   write, so it waits for the user's explicit approval and is not done by this branch.
3. Merge (release approval). If the code ships before the migration, nothing breaks: the
   beacon still answers 204 and logs the failure, and the report shows its error state.

## Testing

- **Migration rules.** `supabaseMigrations.test.ts`-style text checks:
  - RLS is enabled;
  - table privileges are revoked from public, anon and authenticated;
  - each function is `security definer` with a pinned `search_path`;
  - each function has its revoke and its `service_role` grant.
- **Migration behaviour.** A test in `supabase/rls-tests/`, which `bun run test:rls` runs in
  CI against a fresh stack, checks:
  - anon and authenticated can neither select nor insert;
  - `record_faq_search_gap` adds 1 to the same day's row;
  - `purge_faq_search_gaps` deletes rows older than 90 days and keeps newer ones;
  - `list_faq_search_gaps` sums, filters by window, orders and limits, and rejects
    out-of-range arguments.

  The same SQL is also applied to a throwaway container locally.

- **Endpoint.**
  - 429, 415, 413 and 400 each return before any record call.
  - A redacted topic answers 204 with no record call.
  - The record call receives the re-sanitised topic, language and confidence.
  - A thrown record call answers 204 and logs once.
- **Beacon.**
  - Sent for `none` and `low`; not sent for `medium` or `high`, or for a redacted query.
  - The body has exactly `topic`, `language` and `confidence`, and never the raw query.
  - A rejected `fetch` is swallowed.
  - `HelpSearch` calls it once per submitted search.
- **Outcome helper.** It covers direct, related and fallback, including the staff-contact
  case. `HelpSearch` has no component tests today, so these helper tests are what pin the
  rule it renders. Its markup is otherwise unchanged.
- **Admin.**
  - The report: role guard, response shape, each panel state, and both row actions.
  - The tester: results with and without an open draft, the hidden-draft note, and the
    language switch.
- **Retention step.** `public-uploads` includes `faqSearchGaps`, and a purge failure gives 500.
- **Privacy page.** It contains the new section's text and the 「最後更新：2026年10月」 date.

## Order and gates

Tasks:

1. Migration and database layer, with repository and service methods.
2. Shared sanitiser, browser beacon, public endpoint, and the security-invariant sentence.
3. Admin report endpoint and panel.
4. Shared helpers, the answer tester, and wiring the report's row actions.
5. The retention step in `public-uploads`, and the privacy notice.

After each task, run the full gate:

- `bunx tsc --noEmit`;
- `bun run lint`: 0 errors, with the existing warnings as the baseline;
- `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test`: 0 fail. `bun run test`
  includes `--isolate` on this base.

Never reset or migrate the shared local Supabase stack. The `codex/audit-*` branch name means
no public preview.

## Risks

- **Junk topics.** Anyone can post arbitrary short text, within the rate limit. Staff may see
  nonsense or rude topics in the report. They can ignore them, and topics age out of the
  30-day window. A hide action is a possible follow-up.
- **Residual personal data.** The sanitiser is pattern-based, so a phrasing it misses could
  store a fragment of personal data. That is bounded by:
  - the 80-character cap;
  - no identifiers stored;
  - staff-only access;
  - 90-day deletion;
  - the notice asking visitors not to type personal data.
- **Cross-branch drift.** SP-2's runbook (PR #203) describes `/api/jobs/public-uploads`
  without the new purge step. Whichever of SP-2 and SP-4 merges second updates that runbook
  row.
- **Migration timing.** Merging without first applying the migration only disables the
  report and drops beacons, because of the fail-soft paths. It does not break the public
  site.
