# Automated Accessibility (a11y) Verification for Public Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automated, non-blocking CI check that runs `@axe-core/playwright` against every public route, and fix the one real `serious`-impact violation the first live scan found.

**Architecture:** Extend the existing `scripts/verify-public-brand.mjs` (which already builds the app against a Supabase fixture, starts the Nitro preview server, and drives Playwright across every public route for brand checks) with a new `a11y` mode that runs axe-core per route and fails only on `serious`/`critical` violations. A new `verify:a11y` npm script and a new non-blocking `a11y-verify` CI job invoke it.

**Tech Stack:** Playwright (existing dependency), `@axe-core/playwright` (new devDependency), Bun, GitHub Actions.

---

## Verified current state (do not re-derive — read directly from the repo and from a real scan during spec work)

- `scripts/verify-public-brand.mjs` has a `mode` variable (`process.env.MODE ?? "brand"`) already gating brand-only assertions — an existing, unused extension point.
- `.github/workflows/ci.yml`'s `brand-verify` job (lines 60-138 at time of writing) is the exact template to mirror: checkout → setup-bun (`bun-version: 1.3.14`) → `bun install --frozen-lockfile` → build against a Supabase fixture (`VITE_SUPABASE_URL=http://127.0.0.1:54329`, `VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key`, `SUPABASE_URL=http://127.0.0.1:54329`, `SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key`) → install Chromium → start the fixture (`node scripts/ci/supabase-fixture.mjs`) + `bun run preview` (with the same 4 env vars set on the preview process itself, not just the build step) → wait for both to be ready → run the verifier.
- A real scan (fixture-backed preview build, all 26 routes from the existing `staticRoutes`/`detailRoutes`/`stateRoutes` lists) found exactly **one** unique `serious`-impact violation and **zero** `critical`-impact violations:
  - **`definition-list`** on `/about` only: `src/routes/about/index.tsx` renders `<dl><div><dt>...</dt><dd>...</dd><p>資料截至 {item.asOf}</p></div></dl>` — axe requires a `<dl>`'s direct-child grouping `<div>` to contain *only* `<dt>`/`<dd>` pairs, and the sibling `<p>` violates that.
  - Two `moderate`-impact findings (`region` on 6 routes, `landmark-one-main` on 2 synthetic state routes) are explicitly out of scope for this plan — logged in the spec as follow-up, not fixed here.

---

## File Structure

**Modify:**
- `package.json` — add `@axe-core/playwright` devDependency, add `"verify:a11y"` script.
- `scripts/verify-public-brand.mjs` — add axe-core import, an `assertNoSeriousA11yViolations` function, and call it from the existing route loop when `mode === "a11y"`.
- `src/routes/about/index.tsx` — fix the `definition-list` violation.
- `.github/workflows/ci.yml` — add the new `a11y-verify` job.

---

### Task 1: Add the axe-core check to the verifier script

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-public-brand.mjs`

- [ ] **Step 1: Add the `@axe-core/playwright` devDependency**

```bash
bun add -D @axe-core/playwright
```

Expected: `package.json`'s `devDependencies` gains `"@axe-core/playwright": "^4.x.x"` (whatever the installed version resolves to), and the lockfile updates.

- [ ] **Step 2: Add the `verify:a11y` script**

In `package.json`'s `"scripts"` block, add (right after `"verify:brand"`):

```json
    "verify:a11y": "MODE=a11y node scripts/verify-public-brand.mjs",
```

(Corrected during code review of this task: the original draft here was byte-identical to `verify:brand`'s command, which meant `bun run verify:a11y` would silently default to `mode = "brand"` and do nothing a11y-specific. Bun's script runner uses its own cross-platform shell, so this `VAR=value cmd` syntax works on Windows too.)

- [ ] **Step 3: Import `AxeBuilder` and add the assertion function**

At the top of `scripts/verify-public-brand.mjs`, alongside the existing `import { chromium } from "playwright";` line, add:

```js
import AxeBuilder from "@axe-core/playwright";
```

Near the other `assert*` functions (e.g. right after `assertOneHeading`), add:

```js
const A11Y_MINOR_MODERATE_FINDINGS = [];

async function assertNoSeriousA11yViolations(page, label) {
  const results = await new AxeBuilder({ page }).analyze();
  for (const violation of results.violations) {
    if (violation.impact === "serious" || violation.impact === "critical") {
      recordFailure(
        label +
          " has a " +
          violation.impact +
          " a11y violation (" +
          violation.id +
          "): " +
          violation.help +
          " -- " +
          violation.nodes.map((node) => node.target.join(" ")).join(", "),
      );
    } else {
      A11Y_MINOR_MODERATE_FINDINGS.push(
        label + ": " + violation.impact + " " + violation.id + " (" + violation.nodes.length + " nodes)",
      );
    }
  }
}
```

- [ ] **Step 4: Call the new assertion from the existing route loop, gated on `mode === "a11y"`**

Find the existing per-route loop inside the `try` block (the one iterating `for (const route of routes)`, which already calls `assertNoOverflow`, `assertBrandLogo` (gated on `mode === "brand"`), `assertOneHeading`, etc.). Add this call right after the existing `if (mode === "brand") { await assertBrandLogo(page, label); }` line:

```js
          if (mode === "a11y") {
            await assertNoSeriousA11yViolations(page, label);
          }
```

- [ ] **Step 5: Skip the 4 extra viewports for `a11y` mode**

Find the outer `for (const viewport of viewports) {` loop. Right after that line, add an early-continue so `a11y` mode only runs once, at the first (desktop) viewport in the array — check the current `viewports` array's order first (`ls` the file or grep `const viewports`) and confirm which entry is the 1440x900 desktop one; if it's not first, add the guard against that specific entry's `name` instead of always skipping past index 0. As of this plan's writing, `viewports[4]` is `{ name: "1440x900", width: 1440, height: 900 }` (the last entry) — confirm this is still true, then add:

```js
    if (mode === "a11y" && viewport.name !== "1440x900") {
      continue;
    }
```

- [ ] **Step 6: Also skip the reflow and reduced-motion checks for `a11y` mode**

Find where `runReflowCheck(browser, viewport)` and `runReducedMotionCheck(browser, viewport)` are called (after the per-route loop, still inside the `for (const viewport of viewports)` loop). Wrap both calls so they only run in `brand` mode (they test brand-specific concerns — CSS overflow and `prefers-reduced-motion` — not accessibility):

```js
    if (mode === "brand") {
      await runReflowCheck(browser, viewport);
      await runReducedMotionCheck(browser, viewport);
    }
```

- [ ] **Step 7: Print minor/moderate findings at the end**

Find the final `if (failures.length > 0) { ... } else { console.log(...) }` block near the end of the file. Right before that `if`, add:

```js
  if (A11Y_MINOR_MODERATE_FINDINGS.length > 0) {
    console.log(
      "Minor/moderate a11y findings (not gating this check):\n" +
        A11Y_MINOR_MODERATE_FINDINGS.join("\n"),
    );
  }
```

- [ ] **Step 8: Verify the check correctly detects the known `/about` violation (red)**

Build and run against the fixture, exactly matching `brand-verify`'s CI steps:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key bun run build
```

Then start the fixture and preview server (in separate terminals or background processes), matching `brand-verify`'s job:
```bash
node scripts/ci/supabase-fixture.mjs &
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key HOST=127.0.0.1 PORT=4173 NITRO_HOST=127.0.0.1 NITRO_PORT=4173 bun run preview &
```

Wait for `http://127.0.0.1:4173/` to respond, then:
```bash
BASE_URL=http://127.0.0.1:4173 OUTPUT_DIR=artifacts/a11y-ci MODE=a11y bun run verify:a11y
```

Expected: FAILS with exactly one failure message referencing `/about` and the `definition-list` rule (matching the known finding above) — this confirms the new check actually detects a real, known violation before you fix it. Kill the fixture/preview background processes afterward.

- [ ] **Step 9: Confirm `brand-verify`'s existing behavior is completely unaffected**

This file backs `brand-verify`, an already-required branch-protection check — Steps 5 and 6 above added `mode === "a11y"`/`mode === "brand"` gating to shared loop logic, so it's essential to confirm brand mode's own behavior didn't shift. With the same fixture and preview server still running from Step 8 (restart them if you already killed them), run:

```bash
BASE_URL=http://127.0.0.1:4173 OUTPUT_DIR=artifacts/brand-ci-recheck MODE=brand bun run verify:brand
```

Expected: PASSES exactly as it did before this task's changes (all 5 viewports still run for brand mode, reflow and reduced-motion checks still execute, no new failures). If this fails or behaves differently than `verify:brand` did prior to this task, the mode-gating in Steps 5-6 was applied incorrectly — fix it before proceeding, since a regression here would break a required CI check on every future PR, not just this one. Kill the background processes afterward.

- [ ] **Step 10: Commit**

```bash
git add package.json scripts/verify-public-brand.mjs
git commit -m "feat: add axe-core a11y checks to the public route verifier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Note: the lockfile — `bun.lock` or `bun.lockb`, check which this repo uses via `git status` — will also have changed from Step 1's `bun add`; include whichever one it is in this commit's `git add` too.)

---

### Task 2: Fix the `/about` `definition-list` violation

**Files:**
- Modify: `src/routes/about/index.tsx`

- [ ] **Step 1: Read the current code**

The current content around the violation (confirmed at plan-writing time, lines ~159-172):

```tsx
          {impact.length > 0 ? (
            <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {impact.map((item) => (
                <div key={item.label} className="border-t-4 border-[var(--color-primary)] pt-4">
                  <dt className="text-sm font-bold text-[var(--color-text-muted)]">{item.label}</dt>
                  <dd className="mt-2 text-4xl font-bold text-[var(--color-primary)]">
                    {item.value.toLocaleString("zh-HK")}
                  </dd>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    資料截至 {item.asOf}
                  </p>
                </div>
              ))}
            </dl>
          ) : (
```

- [ ] **Step 2: Move the caption inside `<dd>`**

axe's `definition-list` rule requires each `<dl>`-child grouping `<div>` to contain *only* `<dt>`/`<dd>` elements. `<dd>` itself can contain arbitrary flow content, so nest the caption inside it instead of as a sibling. Use a `<span>` with `block` (since `<span>` isn't block-level by default, unlike the `<p>` it replaces) plus the same visual classes the original `<p>` had, and `font-normal` to override the `<dd>`'s own `font-bold`:

```tsx
          {impact.length > 0 ? (
            <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {impact.map((item) => (
                <div key={item.label} className="border-t-4 border-[var(--color-primary)] pt-4">
                  <dt className="text-sm font-bold text-[var(--color-text-muted)]">{item.label}</dt>
                  <dd className="mt-2 text-4xl font-bold text-[var(--color-primary)]">
                    {item.value.toLocaleString("zh-HK")}
                    <span className="mt-2 block text-xs font-normal text-[var(--color-text-muted)]">
                      資料截至 {item.asOf}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
```

- [ ] **Step 3: Visually confirm the fix**

Run: `bun run dev`, navigate to `http://localhost:3000/about` (or whatever port `vite dev` prints) in a browser, and confirm the impact-stats section (the 4-column grid with big numbers) still shows the "資料截至 <date>" caption directly beneath each number, visually unchanged from before. Stop the dev server afterward.

- [ ] **Step 4: Re-run the a11y verifier to confirm the violation is gone (green)**

Repeat the exact build+fixture+preview+verify sequence from Task 1 Step 8:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key bun run build
```
```bash
node scripts/ci/supabase-fixture.mjs &
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key SUPABASE_URL=http://127.0.0.1:54329 SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key HOST=127.0.0.1 PORT=4173 NITRO_HOST=127.0.0.1 NITRO_PORT=4173 bun run preview &
```
```bash
BASE_URL=http://127.0.0.1:4173 OUTPUT_DIR=artifacts/a11y-ci MODE=a11y bun run verify:a11y
```

Expected: PASSES with 0 `serious`/`critical` failures. The console output should print the 2 known minor/moderate findings (`region` on 6 routes, `landmark-one-main` on 2 routes) as non-gating log lines, matching the spec's documented follow-up list — confirm their counts match (6 and 2 routes respectively) as a sanity check that nothing regressed or newly appeared. Kill the background processes afterward.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

```bash
bun test && bunx tsc --noEmit && bun run lint
```

Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/about/index.tsx
git commit -m "fix: nest about page's impact-stat caption inside dd for valid definition-list markup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Add the non-blocking `a11y-verify` CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current `brand-verify` job**

Read `.github/workflows/ci.yml` in full to find `brand-verify`'s exact current content (it may have shifted lines since this plan was written) — you'll mirror it almost exactly.

- [ ] **Step 2: Add the `a11y-verify` job**

Add a new job at the end of the file, copying `brand-verify`'s structure with these differences: job name, `MODE: a11y` instead of `MODE: brand`, `bun run verify:a11y` instead of `bun run verify:brand`, and `OUTPUT_DIR: artifacts/a11y-ci` instead of `artifacts/brand-ci` (a11y mode doesn't take screenshots, but keeping a distinct output dir avoids any confusion if that ever changes):

```yaml
  # Separate job so brand-verify (required) never fails on a11y findings.
  # Non-blocking until proven green repeatedly, then promote via branch
  # protection -- the same process already used for brand-verify itself.
  a11y-verify:
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

      - name: Install a11y verifier browser
        run: bunx playwright install --with-deps chromium

      - name: Verify public a11y
        shell: bash
        run: |
          node scripts/ci/supabase-fixture.mjs > /tmp/hkscda-fixture.log 2>&1 &
          fixture_pid=$!
          HOST=127.0.0.1 PORT=4173 NITRO_HOST=127.0.0.1 NITRO_PORT=4173 bun run preview > /tmp/hkscda-a11y-preview.log 2>&1 &
          preview_pid=$!
          trap 'kill "$preview_pid" "$fixture_pid" 2>/dev/null || true' EXIT

          ready=false
          for attempt in {1..120}; do
            if curl --fail --silent http://127.0.0.1:4173/ >/dev/null; then
              ready=true
              break
            fi
            if ! kill -0 "$preview_pid" 2>/dev/null; then
              cat /tmp/hkscda-a11y-preview.log
              exit 1
            fi
            sleep 1
          done

          if [ "$ready" != "true" ]; then
            cat /tmp/hkscda-a11y-preview.log
            exit 1
          fi

          curl --fail --silent "http://127.0.0.1:54329/rest/v1/animals?select=id&limit=1" >/dev/null || {
            echo "fixture did not answer"
            cat /tmp/hkscda-fixture.log
            exit 1
          }

          bun run verify:a11y
        env:
          BASE_URL: http://127.0.0.1:4173
          OUTPUT_DIR: artifacts/a11y-ci
          MODE: a11y
          VITE_SUPABASE_URL: http://127.0.0.1:54329
          VITE_SUPABASE_ANON_KEY: ci-placeholder-anon-key
          SUPABASE_URL: http://127.0.0.1:54329
          SUPABASE_SERVICE_ROLE_KEY: ci-placeholder-service-role-key
```

- [ ] **Step 3: Final full verification**

Run the complete local gate one more time to confirm all 3 tasks' cumulative changes work together:

```bash
bun test && bunx tsc --noEmit && bun run lint
```

Then repeat the manual build+fixture+preview+verify sequence from Task 2 Step 4 one final time to confirm `bun run verify:a11y` still passes cleanly end-to-end. Kill background processes afterward.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add non-blocking a11y-verify job

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
