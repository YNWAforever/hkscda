# CI Verification — PR #112

Recorded: 2026-09-11 · Run `34601571176` · Branch head `a1366f1`
PR: https://github.com/YNWAforever/hkscda/pull/112

Every check passed on a fresh Linux runner with a fresh Supabase stack — an
environment independent of the local machine all prior evidence was gathered on.

| Check | Result | Duration |
|---|---|---|
| `verify` (typecheck → test → lint → build → route tree) | pass | 1m26s |
| `brand-verify` | pass | 8m19s |
| `a11y-verify` | pass | 2m40s |
| `rls-matrix` | pass | 2m13s |
| `performance-verify` | pass | 5m23s |
| Vercel deployment | pass | — |

## Two corrections to earlier records

**1. `verify:performance` has now run.** It was recorded as "not run" in the
Phase 2 assessment and the implementation status, because it needs a built app
and a reachable origin. CI runs it, and it passed. That gap is closed.

**2. The database tests genuinely ran in CI.** `rls-matrix` carries
`continue-on-error: true`, so a passing check mark does **not** by itself prove
its steps succeeded — precisely the gap recorded in
`02-phase1-transaction-verification`. The job log was therefore read directly:

```
bun run test:rls  ->  38 pass   0 fail
bun run test:db   ->  37 pass   0 fail
```

This is the first time the database-backed suites have ever executed in CI.
Before `d011766` they opted out through `*_ALLOW_LOCAL_FIXTURES` variables no job
set, so every one of them silently skipped.

## What this does not change

`rls-matrix` is still `continue-on-error: true`. It has now been green once; the
repository's documented promotion path is to prove a job green repeatedly on
`main` and then make it a required check through branch protection, as was done
for `brand-verify`. **Until that happens a red database test still reports as a
green CI run** — the check above is evidence the suites work, not evidence that
CI would catch it if they stopped working.

That promotion remains an owner decision, and a settings change rather than a
code one.
