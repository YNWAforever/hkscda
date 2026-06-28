import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// A sliding-window duration string accepted by @upstash/ratelimit, e.g. "1 m".
export type RateLimitWindow = `${number} ${"ms" | "s" | "m" | "h" | "d"}`;

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
 * Resolve the originating client IP. On Vercel the platform sets
 * `x-forwarded-for` with the real client IP as the FIRST entry, so taking
 * index 0 is trustworthy there. Falls back to `x-real-ip`, then "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : "unknown";
}

let cachedRedis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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
