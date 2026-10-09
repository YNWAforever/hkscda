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

  test("documents the public site origin and keeps it aligned with APP_URL", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(example).toContain("VITE_PUBLIC_SITE_ORIGIN=");

    // Decision D-1 has to move both in one edit. A canonical that disagrees with
    // the origin the app actually serves is worse than either value alone.
    const read = (name: string) =>
      example.match(new RegExp("^" + name + "=(.*)$", "m"))?.[1]?.trim();
    expect(read("VITE_PUBLIC_SITE_ORIGIN")).toBe(read("APP_URL"));
  });

  test("documents the background-job contract in .env.example, the runbook and both instruction files", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const runbook = readFileSync(join(process.cwd(), "docs/background-jobs-runbook.md"), "utf8");
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string }>;
    };

    for (const name of [
      "CRON_SECRET",
      "VOLUNTEER_JOB_ACTOR_ID",
      "SPONSORSHIP_JOB_ACTOR_ID",
      "RESEND_API_KEY",
      "RESEND_WEBHOOK_SECRET",
      "APP_URL",
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
      expect(runbook).toContain(name);
    }

    const cronPaths = (vercel.crons ?? []).map((cron) => cron.path);
    expect(cronPaths.length).toBeGreaterThan(0);
    for (const path of cronPaths) {
      expect(runbook).toContain(path);
    }

    const deploymentBullet =
      "- Vercel plan is Pro: the crons in vercel.json run at their declared schedules. Every /api/jobs/* route and /api/internal/readiness require CRON_SECRET; without it Vercel's cron calls get 401 and no background job runs. Environment-variable changes take effect only after a redeploy. Switch-on steps: docs/background-jobs-runbook.md.";
    for (const file of ["CLAUDE.md", "AGENTS.md"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toContain(deploymentBullet);
    }
  });
});
