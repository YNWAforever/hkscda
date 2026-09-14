# Implementation and acceptance coverage

Status: implemented local release candidate; final public gates and scoped commits are recorded in `verification.md`. No staging or production verification is claimed.

The initial fetched main matched audit `9e2b0f4`. A final fetch found upstream `33b1583` (PR124, Story & Promotion publishing); the private branch was rebased onto it. The overlapping editor change retains both upstream notification notices and the new editorial panel. All other tracked implementation files were checked against their pre-rebase normalized hashes. The six admin domains remain unchanged. The unrelated production-repair note was excluded.

| Phase / audit finding | Implemented change | Evidence | Remaining dependency |
|---|---|---|---|
| A: missing directory/legacy migration | Preserve and apply existing repairs in the rehearsal; no duplicate migration | `migration-rehearsal.json`: older missing directory and 42702 reproduced; fresh/upgrade109 pass; zero-booking profile found; RPC grants correct | Approved production ledger inspection/migration and smoke checks |
| A: app/DB mismatch | Read-only release CLI checks migration ledger and volunteer/editorial capabilities/grants | `compatibility-cli.json`: older exit1 with explicit blockers, candidate exit0 | Run against the specifically approved release target |
| A: error contract and wasted collapsed reads | Shared localized action errors, status normalization, redacted timing/errors; defer legacy panel | Unit/HTTP tests; `reliability-browser.json`: zero reads before expansion, one after; five keystrokes cause one source resolution | Production observation window |
| B: policyless create/clone | Audited idempotent drafts; target-date generation/copy; effective-policy rebind preview; legacy clone directs supported flow | Bulk DB and real draft→preview→apply browser journey | Publish only resolved client policies |
| B: cancellation/waitlist/terms | Configured boundaries, all five waitlist reasons and configured FIFO, owner consent in same reschedule transaction | `member-booking-verification.md`; real DB178 assertions and browser booking→cross-terms move→cancel | Client operating choices remain explicit |
| B: history/attendance/public signup | Server-filtered sessions, independent future/history pages, end-time action guards, earlier schedule/registration entry points | 101 history/public records; member browser mobile/non-HK timezone; completed-before-end denial | None for implemented code |
| C: daily workspace | 25-row table/calendar, HK date range/search/scope/readiness/shortage, exact selections, accessible drawer with paginated roster/history | `bulk/browser.json`, screenshots,52history/page3 fixture | None for implemented code |
| C: safe batch maintenance | Generate/copy/edit/rebind/close/cancel/attendance with preview, exact actor/input/revisions, <=100 same-day groups, retained locks and current-policy validation | Four-week generation;130 exact matches excludes131st; >100same-day rejection; late page; audit/outbox fault rollback; lost-response retry | Staff review each explicit group; unapplied groups remain resumable |
| C: shared invariants and changed actor | No capacity eviction or policy override; execution rechecks active verified actor | `bulk/mandatory-scenarios.md`: capacity10 race, active role downgrade,104 policy-bound sessions and cross-shelter daily5 race; existing T−48/group tests pass | No production fixture activation |
| C: progress and notifications | Persistent operation URL/status; exact outbox task state and immutable completion/provider evidence; independent business/delivery status | Bulk88 assertions incl pending→completed without provider delivery; history pagination | Provider delivery is not implied by queue/task completion |
| D: animal preview/publication races | Authoritative initial hydration, saved-revision visual preview, dirty guard, stale server check, retained referenced private media | Quality delayed-read and image→reopen→text edit→republish browser regressions; real publication tests | Source/content approval for production |
| D: incomplete/bloated lists | Bounded summaries and server paging for animals/supporters/CMS/references/internships/audit; missing-photo filter |1001 animals,26 supporters,51 CMS references,501 internships,>50 audit; browser document51 selection persists | Dedicated image-resizing pipeline not introduced |
| D: content authenticity/CMS/copy | Explicit per-revision source review, demo/needs-review blocking, approved same-actor publish; new type-specific drafts and corrected labels | Quality verified/banned actor denial and retry tests; CMS create/review browser; `demo-content-review.md` | Concrete approval before classifying or quarantining production items |
| D: keyboard/admin coverage | Native sponsorship buttons/focus return; mobile drawer controls; unchanged six navigation domains | Sponsorship Enter/Space/Escape browser; `admin-route-inventory.json` inventories48 actual route files, not48 claimed workflows | Unchanged modules are not relabelled as newly tested journeys |
| E: measured performance | Policy snapshot summary, bounded calendar/list payloads, debounce/deferred reads, immutable terms reuse and slower ordinary polling | `performance.md` and raw JSON; measured read while mutation lock held; query plan; preview/apply separate samples | No production speedup or hosting-region assertion |
| Release/recovery | Additive ordered migrations, compatibility gate, local backup/restore preserving facts and grants, staff instructions and ready PR text |109migration clean/upgrade and local restore; `release-runbook.md` | Explicit approval before public push/preview, main merge, production SQL/migrations/deploy |

## Review findings resolved

Independent review led to fixes for initial animal draft hydration, retaining media still referenced by a draft, actual bulk follow-up evidence and separate history pagination. Browser verification found and corrected SQL detail alias ambiguity. Exact mandatory capacity/role/global-day fixtures were added rather than claiming generic races proved those literal examples.

## Guides

- Month generation/edit/close/cancel/attendance: `bulk/staff-guide.zh-HK.md`.
- Member booking and reschedule: `member-booking-guide.md`.
- Animal/CMS review and publication: `quality-release.md`.
- Unresolved operating choices: `bulk/operations-decisions.md`.
- Source-review candidates: `demo-content-review.md` (not a production cleanup authorization).
- Release/rollback and smoke checks: `release-runbook.md`.
- Ready-to-post PR body: `review-description.md`.
