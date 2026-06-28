import { describe, expect, test } from "bun:test";

import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimiter,
} from "./rate-limit.server";

function request(headers: Record<string, string>): Request {
  return new Request("https://example.test", { headers });
}

describe("getClientIp", () => {
  test("returns the first x-forwarded-for entry", () => {
    expect(getClientIp(request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7",
    );
  });

  test("trims whitespace around the first entry", () => {
    expect(getClientIp(request({ "x-forwarded-for": "  198.51.100.2 ,10.0.0.1" }))).toBe(
      "198.51.100.2",
    );
  });

  test("falls back to x-real-ip", () => {
    expect(getClientIp(request({ "x-real-ip": "192.0.2.44" }))).toBe("192.0.2.44");
  });

  test("returns 'unknown' when no IP headers are present", () => {
    expect(getClientIp(request({}))).toBe("unknown");
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
