import { describe, expect, test } from "bun:test";

import { AdminApiError, AdminHttpError, AdminSessionError } from "../../lib/admin/session";
import { isLapsedSession, shouldRetryQuery } from "./failureClass";

describe("isLapsedSession", () => {
  test.each([
    ["a not-signed-in session error", new AdminSessionError("not_signed_in")],
    ["an identity-changed session error", new AdminSessionError("identity_changed")],
    ["a 401 from fetchAdminJson", new AdminHttpError("API request failed", 401)],
    ["a structured 401", new AdminApiError({ status: 401, message: "no" })],
  ])("is true for %s", (_name, error) => {
    expect(isLapsedSession(error)).toBe(true);
  });

  test.each([
    ["a 403", new AdminHttpError("nope", 403)],
    ["a 500", new AdminHttpError("boom", 500)],
    ["a network failure", new AdminHttpError("Failed to fetch", null)],
    ["a plain error", new Error("offline")],
    ["a non-error", "401"],
    ["null", null],
  ])("is false for %s", (_name, error) => {
    expect(isLapsedSession(error)).toBe(false);
  });
});

describe("shouldRetryQuery", () => {
  test("never retries a lapsed session, so the expiry redirect is immediate", () => {
    for (const error of [
      new AdminSessionError("not_signed_in"),
      new AdminHttpError("API request failed", 401),
    ]) {
      expect(shouldRetryQuery(0, error)).toBe(false);
    }
  });

  test("keeps React Query's three retries for any other failure", () => {
    const error = new AdminHttpError("boom", 500);
    expect([0, 1, 2, 3, 4].map((count) => shouldRetryQuery(count, error))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(shouldRetryQuery(0, new Error("offline"))).toBe(true);
  });
});
