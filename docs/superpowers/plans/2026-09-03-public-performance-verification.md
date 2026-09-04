# Automated Performance Verification for Public Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-blocking CI check that runs a real Lighthouse performance audit against 4 key public routes, gated on a conservative score floor (50) calibrated from the real, measured baseline (71-89).

**Architecture:** Extend `scripts/verify-public-brand.mjs` (which already builds the app against a Supabase fixture, starts the Nitro preview server, and drives Playwright) with a third mode, `performance`, using `playwright-lighthouse` to run a real Lighthouse audit inside the same Playwright browser/page already used for the `brand` mode. A new `verify:performance` npm script and a new non-blocking `performance-verify` CI job invoke it.

**Tech Stack:** Playwright (existing dependency), `playwright-lighthouse` (new devDependency), Bun, GitHub Actions.

---

## Important: this branch predates the a11y-verify CI job

This branch (`feat/public-performance-verification`) was created from `origin/main` before the a11y verification PR ([YNWAforever/hkscda#103](https://github.com/YNWAforever/hkscda/pull/103)) merged, so `scripts/verify-public-brand.mjs` in this branch does NOT yet have `mode === "a11y"` logic, an `isDesktop` viewport flag, or any a11y-related code — it is the original, brand-only version. This plan's tasks are written against that actual current state, using `brand-verify` (not `a11y-verify`, which doesn't exist here) as the CI job template. If PR #103 merges into `main` before this branch does, whoever merges second will need to resolve a normal, low-risk merge conflict on `scripts/verify-public-brand.mjs` and `.github/workflows/ci.yml` (each branch adds its own `mode === "x"` gates to the same shared loop) — this is the same situation the RLS matrix and a11y branches already navigated this session with `brand-verify`'s required-check promotion.

## Verified current state (do not re-derive)

- `scripts/verify-public-brand.mjs`'s route-iteration loop, browser launch, and final reporting are exactly as read at plan-writing time (see exact line references in each task below).
- A real Lighthouse scan (fixture-backed preview build, desktop viewport 1440×900) measured: `/` = 71-72, `/animals/cat` = 85, `/adoption/apply` = 89, `/donate` = 85-86. Full root-cause detail is in `docs/superpowers/specs/2026-09-03-public-performance-verification-design.md`'s "Known baseline" section. The floor is set to **50** — comfortably below the lowest real score, per the approved remediation-scope decision (gate only, no fixes in this pass).
- `.github/workflows/ci.yml`'s `brand-verify` job no longer has `continue-on-error` (promoted to required earlier this session) — the new `performance-verify` job sets its own `continue-on-error: true` independently, since it's a new, unproven check regardless of `brand-verify`'s current status.

---

## File Structure

**Modify:**
- `package.json` — add `playwright-lighthouse` devDependency, add `"verify:performance"` script.
- `scripts/verify-public-brand.mjs` — add `playAudit` import, a `performance` mode with its own small route list, a conditional remote-debugging-port on the browser launch, an `assertPerformanceFloor` function, and gate the existing reflow/reduced-motion calls to `brand` mode only.
- `.github/workflows/ci.yml` — add the new `performance-verify` job.
- `.gitignore` — add an entry for `artifacts/performance-ci*/`.

---

### Task 1: Add the Lighthouse performance check to the verifier script

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-public-brand.mjs`

- [ ] **Step 1: Add the `playwright-lighthouse` devDependency**

```bash
bun add -D playwright-lighthouse
```

Expected: `package.json`'s `devDependencies` gains `"playwright-lighthouse": "^4.x.x"` (this pulls in `lighthouse` as a resolved dependency automatically), and the lockfile updates.

- [ ] **Step 2: Add the `verify:performance` script**

In `package.json`'s `"scripts"` block, add (right after `"verify:brand"`):

```json
    "verify:performance": "MODE=performance node scripts/verify-public-brand.mjs",
```

- [ ] **Step 3: Add the performance-specific constants**

At the top of `scripts/verify-public-brand.mjs`, right after the existing `const timeout = Number(process.env.BRAND_VERIFY_TIMEOUT ?? 45000);` line (line 8), add:

```js
const LIGHTHOUSE_DEBUG_PORT = 9222;
const PERFORMANCE_FLOOR = 50;
```

Then, right after the closing `];` of the existing `staticRoutes` array (find it — it currently ends around line 47 with `"/help",\n];`), add a new, separate route list used only by `performance` mode:

```js
// Small, representative sample -- Lighthouse audits are far heavier per-page
// than the brand/a11y checks (each involves multiple simulated page loads
// under throttling), so this mode intentionally does NOT use the full
// staticRoutes/detailRoutes/stateRoutes list. Home, the animals listing, the
// adoption form, and donate are the highest-traffic, highest-stakes public
// pages.
const performanceRoutes = ["/", "/animals/cat", "/adoption/apply", "/donate"];
```

- [ ] **Step 4: Import `playAudit`**

At the top of the file, alongside the existing `import { chromium } from "playwright";` line, add:

```js
import { playAudit } from "playwright-lighthouse";
```

- [ ] **Step 5: Add `isDesktop` to the 1440x900 viewport entry**

Find the `viewports` array (currently lines 49-55) and add an explicit flag to the desktop entry, so mode-gating logic can reference it by intent rather than by matching a literal string. Only the LAST entry changes — every other entry (including its `height`) must stay byte-identical to what's already there:

```js
const viewports = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900, isDesktop: true },
];
```

- [ ] **Step 6: Add the performance assertion function**

Near the other `assert*` functions (e.g. right after `assertOneHeading`), add:

```js
async function assertPerformanceFloor(page, label) {
  const { lhr } = await playAudit({
    page,
    port: LIGHTHOUSE_DEBUG_PORT,
    disableLogs: true,
  });
  const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
  console.log(label + ": Lighthouse performance score " + score);
  if (score < PERFORMANCE_FLOOR) {
    recordFailure(
      label + " scored " + score + " on Lighthouse performance (floor: " + PERFORMANCE_FLOOR + ")",
    );
  }
}
```

Before wiring this in, verify `playwright-lighthouse`'s actual `playAudit` API matches this shape by checking its README/type definitions in `node_modules/playwright-lighthouse` (installed in Step 1) — the exact option names (`port`, `disableLogs`) and the `lhr.categories.performance.score` result shape should match current versions, but confirm rather than assume, since this plan's author verified this against version `4.0.0` during design-time investigation and a newer version could differ.

- [ ] **Step 7: Make the browser launch conditionally expose a debugging port**

Find:

```js
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
```

Replace with:

```js
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  // playwright-lighthouse drives Lighthouse over the Chrome DevTools
  // Protocol against a debugging port, not through Playwright's own API --
  // only exposed for `performance` mode since it's an extra attack/conflict
  // surface other modes don't need.
  ...(mode === "performance" ? { args: [`--remote-debugging-port=${LIGHTHOUSE_DEBUG_PORT}`] } : {}),
};
const browser = await chromium.launch(launchOptions);
```

- [ ] **Step 8: Use the smaller route list for `performance` mode**

Find:

```js
  const routes = [...staticRoutes, ...detailRoutes, ...stateRoutes];
```

Replace with:

```js
  const routes = [...staticRoutes, ...detailRoutes, ...stateRoutes];
  const routesForMode = mode === "performance" ? performanceRoutes : routes;
```

Then find the per-route loop, `for (const route of routes) {`, and change it to:

```js
      for (const route of routesForMode) {
```

- [ ] **Step 9: Skip non-desktop viewports for `performance` mode**

Find the outer `for (const viewport of viewports) {` loop and add an early continue right after it (this mirrors the same pattern used for `a11y` mode in the sibling PR, applied independently here since that mode doesn't exist in this branch yet):

```js
  for (const viewport of viewports) {
    if (mode === "performance" && !viewport.isDesktop) {
      continue;
    }
    const context = await browser.newContext({ viewport });
```

- [ ] **Step 10: Call the performance assertion from the per-route loop**

Find the existing `if (mode === "brand") { await assertBrandLogo(page, label); }` line inside the per-route loop, and add right after it:

```js
          if (mode === "performance") {
            await assertPerformanceFloor(page, label);
          }
```

- [ ] **Step 11: Gate the reflow/reduced-motion checks to `brand` mode only**

Find (after the per-route loop, still inside the `for (const viewport of viewports)` loop):

```js
    await runReflowCheck(browser, viewport);
    await runReducedMotionCheck(browser, viewport);
```

Replace with:

```js
    if (mode === "brand") {
      await runReflowCheck(browser, viewport);
      await runReducedMotionCheck(browser, viewport);
    }
```

- [ ] **Step 12: Fix the final route-count log message to use the actual route list checked**

Find:

```js
    console.log(
      "Verified " +
        (staticRoutes.length + 4 + stateRoutes.length) +
        " routes across " +
        viewports.length +
        " viewports in " +
        mode +
        " mode",
    );
```

Replace with:

```js
    console.log(
      "Verified " +
        routesForMode.length +
        " routes across " +
        viewports.length +
        " viewports in " +
        mode +
        " mode",
    );
```

(This is a strict correctness fix, not just a `performance`-mode accommodation: `routesForMode.length` equals `staticRoutes.length + 4 + stateRoutes.length` exactly for `brand` mode too, since `detailRoutes` always has exactly 4 entries — but the old hardcoded arithmetic would have silently printed the wrong count for `performance` mode's much smaller route list.)

- [ ] **Step 13: Verify the check runs a real Lighthouse audit and passes at the floor of 50**

Build and run against the fixture:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key bun run build
```

Start the fixture and preview server in the background:

```bash
node scripts/ci/supabase-fixture.mjs &
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key HOST=127.0.0.1 PORT=4173 NITRO_HOST=127.0.0.1 NITRO_PORT=4173 bun run preview &
```

Wait for `http://127.0.0.1:4173/` to respond, then:

```bash
BASE_URL=http://127.0.0.1:4173 OUTPUT_DIR=artifacts/performance-ci bun run verify:performance
```

Expected: PASSES (exit 0), with 4 console lines printing each route's real Lighthouse performance score (roughly matching the measured baseline: `/` in the low-to-mid 70s, the other three in the mid-to-high 80s — some run-to-run variance is expected and fine, since the floor of 50 has a wide margin). If any score comes back drastically different from the baseline (e.g., near 0, or an error instead of a number), investigate before proceeding — that would indicate a setup problem (wrong debugging port, `playAudit` API mismatch), not a real regression. Kill the background processes afterward.

- [ ] **Step 14: Confirm `brand-verify`'s existing behavior is completely unaffected**

Steps 9 and 11 added `mode`-gating to shared loop logic that `brand-verify` (a required check) depends on. With the fixture and preview server still running (restart if needed), run:

```bash
BASE_URL=http://127.0.0.1:4173 OUTPUT_DIR=artifacts/brand-ci-recheck MODE=brand bun run verify:brand
```

Expected: PASSES exactly as before this task's changes — all 5 viewports run, reflow and reduced-motion checks still execute, the same routes are checked, and the final "Verified N routes..." message still reports the correct brand-mode count. If this fails or behaves differently, the mode-gating was applied incorrectly — fix it before proceeding, since a regression here would break a required CI check on every future PR. Kill the background processes afterward.

- [ ] **Step 15: Run the full test suite, typecheck, and lint**

```bash
bun test && bunx tsc --noEmit && bun run lint
```

Expected: all pass, no errors.

- [ ] **Step 16: Commit**

```bash
git add package.json scripts/verify-public-brand.mjs
git commit -m "feat: add Lighthouse performance checks to the public route verifier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Include whichever lockfile changed — `bun.lock` — in this commit too.)

---

### Task 2: Add the non-blocking `performance-verify` CI job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Read the current `brand-verify` job**

Read `.github/workflows/ci.yml` in full to find `brand-verify`'s exact current content (it may have shifted since this plan was written) — you'll mirror its steps, but note `brand-verify` itself no longer has `continue-on-error` (it was promoted to a required check earlier this session); the new `performance-verify` job DOES need its own `continue-on-error: true`, since it's a brand-new, unproven check regardless of `brand-verify`'s current status.

- [ ] **Step 2: Add the `performance-verify` job**

Add a new job at the end of the file, copying `brand-verify`'s structure with these differences: job name, `continue-on-error: true` (added, since `brand-verify` no longer has it), `bun run verify:performance` instead of `verify:brand`'s `MODE: brand`/`bun run verify:brand` — note `verify:performance`'s own npm script sets `MODE=performance` inline itself (per Task 1 Step 2), so do NOT also set `MODE: performance` in this job's `env:` block, matching the same avoid-redundant-MODE pattern used for `verify:a11y` in the sibling a11y PR — and `OUTPUT_DIR: artifacts/performance-ci` instead of `artifacts/brand-ci`. Also drop `BRAND_VERIFY_TIMEOUT` (that variable is brand-mode-specific tuning, not relevant here — the script's default 45s navigation timeout applies):

```yaml
  # Separate job so brand-verify (required) never fails on a Lighthouse score.
  # Non-blocking until proven consistently green (Lighthouse's own CI-noise
  # profile means "consistently green" may take longer to establish than it
  # did for brand-verify/a11y-verify) -- promote via branch protection only
  # once that's actually observed, not on the same "green 5 times" timeline
  # used for the deterministic checks.
  performance-verify:
    runs-on: ubuntu-latest
    needs: verify
    timeout-minutes: 20
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - run: bun install --frozen-lockfile

      - name: Build against the fixture
        run: bun run build
        env:
          VITE_SUPABASE_URL: http://127.0.0.1:54329
          VITE_SUPABASE_ANON_KEY: ci-placeholder-anon-key
          SUPABASE_URL: http://127.0.0.1:54329
          SUPABASE_SERVICE_ROLE_KEY: ci-placeholder-service-role-key

      - name: Install performance verifier browser
        run: bunx playwright install --with-deps chromium

      - name: Verify public performance
        shell: bash
        run: |
          node scripts/ci/supabase-fixture.mjs > /tmp/hkscda-fixture.log 2>&1 &
          fixture_pid=$!
          HOST=127.0.0.1 PORT=4173 NITRO_HOST=127.0.0.1 NITRO_PORT=4173             bun run preview > /tmp/hkscda-performance-preview.log 2>&1 &
          preview_pid=$!
          trap 'kill "$preview_pid" "$fixture_pid" 2>/dev/null || true' EXIT

          ready=false
          for attempt in {1..120}; do
            if curl --fail --silent http://127.0.0.1:4173/ >/dev/null; then
              ready=true
              break
            fi
            if ! kill -0 "$preview_pid" 2>/dev/null; then
              cat /tmp/hkscda-performance-preview.log
              exit 1
            fi
            sleep 1
          done

          if [ "$ready" != "true" ]; then
            cat /tmp/hkscda-performance-preview.log
            exit 1
          fi

          curl --fail --silent "http://127.0.0.1:54329/rest/v1/animals?select=id&limit=1" >/dev/null || {
            echo "fixture did not answer"
            cat /tmp/hkscda-fixture.log
            exit 1
          }

          bun run verify:performance
        env:
          BASE_URL: http://127.0.0.1:4173
          OUTPUT_DIR: artifacts/performance-ci
          VITE_SUPABASE_URL: http://127.0.0.1:54329
          VITE_SUPABASE_ANON_KEY: ci-placeholder-anon-key
          SUPABASE_URL: http://127.0.0.1:54329
          SUPABASE_SERVICE_ROLE_KEY: ci-placeholder-service-role-key

      - name: Upload performance artefacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: performance-ci
          path: artifacts/performance-ci
          if-no-files-found: ignore
```

- [ ] **Step 3: Add the `.gitignore` entry**

Find the existing `artifacts/brand-ci*/` line in `.gitignore` and add right after it:

```
# verify:performance writes here in CI (OUTPUT_DIR=artifacts/performance-ci)
artifacts/performance-ci*/
```

- [ ] **Step 4: Final full verification**

Run the complete local gate one more time:

```bash
bun test && bunx tsc --noEmit && bun run lint
```

Then repeat the manual build+fixture+preview+verify sequence from Task 1 Step 13 (`bun run verify:performance`) and Step 14 (`MODE=brand bun run verify:brand`) one final time to confirm both still pass cleanly end-to-end with all of this task's changes in place. Kill background processes afterward.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .gitignore
git commit -m "ci: add non-blocking performance-verify job

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
