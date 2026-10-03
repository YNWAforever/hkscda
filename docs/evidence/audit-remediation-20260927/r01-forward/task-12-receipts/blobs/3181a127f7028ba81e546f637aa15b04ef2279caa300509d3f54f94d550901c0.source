import { expect, test } from "bun:test";
import { assertGroupFixtureUrl } from "./atomicForwardFixtureGuard";
const ciUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const ci = { CI: "true", GITHUB_ACTIONS: "true", R01_GROUP_ENQUIRY_ALLOW_LOCAL_FIXTURES: "1" };
test("group fixture guard admits only exact opted GitHub CI and existing owned clone", () => {
  expect(assertGroupFixtureUrl(ciUrl, ci)).toBe(ciUrl);
  const clone = "postgresql://supabase_admin:postgres@127.0.0.1:52322/r01_clone_" + "a".repeat(32);
  expect(assertGroupFixtureUrl(clone, { R01_GROUP_ENQUIRY_ALLOW_LOCAL_FIXTURES: "1" })).toBe(
    "r01_clone_" + "a".repeat(32),
  );
});
test("group CI guard refuses missing or nonliteral flags and non-CI use", () => {
  for (const key of Object.keys(ci))
    for (const value of [undefined, "false", "TRUE", "0", ""])
      expect(() => assertGroupFixtureUrl(ciUrl, { ...ci, [key]: value })).toThrow();
  expect(() => assertGroupFixtureUrl(ciUrl, {})).toThrow();
});
test("group CI guard refuses wrong host port database user protocol and suffix", () => {
  for (const url of [
    ciUrl.replace("127.0.0.1", "localhost"),
    ciUrl.replace("127.0.0.1", "example.test"),
    ciUrl.replace("55322", "57322"),
    ciUrl.replace("/postgres", "/other"),
    ciUrl.replace("postgres:postgres", "supabase_admin:postgres"),
    ciUrl.replace("postgresql:", "postgres:"),
    ciUrl + "?sslmode=disable",
    ciUrl + "#fragment",
  ])
    expect(() => assertGroupFixtureUrl(url, ci)).toThrow();
});
