# Upstash Production Deploy Gate (BP-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Upstash rate-limiting misconfiguration loud instead of silent in production, mirroring the two-tier pattern (`assertTurnstileConfig` hard boot-fail + `warnTurnstileDisabledOnce` one-time warning) that already exists for Cloudflare Turnstile.

**Architecture:** Two new exported functions in `src/lib/security/rate-limit.server.ts` — `assertUpstashConfig`/`assertUpstashConfigFromEnv` (throws at boot if exactly one of `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` is set in production) and `warnUpstashDisabledOnce` (logs once per process when `getRedis()` resolves to unconfigured in production). `assertUpstashConfigFromEnv` is wired into `src/server.ts`'s cold-start sequence next to the existing `assertTurnstileConfigFromEnv()` call. No change to `enforceRateLimit`'s fail-open behavior.

**Tech Stack:** TypeScript, Bun test.

---

## File Structure

**Modify:**
- `src/lib/security/rate-limit.server.ts` — adds `assertUpstashConfig`, `assertUpstashConfigFromEnv`, `warnUpstashDisabledOnce`; wires the warning into the existing `getRedis()`.
- `src/lib/security/rate-limit.server.test.ts` — adds test coverage for `assertUpstashConfig`.
- `src/server.ts` — calls `assertUpstashConfigFromEnv()` at cold start.

---

### Task 1: Add `assertUpstashConfig`/`assertUpstashConfigFromEnv` with tests

**Files:**
- Modify: `src/lib/security/rate-limit.server.ts`
- Modify: `src/lib/security/rate-limit.server.test.ts`

`src/lib/security/turnstile.server.ts` already has `assertTurnstileConfig`, which throws at boot in production when exactly one of the client/server Turnstile keys is set (an inconsistent pair either 403s every submission or silently disables the CAPTCHA). `src/lib/security/rate-limit.server.ts` has no equivalent for its own two required env vars, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — a partial pair (one set, one missing, almost always a typo) is silently treated the same as "fully unconfigured" today. This task adds that check, following TDD.

- [ ] **Step 1: Write the failing tests**

Open `src/lib/security/rate-limit.server.test.ts`. Its current import block is:

```ts
import { describe, expect, test } from "bun:test";

import {
  clientIpFromHeaders,
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimiter,
} from "./rate-limit.server";
```

Replace it with:

```ts
import { describe, expect, test } from "bun:test";

import {
  assertUpstashConfig,
  clientIpFromHeaders,
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimiter,
} from "./rate-limit.server";
```

Then add this new `describe` block at the end of the file, after the existing `describe("retryAfterSeconds", ...)` block (i.e., append after the file's current final `});` on line 134):

```ts

describe("assertUpstashConfig", () => {
  test("does nothing outside production, even when inconsistent", () => {
    expect(() =>
      assertUpstashConfig({ url: "https://example.upstash.io", token: undefined, isProduction: false }),
    ).not.toThrow();
  });

  test("passes in production when both url and token are set", () => {
    expect(() =>
      assertUpstashConfig({ url: "https://example.upstash.io", token: "tok", isProduction: true }),
    ).not.toThrow();
  });

  test("passes in production when neither is set (rate limiting intentionally off)", () => {
    expect(() =>
      assertUpstashConfig({ url: undefined, token: undefined, isProduction: true }),
    ).not.toThrow();
  });

  test("throws in production when only the url is set", () => {
    expect(() =>
      assertUpstashConfig({ url: "https://example.upstash.io", token: undefined, isProduction: true }),
    ).toThrow(/Upstash misconfiguration/);
  });

  test("throws in production when only the token is set", () => {
    expect(() =>
      assertUpstashConfig({ url: undefined, token: "tok", isProduction: true }),
    ).toThrow(/Upstash misconfiguration/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/security/rate-limit.server.test.ts`
Expected: FAIL — `assertUpstashConfig` is not exported from `./rate-limit.server` yet (a TypeScript/import error, not a normal assertion failure).

- [ ] **Step 3: Add `assertUpstashConfig`/`assertUpstashConfigFromEnv` to `rate-limit.server.ts`**

The current top of `src/lib/security/rate-limit.server.ts` is:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// A sliding-window duration string accepted by @upstash/ratelimit, e.g. "1 m".
export type RateLimitWindow = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;
```

Replace it with:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { isProductionRuntime } from "./turnstile.server";

// A sliding-window duration string accepted by @upstash/ratelimit, e.g. "1 m".
export type RateLimitWindow = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

/**
 * Fail loudly at startup when only one of the two required Upstash env vars
 * is set in production.
 *
 * `getRedis()` below already treats "one set, one missing" the same as
 * "neither set" (rate limiting silently disabled) — that's the right
 * fail-open behavior for a genuinely unconfigured deployment, but a partial
 * pair has no legitimate cause; it's almost always a typo in one of the two
 * variable names. Turning that into an obvious boot failure (mirroring
 * {@link import("./turnstile.server").assertTurnstileConfig}) catches the
 * mistake immediately instead of silently running with rate limiting off.
 */
export function assertUpstashConfig(config: {
  url?: string | null;
  token?: string | null;
  isProduction: boolean;
}): void {
  if (!config.isProduction) return;
  const hasUrl = Boolean(config.url);
  const hasToken = Boolean(config.token);
  if (hasUrl === hasToken) return;
  throw new Error(
    "Upstash misconfiguration: set BOTH UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, " +
      `or neither. Got URL ${hasUrl ? "set" : "MISSING"}, token ${hasToken ? "set" : "MISSING"}. ` +
      "A partial pair almost always means a typo in one of the two variable names.",
  );
}

/** Run {@link assertUpstashConfig} against the live environment at startup. */
export function assertUpstashConfigFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  assertUpstashConfig({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    isProduction: isProductionRuntime(env),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/security/rate-limit.server.test.ts`
Expected: PASS, all tests (5 new `assertUpstashConfig` tests plus the existing ones in this file).

**Outcome (2026-09-01):** Code quality review of the initial implementation (commit `c006bf6`) found the 5 tests above didn't cover an empty-string env value, unlike the Turnstile precedent's own test suite (which explicitly tests `secret: ""`). Fixed in commit `259b1a1` by adding a 6th test (`token: ""`). The shipped `rate-limit.server.test.ts` has **6** `assertUpstashConfig` tests, not 5.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/rate-limit.server.ts src/lib/security/rate-limit.server.test.ts
git commit -m "feat: add assertUpstashConfig, a boot-time check for a partial Upstash env pair"
```

---

### Task 2: Add the one-time runtime warning and wire the boot assertion into `server.ts`

**Files:**
- Modify: `src/lib/security/rate-limit.server.ts`
- Modify: `src/server.ts`

Task 1 added the hard boot-fail for a *partial* Upstash config pair. This task adds the softer half of the two-tier design — a one-time `console.error` when Upstash is *fully* unconfigured in production (which may be intentional, so it doesn't fail boot) — and wires the new boot assertion into the app's actual cold-start sequence, since Task 1 only added the function without calling it anywhere yet.

- [ ] **Step 1: Add `warnUpstashDisabledOnce` and call it from `getRedis()`**

The current `getRedis()` function in `src/lib/security/rate-limit.server.ts` (added context: this comes after the code Task 1 inserted, so exact line numbers have shifted — locate it by content, not by line number) reads:

```ts
let cachedRedis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}
```

Replace it with:

```ts
let warnedUpstashDisabled = false;
function warnUpstashDisabledOnce(): void {
  if (warnedUpstashDisabled) return;
  warnedUpstashDisabled = true;
  if (isProductionRuntime()) {
    console.error(
      "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set in production: rate limiting is " +
        "DISABLED (failing open). This should only happen when rate limiting is intentionally " +
        "turned off.",
    );
  }
}

let cachedRedis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!(url && token)) warnUpstashDisabledOnce();
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}
```

`warnUpstashDisabledOnce` is not unit-tested — this matches the existing precedent (`warnTurnstileDisabledOnce` in `turnstile.server.ts` has zero tests today), since it has private, module-level, once-per-process state that's awkward to reset between test cases, and its only effect is a `console.error` call rather than a return value.

- [ ] **Step 2: Wire `assertUpstashConfigFromEnv` into `server.ts`**

The current top of `src/server.ts` reads:

```ts
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers";
import { assertTurnstileConfigFromEnv } from "./lib/security/turnstile.server";

// Fail the cold start loudly if the client/server Turnstile config is
// inconsistent (secret-only -> 403 outage; site-key-only -> silent bypass).
assertTurnstileConfigFromEnv();
```

Replace it with:

```ts
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { applySecurityHeaders } from "./lib/security-headers";
import { assertUpstashConfigFromEnv } from "./lib/security/rate-limit.server";
import { assertTurnstileConfigFromEnv } from "./lib/security/turnstile.server";

// Fail the cold start loudly if the client/server Turnstile config is
// inconsistent (secret-only -> 403 outage; site-key-only -> silent bypass).
assertTurnstileConfigFromEnv();

// Fail the cold start loudly if only one of the two Upstash env vars is set
// (almost always a typo) -- a fully-unconfigured pair is allowed and only
// logged once, lazily, on first use (see warnUpstashDisabledOnce).
assertUpstashConfigFromEnv();
```

- [ ] **Step 3: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 4: Manually verify the boot-fail fires end to end**

This wiring change means the assertion now runs as part of the actual server module's top-level code, not just inside a unit test. Bun runs TypeScript/ESM directly, so import `src/server.ts` for real and confirm it throws:

```bash
NODE_ENV=production UPSTASH_REDIS_REST_URL=https://example.upstash.io bun -e "import('./src/server.ts')" 2>&1 | grep -i "Upstash misconfiguration"
```

Expected: the `Upstash misconfiguration:` error message from `assertUpstashConfig` appears in the output (thrown at import time, before the module's default export is ever used) — proving `assertUpstashConfigFromEnv()` really runs as part of `src/server.ts`'s top-level code in a production-shaped environment, not just inside `rate-limit.server.test.ts`'s unit tests.

Then confirm a valid pair (or no pair at all) does NOT throw:

```bash
NODE_ENV=production bun -e "import('./src/server.ts')" 2>&1 | grep -i "Upstash misconfiguration"
```

Expected: no output (no match) — with both Upstash vars absent, the import succeeds past both assertions without throwing.

- [ ] **Step 5: Confirm the existing Turnstile assertion still fires too (no regression from the added import)**

```bash
NODE_ENV=production TURNSTILE_SECRET_KEY=sk bun -e "import('./src/server.ts')" 2>&1 | grep -i "Turnstile misconfiguration"
```

Expected: the `Turnstile misconfiguration:` message still appears — confirming the new Upstash import/call didn't shadow, reorder past, or otherwise interfere with the existing Turnstile boot check.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/rate-limit.server.ts src/server.ts
git commit -m "feat: warn once when Upstash rate limiting is unconfigured in production, wire the boot check into server.ts"
```

---

### Task 3: Final full-feature verification

**Files:** none (verification only).

- [ ] **Step 1: Re-run the full gate**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 2: Confirm `assertUpstashConfig`'s behavior one more time via a quick manual Node check**

Since `rate-limit.server.ts` is a `.server.ts` file (not directly `require`-able from plain Node the way `scripts/*.js` files are — it uses TypeScript syntax and ESM-only dependencies), the manual sanity check here is to re-read the committed `src/lib/security/rate-limit.server.ts` and `src/server.ts` in full and confirm:
- `assertUpstashConfig`/`assertUpstashConfigFromEnv`/`warnUpstashDisabledOnce` are all present and exported (the first two) as designed in Task 1/2.
- `getRedis()` calls `warnUpstashDisabledOnce()` exactly when `url && token` is falsy.
- `src/server.ts` calls `assertUpstashConfigFromEnv()` unconditionally at module top level, after `assertTurnstileConfigFromEnv()`.

- [ ] **Step 3: Confirm no other file needs updating**

Run: `grep -rn "UPSTASH_REDIS_REST" src --include=*.ts | grep -v test`
Expected: matches only in `src/lib/security/rate-limit.server.ts` (the two `process.env.UPSTASH_REDIS_REST_URL`/`_TOKEN` reads inside `getRedis()`, plus the two reads inside `assertUpstashConfigFromEnv`) — confirming no other file duplicates or bypasses this env pair, so the new gate covers every real read site.
