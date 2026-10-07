import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assertVolunteerFixtureUrl, volunteerFixtureUrl } from "./atomicForwardFixtureGuard";

const native = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const clone = "postgresql://supabase_admin:postgres@127.0.0.1:52322/r01_clone_" + "a".repeat(32);
const opted = { R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES: "1" };
const ci = { ...opted, CI: "true", GITHUB_ACTIONS: "true" };

test("Task8 admits the existing owned clone and exact opted GitHub native fixture", () => {
  expect(assertVolunteerFixtureUrl(clone, opted)).toBe("r01_clone_" + "a".repeat(32));
  expect(assertVolunteerFixtureUrl(native, ci)).toBe(native);
});

test("Task8 requires literal opt-in and GitHub identity for native admission", () => {
  for (const key of Object.keys(ci))
    for (const value of [undefined, "", "false", "TRUE", "0"])
      expect(() => assertVolunteerFixtureUrl(native, { ...ci, [key]: value })).toThrow();
  expect(() => assertVolunteerFixtureUrl(clone, {})).toThrow();
});

test("Task8 refuses remote, wrong identity, URL normalization and encoded bypasses", () => {
  for (const url of [
    native.replace("127.0.0.1", "localhost"),
    native.replace("127.0.0.1", "example.test"),
    native.replace("55322", "52322"),
    native.replace("55322", "57322"),
    native.replace("/postgres", "/template1"),
    native.replace("/postgres", "/r01_clone_" + "a".repeat(32)),
    native.replace("postgres:postgres", "supabase_admin:postgres"),
    native.replace("postgres:postgres", "postgres:wrong"),
    native.replace("postgresql:", "postgres:"),
    native + "?sslmode=disable",
    native + "#fragment",
    native.replace("postgres:postgres", "%70ostgres:postgres"),
    native.replace("127.0.0.1", "127.1"),
    native.replace("/postgres", "/%70ostgres"),
    native + "/",
    " " + native,
    native.replace("postgres:postgres", "postgres:%70ostgres"),
    native.replace("/postgres", "/other/../postgres"),
    native.replace("127.0.0.1", "[::1]"),
  ])
    expect(() => assertVolunteerFixtureUrl(url, ci)).toThrow();
});

test("the actual required Task8 suite fails before connecting when its opt-in pair is absent", () => {
  const environment: Record<string, string> = { R01_VOLUNTEER_REQUIRE_DATABASE: "1" };
  for (const key of ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "HOME"])
    if (process.env[key] !== undefined) environment[key] = process.env[key]!;
  const result = spawnSync(
    process.execPath,
    ["--no-env-file", "test", "./src/lib/volunteers/atomicForward.database.test.ts"],
    { cwd: new URL("../../../", import.meta.url), env: environment, encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Task8 fixture database URL required");
  expect(result.stderr).not.toContain("19 skip");
});

test("Task8 optional unit runs skip only with absent configuration", () => {
  expect(volunteerFixtureUrl({})).toBeUndefined();
  expect(volunteerFixtureUrl({ ...opted, R01_VOLUNTEER_TEST_DATABASE_URL: clone })).toBe(clone);
  expect(volunteerFixtureUrl({ ...ci, R01_VOLUNTEER_TEST_DATABASE_URL: native })).toBe(native);
});

test("Task8 required execution refuses missing and malformed fixture pairs", () => {
  for (const environment of [
    { R01_VOLUNTEER_REQUIRE_DATABASE: "1" },
    { R01_VOLUNTEER_REQUIRE_DATABASE: "0" },
    opted,
    { R01_VOLUNTEER_TEST_DATABASE_URL: native },
    { ...ci, R01_VOLUNTEER_TEST_DATABASE_URL: "" },
    { ...ci, R01_VOLUNTEER_TEST_DATABASE_URL: native, R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES: "true" },
  ])
    expect(() => volunteerFixtureUrl(environment)).toThrow();
});

test("CI requires Task8 immediately after fresh startup before other database suites", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  ).replaceAll("\r", "");
  const matrix = workflow.slice(workflow.indexOf("  rls-matrix:"));
  const step = matrix.match(
    /- name: Run Task8 volunteer atomic transaction tests\n([\s\S]*?)(?=\n {6}- name:)/,
  )?.[1];
  expect(step).toBeDefined();
  expect(step).toContain(
    "bun --no-env-file test --timeout 15000 src/lib/volunteers/atomicForward.database.test.ts",
  );
  expect(step).toContain('R01_VOLUNTEER_REQUIRE_DATABASE: "1"');
  expect(step).toContain('R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES: "1"');
  expect(step).toContain("R01_VOLUNTEER_TEST_DATABASE_URL: " + native);
  expect(step).not.toMatch(/continue-on-error:|skip|if:/);
  expect(matrix).toMatch(
    /- name: Start local Supabase stack\r?\n {8}run: \|\r?\n {10}bunx supabase@2\.120\.0 --agent=no --version\r?\n {10}bunx supabase@2\.120\.0 --agent=no start\r?\n\r?\n {6}- name: Run Task8 volunteer atomic transaction tests/,
  );
});
