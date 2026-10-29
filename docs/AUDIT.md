# Admin panel audit — Phase 0 (understand)

Date: 2026-10-29. Base: `0e59983` (`main`, #225). Scope: stabilise the admin
back office and add regression tests. Phase 0 changes no code.

## Assumptions

- **Branch.** The brief names `fix/admin-audit`, but this session is bound to
  `claude/sharp-thompson-th7bcl`. All work happens there; nothing is pushed to `main`.
- **Test runner.** The brief says "add Vitest + Playwright if none exists". The repo
  already has a runner (`bun:test`, ~5,480 tests) and Playwright browser tests
  (`src/lib/admin/*.browser.test.ts`), so new tests use them. CLAUDE.md requires tests
  to sit beside their source (`*.test.ts`). Cross-cutting suites the brief places in
  `tests/unit|integration|e2e/admin` go there; bug regressions sit beside the code they fix.
- **CI.** `.github/workflows/ci.yml` already runs typecheck → test → lint → build on
  every PR. Phase 4 extends that job rather than adding a second workflow.
- **Prior audits.** `docs/audits/2026-10-25-full-audit.md` (AUD-01…12) and
  `docs/audits/2026-10-28-brief-a-p0.md` are inputs. Their open items are not re-filed
  as new findings unless admin behaviour is involved.

## Stack summary

| Concern        | Choice                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Language       | TypeScript 5.8, strict                                                                    |
| Framework      | TanStack Start 1.168 (SSR React 19, TanStack Router 1.170, Vite 7, Nitro 3 beta)          |
| Data           | Supabase Postgres via `@supabase/supabase-js`; no ORM. 203 migrations, RLS on all tables  |
| Server data    | Service-role client (`*.server.ts`) behind admin API routes; RPCs for atomic writes+audit |
| Client data    | TanStack Query; admin browser code calls `/api/admin/**` only (guard test enforces this)  |
| Auth           | Supabase Auth email + password (`signInWithPassword`), session in browser web storage     |
| API auth       | `Authorization: Bearer <JWT>` → `auth.getUser` → `admin_user` row → role allow-list       |
| Roles          | `staff`, `treasurer`, `admin`; status `pending` / `active` / `disabled`                   |
| Validation     | zod 3 at service boundaries                                                               |
| Abuse controls | Upstash rate limit + Cloudflare Turnstile on public forms (not on admin APIs)             |
| Hosting        | Vercel, Nitro `vercel` preset; crons in `vercel.json`                                     |
| Tooling        | Bun (pinned 1.3.14), `bun:test`, ESLint 9, Prettier, Playwright 1.60 for browser tests    |

Layering (from CLAUDE.md): `route.ts` → `-handlers.ts` → `lib/<domain>/http.server.ts`
→ `service.ts` → `repository.server.ts`. Handler factories take `requireAdmin` and the
service as injected dependencies, so authorization and HTTP shapes are testable without
a database.

Middleware: one global request middleware (`src/start.ts`) catches unhandled errors and
returns a generic HTML 500 page without stack traces. There is no route middleware for
auth. Each admin API route calls `requireAdmin` itself or through its handler factory.
Each admin page calls `requireAdminPageAccess` in `beforeLoad` itself or through its
layout; `adminAccessCoverage.test.ts` enforces the page side.

## Admin feature map

### Pages (51 under `src/routes/admin/`)

| Area (access key)                                               | Pages                                                                                                                                                                                       | Roles                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Unauthenticated                                                 | `login`, `reset-password`, `access-denied`                                                                                                                                                  | any                                                   |
| Dashboard / task overview (`taskOverview`)                      | `index` (sections cat/dog/sponsor/applications/payments/…), `tasks`                                                                                                                         | all                                                   |
| Animals (`animals`)                                             | `animals/new`, `animals/$id.edit`                                                                                                                                                           | staff, admin                                          |
| Adoption cases (`adoptionCases`)                                | `applications`, `applications/index`, `applications/$id`                                                                                                                                    | staff, admin                                          |
| Coordinator (`manualIntake`, `coordinator*`, `adopters`)        | `coordinator/{inbox,intake,tasks,adopters,adopters/$id,animals,reports,statuses}`                                                                                                           | staff, admin (statuses: admin)                        |
| Content (`contentManagement`)                                   | `content`, `content/{$id,new,about,adoption,adoption-guides,adoption-preview,annual-reports,documents,knowledge}`                                                                           | staff, admin                                          |
| FAQ (`faqManagement`)                                           | `faq`                                                                                                                                                                                       | staff, admin                                          |
| Governance (`governanceManagement`)                             | `governance`                                                                                                                                                                                | admin                                                 |
| Payments (`payments`)                                           | `payment-methods` (+ dashboard payments section)                                                                                                                                            | all                                                   |
| Supporters / CRM (`supporters`)                                 | `supporters`, `supporters/$id`                                                                                                                                                              | treasurer, admin                                      |
| Sponsorships (`sponsorshipRead/Finance/Review`)                 | `sponsorships`                                                                                                                                                                              | all (finance: treasurer, admin; review: staff, admin) |
| Volunteers (`volunteerManagement`, `volunteerPolicyManagement`) | `volunteers`, `volunteers/{activities,assessments,calendar,daily-settings,group-enquiries,operations,people,people/$id,qualifications,registrations/$id,settings,simulation,sources,tasks}` | staff, admin (policy: admin)                          |
| Internships (`internshipManagement`)                            | `internships`                                                                                                                                                                               | staff, admin                                          |
| Access management (`accessManagement`)                          | `access`                                                                                                                                                                                    | admin                                                 |

Role matrix source: `src/lib/admin/access.ts` (`ROLE_ACCESS`, `NAV_ITEM_AREAS`).

### Admin API (162 route files under `src/routes/api/admin/`)

| Domain                                                                               | Files | Notes                                                                                                     |
| ------------------------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------- |
| `me`                                                                                 |     1 | Identity for the browser; activates pending invites                                                       |
| `access/*`                                                                           |     5 | Users, invites, invite resend, audit log — admin only                                                     |
| `adoptions/*`                                                                        |    31 | Cases, matches, follow-ups, finalize, intake, tasks, statuses, positions, CSV exports, application photos |
| `animals/*`                                                                          |     6 | List, archive, publication, signed photo upload URLs, bulk review                                         |
| `content*`, `content/*`                                                              |    21 | CMS items, revisions/restore, publish/archive, media upload/finalize, social copy, links                  |
| `adoption-guide-releases/*`, `adoption-instructions/*`, `adoption-information`       |    13 | Draft → submit → publish → withdraw workflows                                                             |
| `documents/*`, `annual-reports/*`, `about-pages`, `knowledge`, `governance`, `faq/*` |    12 | Content-type CRUD + publish; document upload targets                                                      |
| `payments*`, `receipts*`, `donations/*`, `finance/*`, `payment-methods/*`            |    16 | Reconcile, void receipt, manual gift, delivery retry, bank statement preview, payment-method lifecycle    |
| `exports/*`                                                                          |     6 | Donations / payments / supporters CSV, async export jobs + download                                       |
| `supporters*`                                                                        |     7 | CRM list/detail, consents, tags, bulk assignment, format preview                                          |
| `sponsorships/*`                                                                     |    15 | Pledges, review, finance, cancel, assignments, proof upload/URL, reminders, follow-ups                    |
| `volunteers/*`                                                                       |    24 | Activities, registrations, attendance, bulk, settings, sources, simulation, jobs/retry                    |
| `internships`, `task-overview`, `media-repairs`, `content-review`                    |     4 |                                                                                                           |

Role allow-lists passed to `requireAdmin` across server code: `["staff","admin"]` ×37,
`["treasurer","admin"]` ×22, `["admin"]` ×16, all three roles ×8, plus a few computed
lists. 82 route files call `requireAdmin` directly; the other 80 get it from a shared
handler module. A static grep cannot prove those 80 are gated, so Phase 2 adds a test
that calls every admin route handler anonymously and expects 401.

### Other server entry points (context)

Public APIs (adoption applications + photo upload URLs, donations, sponsorship pledges +
proof upload, volunteer registrations, supporter portal, stories, help search-gap,
internships, CSP report), webhooks (Stripe, PayPal, COD/AlipayHK, Resend), and
`CRON_SECRET`-guarded jobs (`/api/jobs/*`, `/api/internal/readiness`).

## Existing safeguards (do not duplicate)

Guard tests already enforce: page-level role gates (`adminAccessCoverage`), no direct
table access from admin browser code (`adminBrowserDataGuard`), audit pairing for
service-role mutations (`adminRouteAuditing`), bilingual admin copy (`adminCopyGuard`),
LoadFailure / ConfirmActionDialog / StatusBadge / formatter usage (`admin*Guard`),
required reasons for financial and irreversible actions (`requiredReasonGuard`),
`search_path` pinning and RLS in migrations (`supabaseMigrations`), and security headers.

## Risks (initial, to be confirmed in Phase 1)

| #   | Area         | Risk                                                                                                                                                                                                                          |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | AuthZ        | 80 admin routes delegate `requireAdmin` to shared handlers; one missing call would expose service-role data. Covered only by convention today.                                                                                |
| R2  | AuthZ        | API role lists and the `ROLE_ACCESS` matrix are maintained separately. A route can allow a role its page denies, or the reverse, with no test catching it.                                                                    |
| R3  | AuthZ / RLS  | AUD-02 (open): staff may read/update supporter and consent rows through RLS while the CRM API restricts them to treasurer/admin. Fixing it needs a migration, so I'll ask before changing anything.                           |
| R4  | Session      | Admin JWT lives in browser web storage. With no cookies, cookie-based CSRF does not apply, but any XSS can steal the token, and the CSP allows `script-src 'unsafe-inline'`.                                                  |
| R5  | Auth         | Login brute force relies only on Supabase Auth's built-in limits; admin APIs have no app-level rate limit. Disabled admins keep a valid JWT until it expires, but `requireAdmin` re-checks `admin_user.status` on every call. |
| R6  | Errors       | `requireAdmin` rethrows raw PostgREST errors (`throw adminError`). Need to confirm the global middleware and handlers return no internals in the response.                                                                    |
| R7  | IDOR         | Records are addressed by UUID in the path. Roles are org-wide (no per-record scope), so IDOR means role-boundary crossings, e.g. a treasurer reaching staff-only records through a shared endpoint.                           |
| R8  | Uploads      | Signed upload URLs (animals, content media, documents, application photos, sponsorship proof). Need to confirm MIME/size are enforced server-side, not only in the browser.                                                   |
| R9  | Concurrency  | Some writes use revision checks (animal drafts, A-02). Need to check other admin editors for lost updates and double submits.                                                                                                 |
| R10 | Locale       | HKT dates: confirm admin date filters and CSV exports use `Asia/Hong_Kong`, not the server's UTC.                                                                                                                             |
| R11 | Dependencies | AUD-05 (open): high-severity advisories in the lockfile (see baseline below).                                                                                                                                                 |
| R12 | CI           | AUD-04 (open): the RLS/transaction job is `continue-on-error`, so those regressions do not block PRs.                                                                                                                         |

## Baseline (before any change)

Environment: Linux container, Bun **1.4.4** (repo pins **1.3.14** in `.bun-version`;
the pinned version is not installed here), Node 24, no Supabase stack running, tests
run with `SUPABASE_LOCAL_URL=http://127.0.0.1:1` (unit-only, as CLAUDE.md instructs).

| Gate                                    | Result     | Notes                                                                                                            |
| --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`         | ✅ pass    |                                                                                                                  |
| `bunx tsc --noEmit`                     | ✅ pass    | 0 errors                                                                                                         |
| `bun run lint`                          | ✅ pass    | 0 errors                                                                                                         |
| `bun run test` (unit-only)              | ⚠️ 28 fail | 8,182 tests / 854 files: 7,426 pass, 728 skip, 28 fail, 80.5 s                                                   |
| `bun run build`                         | ✅ pass    | Chunk-size warning, plus "does not export a Route" warnings for `*.test.ts*` files under `src/routes` (expected) |
| `git diff routeTree.gen.ts` after build | ✅ clean   |                                                                                                                  |
| Client bundle secret scan               | ✅ clean   | `.vercel/output/static` has 0 matches for server secret names or `sk_live_` / `sk_test_` prefixes                |
| `bun audit`                             | ❌ 41      | 23 high, 14 moderate, 4 low                                                                                      |

**Test failures are environmental, not code defects.** All 28 are in the 12
`src/lib/admin/*.browser.test.ts` files. Each launches Playwright with the `chrome`
channel, which looks for Google Chrome at `/opt/google/chrome/chrome`; this container
only has Playwright's Chromium (`/opt/pw-browsers/chromium-1243`). Every failure logs
`Chromium distribution 'chrome' is not found`. After symlinking that path to the
bundled Chromium (container only, no repo change), all 12 files ran: **28 pass,
0 fail**. The README already lists Chrome as a prerequisite. On CI the `verify` job does
not install Chrome; it presumably passes because GitHub's `ubuntu-latest` image ships
Chrome. Phase 4 should either add a Chrome install step or make the harness fall back to
Playwright's Chromium, so the dependency is explicit.

The 728 skips are database/RLS suites that need opt-in env vars and a local Supabase
stack (AUD-03). They establish nothing about database behaviour.

**Dependency advisories** (packages flagged): `@babel/core`, `baseline-browser-mapping`,
`brace-expansion`, `browserslist`, `esbuild`, `js-yaml`, `nanoid`, `postcss`,
`postcss-selector-parser`, `seroval`, `source-map-js`, `vite` 7.3.2, `zod` 3.25.76 / 4.6.5,
`launch-editor`. Most are build/dev tooling. The runtime-relevant ones are **zod**
(memory exhaustion on oversized constrained collections, fixed in 4.6.6, so the direct
`zod@3` dependency needs a major upgrade, which needs approval) and **seroval** (TanStack
SSR serialisation). Phase 1 triages reachability; in-range patch bumps are low risk.
Major upgrades need approval first.

**Toolchain drift:** local Bun 1.4.4 vs pinned 1.3.14; local Node 22.22 vs required 24.
Both gates passed regardless. Phase 4 re-runs the final verification under the same caveat.

## Phase 1 plan

1. Runtime authorization sweep: load every `src/routes/api/admin/**` handler and call each
   method with (a) no token, (b) an invalid token, (c) each role, against a fake Supabase
   client. Expect 401 / 401 / 403-or-allowed, matching `ROLE_ACCESS`. This settles R1 and R2.
2. Per-domain review of the admin handlers and pages against the brief's checklist
   (validation, double submit, stale data, uploads, error leakage, HKT dates, pagination),
   prioritising money (payments, receipts, manual gifts, sponsorship finance), access
   management, and CRM.
3. Dependency reachability triage (R11) and a review of uploads (R8).

Findings go to `docs/BUGS.md` with ID, severity, file:line, repro, expected vs actual,
and proposed fix.
