import { expect, test } from "bun:test";

import { findClientBundleSecrets } from "./verify-client-bundle.mjs";

const clean = { path: "assets/index.js", text: 'const url = "https://x.supabase.co";' };

test("a bundle with only public config is clean", () => {
  expect(findClientBundleSecrets([clean], { VITE_SUPABASE_ANON_KEY: "public-anon-key" })).toEqual(
    [],
  );
});

test("flags a server-only variable name, which means server code was bundled", () => {
  const leaked = { path: "assets/a.js", text: "process.env.SUPABASE_SERVICE_ROLE_KEY" };
  expect(findClientBundleSecrets([leaked], {})).toEqual([
    "assets/a.js: contains the name SUPABASE_SERVICE_ROLE_KEY",
  ]);
});

test("flags well-known secret formats", () => {
  const leaked = {
    path: "assets/b.js",
    text: 'k="sk_live_0123456789abcdef";w="whsec_0123456789abcdef";-----BEGIN PRIVATE KEY-----',
  };
  expect(findClientBundleSecrets([leaked], {})).toHaveLength(3);
});

test("flags an inlined secret value without printing it", () => {
  const secret = "super-secret-service-role-value";
  const findings = findClientBundleSecrets([{ path: "assets/c.js", text: `x="${secret}"` }], {
    SUPABASE_SERVICE_ROLE_KEY: secret,
  });
  expect(findings).toEqual(["assets/c.js: contains the value of SUPABASE_SERVICE_ROLE_KEY"]);
  expect(findings.join("\n")).not.toContain(secret);
});

test("ignores short values that would match by chance", () => {
  expect(findClientBundleSecrets([{ path: "a.js", text: "abc" }], { CRON_SECRET: "abc" })).toEqual(
    [],
  );
});
