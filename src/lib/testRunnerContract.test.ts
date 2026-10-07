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

/**
 * Counts the `setup-bun` steps in a workflow and how many of them read the version
 * from `.bun-version`. A step added without any version input trips neither the
 * hardcoded-version check nor a fixed count, so the two counts must match.
 */
function bunSetupSteps(workflow: string) {
  return {
    steps: workflow.match(/uses:\s*oven-sh\/setup-bun\b/g)?.length ?? 0,
    pinned: workflow.match(/bun-version-file:\s*\.bun-version\b/g)?.length ?? 0,
  };
}

test("every workflow reads the Bun version from .bun-version", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  expect(ci).not.toMatch(/bun-version:\s*\d/);

  const { steps, pinned } = bunSetupSteps(ci);
  expect(steps).toBeGreaterThan(0);
  expect(pinned).toBe(steps);
});

test("the setup-bun count catches a step that sets no version input", () => {
  const pinnedStep = [
    "      - uses: oven-sh/setup-bun@v2",
    "        with:",
    "          bun-version-file: .bun-version",
  ].join("\n");
  const bareStep = "      - uses: oven-sh/setup-bun@v2";

  expect(bunSetupSteps(pinnedStep + "\n" + pinnedStep)).toEqual({ steps: 2, pinned: 2 });
  expect(bunSetupSteps(pinnedStep + "\n" + bareStep)).toEqual({ steps: 2, pinned: 1 });
  expect(bunSetupSteps("      - uses: actions/checkout@v4")).toEqual({ steps: 0, pinned: 0 });
});
