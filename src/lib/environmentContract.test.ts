import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("deployment environment contract", () => {
  test("exposes the repository TypeScript check through the package scripts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
  });
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

  test("documents the server-only COD AlipayHK sandbox contract", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const runbook = readFileSync(join(process.cwd(), "docs/donations-runbook.md"), "utf8");

    for (const name of [
      "COD_ENV",
      "COD_MERCHANT_ID",
      "COD_SEGMENT_ID",
      "COD_AES_SECRET_BASE64",
      "COD_PRIVATE_KEY_BASE64",
      "COD_NOTIFICATION_PUBLIC_KEY_BASE64",
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
      expect(runbook).toContain(name);
    }

    expect(example).toMatch(/^COD_ENV=sandbox$/m);
    expect(example).not.toMatch(/^VITE_COD_/m);
    expect(runbook).toContain("sandbox-only");
    expect(runbook).toContain("merchant private key");
    expect(runbook).toContain("COD notification public key");
    expect(runbook).toContain("/api/webhooks/cod");
    expect(runbook).toContain("status refresh");
    expect(runbook).toContain("real sandbox smoke test");
  });
});
