# Layout programme branch stack

Every branch is one work package and is named for its own contents. The layout
packages genuinely depend on each other, so they form a stack: each PR takes the
branch above it as its base, and its diff shows only its own change.

## Independent of the stack

Branches off `main` that can be reviewed and merged on their own, in any order.

| Branch | Contents |
|---|---|
| `fix/admin-access-coverage-windows-paths` | Normalises Bun.Glob output so the admin access sweep passes on Windows. Pre-existing on main; unrelated to PR #60. |

## The stack, in dependency order

| # | Branch | Base | What it contains |
|---|---|---|---|
| 1 | `fix/pr60-ci-green` | `main` | Makes PR #60 actually pass its own gate: regenerated route tree, the missing genderFilter call site, the stale donate assertion, prettier, LF line endings, and the malformed-id 404. |
| 2 | `feat/layout-wp1-tokens-shell` | #1 | WP-1. The hkscdagpt design system ported and scoped under .site-shell, the header, footer and five-group nav IA, and Noto Sans HK self-hosted. |
| 3 | `feat/layout-wp2-home` | #2 | WP-2. The home page rebuilt from the seven design-source modules, server-rendered. |
| 4 | `feat/layout-wp3-animals` | #3 | WP-3. Both animal listings move off browser queries onto an SSR loader (G-01, G-02). |
| 5 | `feat/layout-wp4-content-truth` | #4 | WP-4 to WP-6 groundwork: the shared page frame, plus the two pages that were publishing false facts (G-04, G-09). |
| 6 | `docs/layout-wp7-parity` | #5 | WP-7. The route parity record, generated from the tree rather than written by hand. |
| 7 | `feat/layout-wp5-support-ssr` | #6 | WP-5/6. The last two browser-query routes move to loaders; CCCP and TNR reframed. |
| 8 | `fix/layout-windows-glob` | #7 | The Windows glob fix again, so the stack is self-contained. Drop this commit if the independent branch above lands first. |
| 9 | `fix/layout-seo-shadowing` | #8 | G-21. Static robots.txt and sitemap.xml were shadowing the dynamic routes on Vercel; D-8 disallow restored before the files were removed. |
| 10 | `fix/layout-wp0e-loader-resilience` | #9 | WP-0e. Four loaders returned 500 with Supabase unreachable; they now degrade at 200 (G-17). |
| 11 | `ci/layout-wp0f-brand-verify` | #10 | WP-0f. PostgREST-shaped CI fixture and a separate brand-verify job, so the sweep reports on brand rather than connectivity. |
| 12 | `fix/layout-wp0ab-guard-and-origin` | #11 | WP-0a/0b. The mojibake copy guard repaired, and every rendered origin routed through one constant (G-19, G-20). |
| 13 | `chore/layout-wp0-completion` | #12 | Remaining WP-0 items: route-tree parity CI step, vercel.json branch exclusions, env contract, robots /api/. |
| 14 | `feat/layout-wp1-bp5-hardening` | #13 | BP-5 CSP enforcing with the Turnstile gap closed, plus the WP-1 remnants and the shell isolation proof. |
| 15 | `feat/layout-wp6-content-reframe` | #14 | WP-6 completion: knowledge, the annual report, about, privacy, help and the story hub reframed onto the shared page frame; three status pages, the instructions page, donate and volunteer had English-only or restated-inline content fixed. |

## Caveats a reviewer should know

- **Order does not match the plan.** WP-1 through WP-7 were built before the WP-0
  packages, so the stack carries them in that order. Each branch is still green on
  its own, but if WP-0 must land first the stack needs reordering before merge.
- **The stack sits on PR #60.** Branch 1 starts from PR #60's head rather than
  harvesting it into small PRs as the plan prefers. Closing PR #60 without landing
  branch 1 would drop work the rest of the stack depends on.
- **Nothing has run in CI.** GitHub Actions is blocked on account billing, so every
  green result recorded here is from local runs.
