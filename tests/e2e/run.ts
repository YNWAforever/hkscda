/**
 * Builds the app against the E2E fake Supabase and runs the browser suites.
 *
 *   bun run test:e2e                 build, then run every tests/e2e suite
 *   E2E_SKIP_BUILD=1 bun run test:e2e   reuse the last E2E build
 *
 * The fake's URL is baked into the client bundle at build time, so an ordinary
 * `bun run build` cannot be reused here.
 */

const root = new URL("../../", import.meta.url).pathname;
const fakeUrl = "http://127.0.0.1:54331";
const env = {
  ...process.env,
  VITE_SUPABASE_URL: fakeUrl,
  VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
  SUPABASE_URL: fakeUrl,
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
};

async function run(command: string[]) {
  const child = Bun.spawn(command, { cwd: root, env, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}

if (process.env.E2E_SKIP_BUILD !== "1") await run(["bun", "run", "build"]);

const suites = (await Array.fromAsync(new Bun.Glob("tests/e2e/**/*.e2e.ts").scan(root))).map(
  (path) => `./${path}`,
);
await run(["bun", "test", "--timeout", "90000", ...suites]);
