import { expect, spyOn, test } from "bun:test";
import { authorizedCron } from "./auth.server";

// The missing-secret latch is module-level, so this file relies on a fresh module
// instance per test file (`bun test --isolate`, as CI runs it).
test("the default reporter logs the missing-secret error once in production", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  const consoleError = spyOn(console, "error").mockImplementation(() => {});
  try {
    const request = new Request("https://x");
    expect(authorizedCron(request, undefined)).toBe(false);
    expect(authorizedCron(request, undefined)).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      [
        "CRON_SECRET is not set in production: scheduled job requests are rejected with 401, so no background job runs. See docs/background-jobs-runbook.md.",
      ],
    ]);
  } finally {
    consoleError.mockRestore();
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});
