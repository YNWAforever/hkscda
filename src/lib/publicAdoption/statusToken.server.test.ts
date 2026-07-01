import { describe, expect, test } from "bun:test";

import { createStatusTokenPair, hashStatusToken, isTokenExpired } from "./statusToken.server";

describe("status tokens", () => {
  test("creates a long raw token and stores only the hash", () => {
    const pair = createStatusTokenPair(() => Buffer.alloc(32, 7));
    expect(pair.rawToken).toHaveLength(43);
    expect(pair.tokenHash).toBe(hashStatusToken(pair.rawToken));
    expect(pair.tokenHash).not.toBe(pair.rawToken);
  });

  test("classifies expired tokens", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    expect(isTokenExpired("2026-07-01T23:59:59.000Z", now)).toBe(true);
    expect(isTokenExpired("2026-07-03T00:00:00.000Z", now)).toBe(false);
  });
});
