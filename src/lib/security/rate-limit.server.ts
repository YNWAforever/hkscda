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

export type RateLimitOptions = {
  /** Namespace so different endpoints keep independent counters. */
  prefix: string;
  /** Maximum requests allowed within the window. */
  max: number;
  /** Sliding window size, e.g. "1 m". */
  window: RateLimitWindow;
};

export type RateLimitResult = {
  ok: boolean;
  limit?: number;
  remaining?: number;
  /** Unix ms timestamp when the window resets (for Retry-After). */
  reset?: number;
};

// Minimal structural type so call sites and tests can inject a fake limiter
// without depending on the concrete Upstash class.
export type RateLimiter = {
  limit(identifier: string): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

/**
 * Resolve the originating client IP from platform-trusted headers.
 *
 * SECURITY: `x-forwarded-for` is partly client-controlled. A client can send
 * its own `x-forwarded-for`, and Vercel APPENDS the real client IP to the end —
 * so the LEFTMOST entry is attacker-supplied and must never be trusted for
 * rate-limiting (trusting index 0 lets an attacker rotate the header to mint a
 * fresh bucket per request and bypass every per-IP limit).
 *
 * We therefore prefer the headers Vercel sets itself (not client-spoofable):
 *   1. `x-vercel-forwarded-for` — Vercel's real client IP.
 *   2. `x-real-ip` — Vercel's real client IP.
 * Only if neither is present (non-Vercel/local dev, where rate-limiting is a
 * no-op because Upstash is unconfigured) do we fall back to the RIGHTMOST
 * `x-forwarded-for` entry (the hop appended closest to our edge) — never the
 * leftmost, attacker-controlled one.
 */
export function getClientIp(request: Request): string {
  return clientIpFromHeaders((name) => request.headers.get(name));
}

/**
 * Same resolution as {@link getClientIp} but driven by a header getter, for
 * server-function contexts that expose headers rather than a `Request`
 * (e.g. `getRequestHeader` from `@tanstack/react-start/server`). Keeping one
 * implementation guarantees the donation and adoption paths resolve the IP
 * identically and stay spoof-resistant.
 */
export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string {
  const vercel = firstHeaderEntry(get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const realIp = get("x-real-ip")?.trim();
  if (realIp && realIp.length > 0) return realIp;

  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }

  return "unknown";
}

function firstHeaderEntry(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

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

const limiterCache = new Map<string, Ratelimit>();
function getLimiter(opts: RateLimitOptions): RateLimiter | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${opts.prefix}:${opts.max}:${opts.window}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.max, opts.window),
      prefix: `rl:${opts.prefix}`,
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Enforce a rate limit for `identifier` (typically a client IP).
 *
 * Fails OPEN: when Upstash is not configured (dev/preview) or the Redis call
 * errors, the request is allowed. Blocking legitimate donors/applicants on a
 * transient Redis outage is worse than briefly skipping the limit.
 *
 * Pass `deps.limiter` to inject a fake limiter in tests (or `null` to force the
 * unconfigured path).
 */
export async function enforceRateLimit(
  identifier: string,
  opts: RateLimitOptions,
  deps: { limiter?: RateLimiter | null } = {},
): Promise<RateLimitResult> {
  const limiter = deps.limiter !== undefined ? deps.limiter : getLimiter(opts);
  if (!limiter) return { ok: true };

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return { ok: success, limit, remaining, reset };
  } catch (error) {
    console.error("Rate limit check failed; allowing request", error);
    return { ok: true };
  }
}

/** Seconds until the window resets, for a `Retry-After` header. */
export function retryAfterSeconds(result: RateLimitResult, now = Date.now()): number {
  if (!result.reset) return 60;
  return Math.max(1, Math.ceil((result.reset - now) / 1000));
}
