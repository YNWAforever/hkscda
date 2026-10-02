import { test, expect } from "bun:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../../..");
const runner = "supabase/rls-tests/helpers/runR01AdoptionAtomic.ts";
const selector = "docs/evidence/audit-remediation-20260927/r01-forward/task-9-gates.py";
const finalFlags = [
  "normalDrop",
  "templatePreserved",
  "modernPreserved",
  "frozenInputsPreserved",
] as const;
async function finalization(state: "good" | "modern" | "frozen" | "template" | "missing-template") {
  // Execute the actual finally path with only its IO substituted; no SQL/provider work.
  const source = await readFile(resolve(root, runner), "utf8");
  const tail = source.slice(
    source.lastIndexOf("} finally {") + "} finally {".length,
    source.lastIndexOf("}"),
  );
  const body = new Bun.Transpiler({ loader: "ts" }).transformSync(tail);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const receipt: Record<string, unknown> = { testExit: 0, evidence: "complete sentinel" };
  const processStub = { exitCode: 0 };
  let written = "",
    closed = 0;
  const run = new AsyncFunction(
    "clone",
    "receipt",
    "modernBefore",
    "localSourceState",
    "modern",
    "frozen",
    "hash",
    "sourceBlobs",
    "writeFile",
    "resolve",
    "out",
    "mode",
    "process",
    "console",
    body,
  );
  await run(
    {
      close: async () => {
        closed++;
      },
      templatePreserved:
        state === "template" ? false : state === "missing-template" ? undefined : true,
    },
    receipt,
    "before",
    async () => (state === "modern" ? "changed" : "before"),
    "inert",
    "same",
    JSON.stringify,
    async () => (state === "frozen" ? "changed" : "same"),
    async (_path: string, text: string) => {
      written = text;
    },
    resolve,
    "inert",
    "inert",
    processStub,
    { log() {} },
  );
  expect(closed).toBe(1);
  const persisted = JSON.parse(written);
  expect(persisted.evidence).toBe("complete sentinel");
  return { receipt: persisted, exit: processStub.exitCode };
}
for (const [state, flag] of [
  ["modern", "modernPreserved"],
  ["frozen", "frozenInputsPreserved"],
  ["template", "templatePreserved"],
  ["missing-template", "templatePreserved"],
] as const)
  test(`actual finalization fails for ${state} preservation and retains receipt`, async () => {
    const result = await finalization(state);
    expect(result.exit).toBe(1);
    expect(result.receipt.error).toContain(flag);
  });
test("actual finalization accepts all final flags exactly true", async () => {
  const result = await finalization("good");
  expect(result.exit).toBe(0);
  expect(result.receipt.error).toBeUndefined();
});
async function selected(flag?: string, value?: unknown) {
  await mkdir(resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001"), {
    recursive: true,
  });
  const dir = await mkdtemp(
    resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-inert-"),
  );
  try {
    for (const mode of ["hosted", "modern", "component"]) {
      const folder = resolve(
        dir,
        ".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-" + mode + "-inert",
      );
      await mkdir(folder, { recursive: true });
      const receipt: Record<string, unknown> = {
        at: "2026-10-02T00:00:00Z",
        testExit: 0,
        frozenInputs: {},
        ...Object.fromEntries(finalFlags.map((k) => [k, true])),
      };
      if (flag && value === undefined) delete receipt[flag];
      else if (flag) receipt[flag] = value;
      await writeFile(resolve(folder, "receipt.json"), JSON.stringify(receipt));
    }
    // Run the real selector and same-map check only, before any gate/source/DB action.
    const source = await readFile(resolve(root, selector), "utf8");
    const prefix = source.slice(0, source.indexOf("paths=list("));
    const child = Bun.spawn(["python", "-c", prefix], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return await child.exited;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
for (const flag of finalFlags)
  for (const state of ["false", "missing"] as const)
    test(`actual gate selector rejects ${state} ${flag}`, async () => {
      expect(await selected(flag, state === "false" ? false : undefined)).toBe(1);
    });
test("actual gate selector accepts exact true clone flags", async () => {
  expect(await selected()).toBe(0);
});
