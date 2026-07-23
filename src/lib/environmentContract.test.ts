import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("deployment environment contract", () => {
  test("documents every Supabase variable required by server and browser clients", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
