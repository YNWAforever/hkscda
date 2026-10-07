import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readRepoFile(path: string): string {
  return readFileSync(new URL("../../" + path, import.meta.url), "utf8");
}

test("the package test script isolates each file, as CI does", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
  expect(pkg.scripts.test).toBe("bun test --isolate");
});

test("CI runs the unit suite through the package test script", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  expect(ci).toMatch(/- name: Test\r?\n\s+run: bun run test\r?\n/);
  expect(ci).not.toMatch(/run: bun test --isolate\s*$/m);
});

test(".bun-version pins one exact Bun release", () => {
  expect(readRepoFile(".bun-version").trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("every workflow reads the Bun version from .bun-version", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  expect(ci).not.toMatch(/bun-version:\s*\d/);
  expect(ci.match(/bun-version-file: \.bun-version/g)?.length).toBe(5);
});
