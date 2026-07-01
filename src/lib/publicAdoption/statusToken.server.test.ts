import { describe, expect, test } from "bun:test";

import {
  buildPublicStatusSummary,
  createStatusTokenPair,
  hashStatusToken,
  isTokenExpired,
} from "./statusToken.server";

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

  test("maps status rows to a public-safe summary", () => {
    const summary = buildPublicStatusSummary({
      application: {
        id: "app-1",
        created_at: "2026-07-02T01:00:00.000Z",
        applicant_name: "Ada",
        email: "ada@example.com",
        phone: "9123 4567",
      },
      preferences: [{ rank: 1, animal_name_snapshot: "Mochi", animal_type_snapshot: "cat" }],
      visit: {
        date_range_start: "2026-07-10",
        date_range_end: "2026-07-24",
        preferred_time_windows: ["weekend_afternoon"],
        notes: "Call first",
      },
      token: {
        expires_at: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(summary).toEqual({
      reference: "APP-APP-1",
      submittedAt: "2026-07-02T01:00:00.000Z",
      applicantName: "Ada",
      contactSummary: "ada@example.com · 9123 4567",
      rankedAnimals: [{ rank: 1, name: "Mochi", type: "cat" }],
      visitPreference: {
        dateRangeStart: "2026-07-10",
        dateRangeEnd: "2026-07-24",
        preferredTimeWindows: ["weekend_afternoon"],
        notes: "Call first",
      },
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
  });
});
