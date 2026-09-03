# Automated Performance Verification for Public Routes (Phase 4)

**Date:** 2026-09-03
**Status:** Approved in conversation; awaiting written-spec review
**Master plan reference:** `docs/superpowers/plans/2026-08-27-public-layout-integration-v4.md`, Phase 4 ("performance")

## Summary

Adds automated Lighthouse performance verification for a small, representative sample of public routes, run via `playwright-lighthouse` inside the same fixture-backed preview build and Playwright infrastructure the existing `verify-public-brand.mjs` script already uses for brand and a11y checks. This is one of seven independent items scoped under "Phase 4: Non-functional" in the master plan (RLS matrix, bilingual, and a11y are done — [YNWAforever/hkscda#102](https://github.com/YNWAforever/hkscda/pull/102), PR #98, [YNWAforever/hkscda#103](https://github.com/YNWAforever/hkscda/pull/103); payment sandbox is explicitly deferred pending credentials; backup drill and owner UAT are separate, not-yet-started items).

## Current state

- Zero performance tooling exists in this repo today: no Lighthouse CI, no bundle analyzer, no web-vitals tracking (confirmed by grepping `package.json`).
- `vite.config.ts` is minimal — almost all build behavior comes from a shared preset (`@lovable.dev/vite-tanstack-config`), so there is little existing build configuration to build on or be constrained by.
- `scripts/verify-public-brand.mjs` already has the exact infrastructure this work needs: a fixture-backed build (`scripts/ci/supabase-fixture.mjs`), a Nitro preview server, and Playwright driving a route list — and already has two prior extensions (`brand`, `a11y`) via its `mode` variable, an established pattern for adding a new check category without duplicating the build/fixture/preview scaffolding.
- The original master plan's WP-1 done-criteria named a 3-route Lighthouse sample (`/`, `/animals/cat`, `/adoption/apply`) for an a11y-score check — a11y ended up using axe-core across all routes instead (see the a11y design spec's "Approved decisions"), leaving that original Lighthouse-based route sample unused. This design reuses that same 3-route set for the performance score check it was originally intended for, plus `/donate` (the core conversion page for a donation-funded nonprofit).
- Lighthouse's composite performance score is well-documented as noisy in shared/virtualized CI environments — the same page can score meaningfully differently between runs due to inconsistent CPU throttling calibration on shared runners, unlike axe-core's deterministic DOM-rule violations. This is a real constraint on how tightly any CI gate here can reasonably be set, independent of anything about this specific codebase.

## Approved decisions

- **`playwright-lighthouse`, not the standalone `lighthouse` CLI or `@lhci/cli`.** It runs a Lighthouse audit directly inside an existing Playwright `page`/browser context, so it reuses the exact same fixture-backed build, preview server, and browser launch this script already has for `brand`/`a11y` modes — no second Chrome instance, no separate CI infrastructure to stand up and keep in sync.
- **Extend the existing `verify-public-brand.mjs` script with a third mode, `performance`**, following the same pattern `a11y` used: a new assertion function called from the existing per-route loop, gated on `mode === "performance"`, running only at the single desktop viewport (matching `a11y` mode's existing viewport-skip approach) and skipping the reflow/reduced-motion checks that are brand-specific.
- **Small representative sample: `/`, `/animals/cat`, `/adoption/apply`, `/donate`** (4 routes) — not the full 26+-route list `brand`/`a11y` modes use. Lighthouse audits are far heavier per-page than axe-core's DOM analysis (each involves multiple simulated page loads under throttling), so a full-route sweep would make CI duration much longer and multiply the CI-noise surface for comparatively little benefit — the goal is catching regressions on the highest-traffic, highest-stakes pages, not exhaustively auditing every synthetic state route.
- **New non-blocking CI job, `performance-verify`**, mirroring `a11y-verify`'s exact structure (checkout → setup-bun → build against fixture → install Chromium → start fixture + preview server → wait for readiness → run the verifier), invoking a new `bun run verify:performance` script. `needs: verify`, `continue-on-error: true` — matching the established non-blocking-first precedent used for every prior Phase 4 CI addition this cycle (`rls-matrix`, `a11y-verify`). Promoting `performance-verify` to required is an explicit, separate follow-up, not part of this work.
- **Performance-score floor set from a real baseline scan, deliberately conservative given CI noise** — rather than assume a target number, the actual score for each of the 4 routes will be measured against the live app during plan-writing (mirroring the RLS/a11y precedent of investigating real state before writing plan content), and the floor set low enough to catch genuine regressions without generating false-positive noise from normal CI-environment score variance. See "Known baseline" below, filled in once measured.
- **Checked once per route** (no viewport/throttling-profile matrix) — Lighthouse's own simulated-throttling model already approximates a mobile network/CPU profile by default; running multiple additional configurations per route would multiply CI duration and noise surface for a check that's explicitly scoped as a coarse regression floor, not a detailed performance audit.

## Architecture

```mermaid
flowchart TD
    A["bun run build (against Supabase fixture)"] --> B["bun run preview (Nitro server)"]
    B --> C["bun run verify:performance\n(scripts/verify-public-brand.mjs, MODE=performance)"]
    C --> D["For each of 4 routes:\nplaywrightLighthouse audit via existing Playwright page"]
    D --> E{"Performance score below floor?"}
    E -->|"yes"| F["Push to failures[], job exits non-zero\n(continue-on-error: true keeps it non-blocking)"]
    E -->|"no"| G["Log the actual score, continue"]

    H["CI: performance-verify job (new, continue-on-error, needs: verify)"] --> A
```

## Test harness structure

**Modified file: `scripts/verify-public-brand.mjs`**
- New dependency: `playwright-lighthouse` (devDependency).
- A new, small route list constant (e.g. `performanceRoutes = ["/", "/animals/cat", "/adoption/apply", "/donate"]`), separate from the existing `staticRoutes`/`detailRoutes`/`stateRoutes` used by `brand`/`a11y` modes — `performance` mode iterates this smaller list instead of the full `routes` array the other two modes use.
- A new function (name TBD at plan-writing time, following this file's existing `assert*` naming convention) that runs a `playwrightLighthouse` audit against the current page and records a failure if the performance category score falls below the floor.
- Gated the same way `a11y` mode is: skipped for the 4 non-desktop viewports, and skips the brand-specific reflow/reduced-motion checks.

**New script in `package.json`:** `"verify:performance": "MODE=performance node scripts/verify-public-brand.mjs"` (matching `verify:a11y`'s corrected pattern of setting `MODE` inline in the script command itself, not relying on a CI-only env var).

**New CI job in `.github/workflows/ci.yml`:** `performance-verify`, structurally identical to `a11y-verify` (including its artifact-upload-on-failure step), but running `bun run verify:performance` with `OUTPUT_DIR: artifacts/performance-ci`.

## Error handling

- A route that fails to load is already recorded as a failure by the existing `gotoRoute`/error-handling logic — the performance check only runs `playwrightLighthouse` on routes that already loaded successfully, consistent with how `a11y` mode's `assertNoSeriousA11yViolations` is structured.
- If the Lighthouse audit itself throws (e.g., a page that never reaches a stable network-idle state within Lighthouse's own timeout), that's caught by the same try/catch already wrapping each route's checks in the existing loop.

## Testing

This spec's own deliverable is a verification tool, so "testing" means confirming the tool itself is trustworthy:
- Manually verify `bun run verify:performance` actually runs a real Lighthouse audit against a local preview build for all 4 routes and produces a real score, not a stub/mocked value.
- Manually verify `bun run verify:brand` and `bun run verify:a11y` are both completely unaffected — same routes, same assertions, same pass/fail outcome as before this change.
- CI run: confirm the new `performance-verify` job actually starts the fixture + preview server and runs a real Lighthouse audit successfully in GitHub Actions' `ubuntu-latest` runner, before considering this shippable (even though the job itself is non-blocking).

## Known baseline

Measured against a real preview build (fixture-backed Supabase, matching `brand-verify`'s exact setup — this branch predates the `a11y-verify` job merging into `main`, so `brand-verify` is the current reference template), desktop viewport (1440×900), two independent runs per route for stability:

| Route | Run 1 | Run 2 |
|---|---|---|
| `/` | 71 | 72 |
| `/animals/cat` | 85 | 85 |
| `/adoption/apply` | 89 | 89 |
| `/donate` | 85 | 86 |

All four routes score below 90; `/` is notably lower than the other three (~15 points behind).

**Root cause (consistent across all 4 routes):** Total Blocking Time and Cumulative Layout Shift — the two heaviest-weighted metrics — score near-perfect everywhere (0.93-1.0). The entire deficit comes from paint/network-timing metrics (`largest-contentful-paint`, `first-contentful-paint`, `speed-index`), driven by:
- **No cache-control headers on static assets** (`cache-insight`, score 0): 1.39-1.74 MiB/route of avoidable re-fetching, worst on `/` (1,744 KiB).
- **Unoptimized image delivery** (`image-delivery-insight`, score 0): 49-386 KiB/route; `/`'s homepage hero imagery is by far the worst offender (386 KiB vs ~50-56 KiB on other routes) — directly explains why `/`'s LCP (0.24, 3.5s) is so much worse than the other three routes' (0.69-0.80, 1.5-1.8s).
- **Render-blocking resources** (`render-blocking-insight`, score 0): 300-460ms of avoidable delay before LCP, every route.
- **Oversized JS shipped regardless of whether the page needs it** (`unused-javascript`, score 0.5): 145-155 KiB/route of unused JS. The `bun run build` output during this scan showed several large vendor chunks (`pdf-lib__fontkit.mjs` 1.14 MB, `router-*.mjs` 1.07 MB, `stripe.mjs` 655 KB) that are almost certainly not needed on every public page that currently pulls them in.

**Decision on remediation scope (2026-09-03):** given these are systemic, cross-cutting issues (server/CDN cache configuration, code-splitting the JS bundle graph, image pipeline changes) rather than a single isolated bug, and given the remaining Phase 4 time budget covers several more items, this pass adds ONLY the CI gate — none of the above is fixed as part of this work. The floor is set to **50**, comfortably below the current lowest real score (71), so it catches a genuine future regression (e.g., a broken build shipping drastically more unoptimized assets) without generating false-positive noise from normal CI-environment score variance or from these already-known, not-yet-fixed issues. All four findings above (cache headers, image delivery, render-blocking resources, oversized JS bundles) are explicit, itemized follow-up work — not part of this spec's deliverable.

## Out of scope

- **All remediation of the real findings in "Known baseline" above** — cache-control headers, image delivery optimization, eliminating render-blocking resources, and splitting oversized JS bundles (Stripe/pdf-lib/fontkit) out of routes that don't need them. Each is real, itemized follow-up work, explicitly deferred per the 2026-09-03 remediation-scope decision — this spec's deliverable is the CI gate only.
- Promoting `performance-verify` to a required branch-protection check — follow-up once proven green (i.e., not flaky) repeatedly, matching the `brand-verify`/`rls-matrix`/`a11y-verify` precedent.
- Full-route Lighthouse coverage (all 26+ public routes) — an explicit, separate follow-up if the 4-route sample proves valuable and CI duration/noise allows expanding it later.
- The other remaining Phase 4 items (backup drill, owner UAT) — each is an independent follow-up. Payment sandbox remains explicitly deferred pending credentials.
