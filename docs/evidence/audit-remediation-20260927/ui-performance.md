# Same-environment public UI and performance comparison

Both builds used the repository read-only synthetic PostgREST fixture `supabase-ci-v1`, browser 148.0.7778.96, the same Windows host, the same Vite/Nitro build command and 390x844 mobile / 1440x900 desktop viewports. Before is production source SHA `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`; after is this worktree with T01/T02 changes (uncommitted at measurement time). Fixture SHA-256: `be308879dc4f4fedea961a021ddc15f7df293e31abf6afea274a7d5bb56b4140`. Public production performance is not inferred from this fixture.

Each score and metric is the median of three Lighthouse cold runs. LCP and TBT are milliseconds. Changes of a few points may be measurement noise; this slice did not intentionally change page layout or load behavior.

| Viewport | Route | Score before → after | LCP ms before → after | TBT ms before → after | CLS before → after |
|---|---|---:|---:|---:|---:|
| 1440x900 | `/` | 99 → 99 (+0) | 753 → 730 | 0 → 2 | 0.0003 → 0.0003 |
| 1440x900 | `/adoption/apply` | 100 → 100 (+0) | 572 → 573 | 0 → 0 | 0.0102 → 0.0102 |
| 1440x900 | `/animals/cat` | 99 → 99 (+0) | 730 → 676 | 0 → 0 | 0.0001 → 0.0001 |
| 1440x900 | `/donate` | 100 → 99 (-1) | 638 → 607 | 0 → 0 | 0.0004 → 0.0004 |
| 390x844 | `/` | 97 → 93 (-4) | 2404 → 2545 | 43 → 60 | 0.0008 → 0.0008 |
| 390x844 | `/adoption/apply` | 99 → 100 (+1) | 1710 → 1650 | 66 → 46 | 0.0176 → 0.0176 |
| 390x844 | `/animals/cat` | 98 → 99 (+1) | 2010 → 1950 | 88 → 89 | 0 → 0 |
| 390x844 | `/donate` | 99 → 99 (+0) | 1967 → 1964 | 39 → 64 | 0.0001 → 0.0001 |

The verifier exited 0 on both builds: 4 routes × 2 viewports × 3 cold runs. Raw Lighthouse JSON and full-page screenshots are in the ignored local `node_modules/.audit-remediation-rehearsal/performance[-before]` folders; all 48 run-level values are in `performance-runs.csv`, with medians in `performance-comparison.csv`.

## UI screenshots

- `ui/before-instructions-mobile.png` and `ui/after-instructions-mobile.png`: identical SHA-256, both GET 200. Desktop instructions pair is also byte-identical.
- `ui/before-donate-mobile.png` and `ui/after-donate-mobile.png`: identical SHA-256, both GET 200. Desktop donation captures differ at byte level; the visual cause has not been established and no improvement is claimed.
- All screenshots use the same synthetic fixture and browser with full-page capture. They do not contain production donor/adopter data.

No production deploy, payment enablement, content publication or email send occurred.


## PR169 preparation — 2026-09-30

PR169 before/after screenshot pairs t23-followup-{before,after}-{390,768,1366}.png: actual response-loss UI; fixed shows saved.12isolated browser cases,Axe0. No before/after performance improvement claimed; one local DDL rehearsal8.59ms only.
## T22 broker UI and SDK evidence, 2026-09-30

Actual page screenshots `ui/t22-broker-after-{390,768,1366}.png` use synthetic HTTP/Auth/Turnstile on loopback56553; keyboard, fresh challenge after failure, wrong/valid code, late actor change and logout pass; Axe0/no overflow/no page errors. `t22-session-browser.json` separately uses the actual application Supabase factory and SDK with real browser Web Locks/localStorage and intercepted Auth transport to prove cross-tab/HTTP-wait fencing and quota behavior; synchronous UI stubs do not prove this invariant. Earlier before screenshots remain historical. No new same-environment Lighthouse before/after or production-performance claim is made for this auth repair. CI fixture performance is a separate release gate. [Full evidence](sequential-merge-156-broker-20260930.md).

## T22 broker/portal final integration, 2026-09-30

Code 9d829324fe639dda8c832c279deac5feee16c5d5 includes reviewed #156 head edd13112. Full3019 pass/96 skip/0 fail/9355 assertions; typecheck/lint/build exit0; actual service-role audit rollback/concurrent preference checks, real two-tab SDK and3width recovery-to-portal UI pass; Axe0. Same-task logout failures remain visible only for the owning session. Independent review clear. #156 exact-head five CI gates green; #157 latest CI requires publication/check. Still22/46 merged. Code-complete=yes; schema-ready=isolated only; deployed=no; operationally-enabled=no. Exact #156 production migration approval pending; #157 preference migration already approved. See sequential-merge-157-20260930.md for commands/environments, screenshots, rollback and not-run gates. This integration manifest has48 entries; no production DDL or ledger mutation occurred.
## T23 dependency continuation, 2026-10-01 HKT

Code7b426c61ab9bfb1085fe5cfad02b83b709d880a5 includes final #157/#156 recovery and portal. T23 source unchanged; routes preserved. Full3024 pass/97 skip/0 fail/9384 assertions; typecheck/lint/build exit0; actual local Auth three-role/API/status checks and3width keyboard/Axe0 task overview pass. Independent review clear. New integrated captures preserve older before/after images. No T23 migration; combined manifest48. Still22/46 merged; exact #156 production schema approval pending; #157 migration already approved. #158 code-complete for overview only, ADMIN-04 partial for later bulk/filter slices; deployed=no, operationally-enabled=no. See sequential-merge-158-20260930.md for exact commands/environments/rollback and not-run gates.
