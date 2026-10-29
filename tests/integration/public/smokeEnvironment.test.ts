import { expect, test } from "bun:test";

test("public smoke fixtures isolate inherited production and provider settings", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--no-env-file",
      "test",
      "--isolate",
      "./tests/integration/public/smoke.test.ts",
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: {
        ...process.env,
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VITE_TURNSTILE_SITE_KEY: "smoke-site-key",
        TURNSTILE_SECRET_KEY: "smoke-secret-key",
        UPSTASH_REDIS_REST_URL: "https://smoke-redis.invalid",
        UPSTASH_REDIS_REST_TOKEN: "smoke-redis-token",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}, 30_000);
