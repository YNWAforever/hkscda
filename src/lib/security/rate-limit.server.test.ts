import { describe, expect, test } from "bun:test";

import {
  assertUpstashConfig,
  clientIpFromHeaders,
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimiter,
} from "./rate-limit.server";

function request(headers: Record<string, string>): Request {
  return new Request("https://example.test", { headers });
}

describe("getClientIp", () => {
  test("prefers x-vercel-forwarded-for (platform-set, not client-spoofable)", () => {
    expect(
      getClientIp(
        request({
          // Attacker-supplied chain — must be ignored.
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
          "x-vercel-forwarded-for": "203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  test("does NOT trust the leftmost (client-supplied) x-forwarded-for entry", () => {
    // Vercel APPENDS the real client IP, so the real IP is the rightmost entry.
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 70.41.3.18" }))).toBe("70.41.3.18");
  });

  test("falls back to x-real-ip over x-forwarded-for", () => {
    expect(getClientIp(request({ "x-real-ip": "192.0.2.44", "x-forwarded-for": "1.2.3.4" }))).toBe(
      "192.0.2.44",
    );
  });

  test("uses the rightmost x-forwarded-for entry, trimmed, when it is the only header", () => {
    expect(getClientIp(request({ "x-forwarded-for": "  1.2.3.4 , 198.51.100.2 " }))).toBe(
      "198.51.100.2",
    );
  });

  test("returns 'unknown' when no IP headers are present", () => {
    expect(getClientIp(request({}))).toBe("unknown");
  });
});

describe("clientIpFromHeaders", () => {
  test("works with a header getter (for server-fn contexts) and ignores spoofed XFF", () => {
    const headers: Record<string, string> = {
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-forwarded-for": "203.0.113.9",
    };
    expect(clientIpFromHeaders((name) => headers[name.toLowerCase()] ?? null)).toBe("203.0.113.9");
  });

  test("returns 'unknown' when the getter has nothing", () => {
    expect(clientIpFromHeaders(() => null)).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  test("fails open when no limiter is configured", async () => {
    const result = await enforceRateLimit(
      "203.0.113.7",
      {
        prefix: "test",
        max: 5,
        window: "1 m",
      },
      { limiter: null },
    );
    expect(result.ok).toBe(true);
  });

  test("allows the request when the limiter reports success", async () => {
    const limiter: RateLimiter = {
      async limit() {
        return { success: true, limit: 5, remaining: 4, reset: 1000 };
      },
    };
    const result = await enforceRateLimit(
      "ip",
      { prefix: "t", max: 5, window: "1 m" },
      { limiter },
    );
    expect(result).toEqual({ ok: true, limit: 5, remaining: 4, reset: 1000 });
  });

  test("blocks the request when the limiter reports failure", async () => {
    const limiter: RateLimiter = {
      async limit() {
        return { success: false, limit: 5, remaining: 0, reset: 2000 };
      },
    };
    const result = await enforceRateLimit(
      "ip",
      { prefix: "t", max: 5, window: "1 m" },
      { limiter },
    );
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("fails open when the limiter throws (e.g. Redis outage)", async () => {
    const limiter: RateLimiter = {
      async limit() {
        throw new Error("redis down");
      },
    };
    const result = await enforceRateLimit(
      "ip",
      { prefix: "t", max: 5, window: "1 m" },
      { limiter },
    );
    expect(result.ok).toBe(true);
  });
});

describe("retryAfterSeconds", () => {
  test("computes seconds until reset", () => {
    expect(retryAfterSeconds({ ok: false, reset: 10_000 }, 4_000)).toBe(6);
  });

  test("defaults to 60s when reset is absent", () => {
    expect(retryAfterSeconds({ ok: false })).toBe(60);
  });

  test("never returns less than 1", () => {
    expect(retryAfterSeconds({ ok: false, reset: 1_000 }, 5_000)).toBe(1);
  });
});

describe("assertUpstashConfig", () => {
  test("does nothing outside production, even when inconsistent", () => {
    expect(() =>
      assertUpstashConfig({
        url: "https://example.upstash.io",
        token: undefined,
        isProduction: false,
      }),
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
      assertUpstashConfig({
        url: "https://example.upstash.io",
        token: undefined,
        isProduction: true,
      }),
    ).toThrow(/Upstash misconfiguration/);
  });

  test("throws in production when only the token is set", () => {
    expect(() => assertUpstashConfig({ url: undefined, token: "tok", isProduction: true })).toThrow(
      /Upstash misconfiguration/,
    );
  });
});
