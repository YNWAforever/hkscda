import { describe, expect, test } from "bun:test";

import { redactSensitivePagePath } from "./analytics";

describe("redactSensitivePagePath", () => {
  test.each([
    ["/adoption/status/adopt-secret", "/adoption/status/[token]"],
    ["/sponsors/status/sponsor-secret", "/sponsors/status/[token]"],
    ["/volunteer/status/volunteer-secret", "/volunteer/status/[token]"],
  ])("redacts the token in %s", (pathname, expected) => {
    expect(redactSensitivePagePath(pathname)).toBe(expected);
  });

  test("leaves ordinary public routes to the normal analytics configuration", () => {
    expect(redactSensitivePagePath("/volunteer")).toBeUndefined();
    expect(redactSensitivePagePath("/sponsors")).toBeUndefined();
  });

  test("does not treat an incomplete status URL as a token route", () => {
    expect(redactSensitivePagePath("/adoption/status/")).toBeUndefined();
  });

  test("redacts a token route with a trailing slash", () => {
    expect(redactSensitivePagePath("/volunteer/status/secret/")).toBe("/volunteer/status/[token]");
  });
});
