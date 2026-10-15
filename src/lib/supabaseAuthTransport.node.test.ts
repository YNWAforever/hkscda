import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createSupabaseServiceClient } from "./supabase.server";

const directory = await mkdtemp(join(tmpdir(), "hkscda-auth-node-"));
afterAll(() => {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("hkscda-auth-node-"))
    throw new Error("Refuse to remove an unexpected fixture directory");
  return rm(target, { recursive: true, force: true });
});

async function runFixture(scenario: string) {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, "__test-fixtures__/supabaseAuthNode.ts")],
    outdir: directory,
    target: "node",
    naming: "auth-fixture.mjs",
  });
  expect(build.success).toBe(true);
  const process = Bun.spawn(["node", join(directory, "auth-fixture.mjs"), scenario], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const deadline = setTimeout(() => process.kill(), 4000);
  try {
    const output = await new Response(process.stdout).text();
    const errors = await new Response(process.stderr).text();
    expect(await process.exited).toBe(0);
    expect(errors).toBe("");
    return JSON.parse(output) as Record<string, unknown>;
  } finally {
    clearTimeout(deadline);
    if (process.exitCode === null) {
      process.kill();
      await process.exited;
    }
  }
}

test("Node Auth reads reuse one connection without reusing the previous actor's authorization", async () => {
  const result = await runFixture("fresh");
  expect(result.authorizations).toEqual(["Bearer actor-a", "Bearer actor-b", "Bearer actor-a"]);
  expect(result.users).toEqual(["actor-a", "actor-b", "actor-a"]);
  expect(result.connections).toBe(1);
});

test("a fresh Auth denial cannot reuse the preceding successful actor", async () => {
  const result = await runFixture("denied");
  expect(result.authorizations).toEqual(["Bearer actor-a", "Bearer rejected", "Bearer actor-b"]);
  expect(result.users).toEqual(["actor-a", null, "actor-b"]);
  expect(result.connections).toBe(1);
});

test("non-GET, RPC and query-bearing requests retain the original fetch path and payload", async () => {
  const result = await runFixture("fallback");
  expect(result.observed).toEqual([
    { method: "POST", path: "/auth/v1/user", body: '{"command":"unchanged"}', fallback: true },
    { method: "POST", path: "/rest/v1/rpc/example", body: '{"action":"apply"}', fallback: true },
    { method: "GET", path: "/auth/v1/user?unexpected=1", body: "", fallback: true },
  ]);
});

test("a configured proxy retains the caller's original fetch transport", async () => {
  const result = await runFixture("proxy");
  expect(result.observed).toEqual([
    { method: "GET", path: "/auth/v1/user", body: "", fallback: true },
  ]);
});

test("a pre-aborted Auth read never reaches the server", async () => {
  const result = await runFixture("abort-before");
  expect(result.errorName).toBe("AbortError");
  expect(result.requests).toBe(0);
});

test("aborting an Auth body closes the actual upstream response", async () => {
  const result = await runFixture("abort-body");
  expect(result.errorName).toBe("AbortError");
  expect(result.requests).toBe(1);
});

test("an empty Auth response preserves its status without crashing the Node request callback", async () => {
  const result = await runFixture("no-body");
  expect(result.status).toBe(204);
  expect(result.body).toBe("");
});

test("stalled Auth headers time out and close the actual upstream connection", async () => {
  const result = await runFixture("header-timeout");
  expect(result).toEqual({ errorName: "TimeoutError", requests: 1, upstreamClosed: true });
});

test("a stalled Auth body times out and errors the body reader while closing upstream", async () => {
  const result = await runFixture("body-timeout");
  expect(result).toEqual({ errorName: "TimeoutError", requests: 1, upstreamClosed: true });
});

test("Bun service client composition preserves the readonly native preconnect hook", () => {
  const before = Object.getOwnPropertyDescriptor(fetch, "preconnect");
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_URL = "http://127.0.0.1:9";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
    expect(createSupabaseServiceClient()).toBeDefined();
    expect(Object.getOwnPropertyDescriptor(fetch, "preconnect")).toEqual(before);
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
