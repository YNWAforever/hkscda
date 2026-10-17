import { expect, test } from "bun:test";
import { assertVolunteerFixtureTarget, validateCleanupManifest } from "./volunteer-daily-work";

test("fixture refuses production, alternate ports and caller-provided project aliases", () => {
  for (const url of [
    "https://hkscda.vercel.app",
    "https://iihqjzilgawhfdhdevam.supabase.co",
    "http://127.0.0.1:55321",
    "http://127.0.0.1:56321@evil.invalid",
    "http://127.0.0.1:56321/path",
  ]) {
    expect(() => assertVolunteerFixtureTarget(url, "AUDIT-20261013")).toThrow();
  }
  expect(() =>
    assertVolunteerFixtureTarget("http://127.0.0.1:56321", "AUDIT-20261013"),
  ).not.toThrow();
  expect(() => assertVolunteerFixtureTarget("http://127.0.0.1:56321", "%")).toThrow();
});

test("cleanup accepts only bounded typed IDs and an owned fixture prefix", () => {
  expect(() =>
    validateCleanupManifest({
      prefix: "AUDIT-20261013",
      fixtureId: "90000000-0000-4000-8000-000000000001",
      actorIds: [],
      profileIds: [],
      activityIds: [],
      registrationIds: [],
      userIds: [],
      outboxIds: [],
    }),
  ).not.toThrow();
  expect(() => validateCleanupManifest({ prefix: "%", table: "admin_user", ids: [] })).toThrow();
  expect(() =>
    validateCleanupManifest({ prefix: "AUDIT-20261013", fixtureId: "x", userIds: ["*"] }),
  ).toThrow();
});
