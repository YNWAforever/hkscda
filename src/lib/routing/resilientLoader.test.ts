import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { resilientPublicLoader } from "./resilientLoader";

describe("resilientPublicLoader", () => {
  test("passes a successful read through unchanged", async () => {
    const loader = resilientPublicLoader(async () => ({ items: [1, 2, 3] }));
    expect(await loader()).toEqual({ status: "ok", data: { items: [1, 2, 3] } });
  });

  test("never rejects when the read throws", async () => {
    const loader = resilientPublicLoader(async () => {
      throw new Error("supabase unreachable");
    });
    // The whole point: a rejected loader makes the document a 500.
    expect(await loader()).toEqual({ status: "error" });
  });

  test("never rejects when the read throws synchronously", async () => {
    const loader = resilientPublicLoader(() => {
      throw new Error("boom");
    });
    expect(await loader()).toEqual({ status: "error" });
  });

  test("does not swallow the cause silently", async () => {
    const seen: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void seen.push(args);
    try {
      await resilientPublicLoader(async () => {
        throw new Error("kept for the logs");
      })();
    } finally {
      console.error = original;
    }
    expect(seen.length).toBe(1);
  });
});

/**
 * Defect G-17. With Supabase unreachable these four routes returned HTTP 500 for
 * the whole document - no header, no logo, nothing actionable. Measured against a
 * build pointed at an unreachable host: before, /stories, /knowledge,
 * /adoption/instructions and /report/audit returned 500; after, all four return
 * 200 with a retry panel.
 */
describe("public routes that read Supabase degrade instead of failing", () => {
  const routes = [
    "src/routes/stories.tsx",
    "src/routes/knowledge.tsx",
    "src/routes/adoption/instructions.tsx",
    "src/routes/report/audit.tsx",
  ];

  for (const route of routes) {
    test(`${route} wraps its loader and renders an error branch`, () => {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source).toContain("resilientPublicLoader");
      expect(source).toContain('status === "error"');
    });
  }
});
