# Volunteer overview recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution of the two diagnosed local defects.

**Goal:** Prevent optional overview reads from blocking available counts and reject unconfirmed runtime-job completion.

**Architecture:** Keep the existing handlers, role checks, queries and lease RPCs. Bound optional coverage/health reads to five seconds with cancellation and safe failure reporting; require the existing finish RPC to confirm its write. No schema, dependency, security or queue redesign.

**Tech Stack:** TypeScript, Bun, Supabase query builders, React/Playwright evidence.

**Spec:** User's pasted debugging request and subsequent "keep fixing it"; local root-cause evidence in `/workspace/.hkscda-tools/volunteer-overview-20261025/ROOT-CAUSE.md`.

## Global constraints

- Preserve tested commit `56098144e5862733583406717e5d498d98276e9e` and incident evidence.
- Use only synthetic local tests, with no production DB/Auth access or secrets.
- One protected preview is authorized, but its backend identity and deployment access remain unavailable; do not deploy to an unverified target.
- These fixes address verified local defects; the hosted incident cause remains unverified.
- No SQL/migrations, dependency upgrades, push/merge, job execution against a real backend, or security changes.

## Review focus

- An optional read that never settles must not hide successful counts.
- Timed-out reads receive cancellation, and normal reads clear their deadline.
- Unknown health must not be represented as healthy; logs must omit upstream messages and private payloads.
- A false/null finish result must never produce worker success; original RPC errors retain their identity.
- Existing authorization, partial counts and successful job behavior remain intact.

## Task 1: Bound optional overview data reads

- [x] Add regressions for a stalled coverage read, stalled/rejected health read, cancellation and successful counts.
- [x] Observe those tests failing against the current handler.
- [x] Add a five-second optional-read deadline (injectable duration for tests), retain unavailable/unknown responses and wire safe server logging.
- [x] Pass the abort signal to the existing coverage and health queries; run relevant overview/coverage/health tests.

## Task 2: Require runtime finish confirmation

- [x] Add repository/worker regressions for true, false/null, and RPC error finish results; verify failure-code sanitization.
- [x] Observe false/null completion regressions failing before the fix.
- [x] Require the RPC's boolean true result and preserve a fixed safe lease-loss code.
- [x] Run focused tests, relevant lint/typecheck/build and one full local suite; review the final diff and retain versioned evidence.

## Explicit remaining integration

The current fixes do not implement selective per-stat retry, redesign count-query deadlines, add an hourly-job admin retry endpoint, or diagnose the real deployment. Those broader changes are deferred until runtime evidence identifies the failing layer; this plan does not hide the existing banners or substitute fabricated healthy data. Hosted acceptance and PR creation remain pending real target/access evidence.

## Local verification result

The final full unit/browser suite passed 7,282 tests, with 727 gated skips and no failures (8,009 total across 839 files). Typecheck, changed-file lint (zero warnings), and the fixture-configured production build passed. Six after-fix browser checks passed, including the actual five-second optional-read deadline and mobile layout, with no page errors or external requests. A fresh reviewer found no Critical/Important issue; a dedicated normal-success timer-cleanup regression remains a deferred minor coverage item. Hosted cause/acceptance and PR creation remain blocked by unavailable target/access evidence; the build output uses synthetic settings and is not a deployment artifact.
