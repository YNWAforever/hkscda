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

test("fresh Auth and the exact admin role lookup share one connection across changing actors", async () => {
  const result = await runFixture("role-fresh");
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  expect(result.users).toEqual([a, b, a]);
  expect(result.authorizations).toEqual(["Bearer actor-a", "Bearer actor-b", "Bearer actor-a"]);
  expect(result.roleReads).toEqual(
    [a, b, a].map((actor) => ({
      actor,
      status: "active",
      authorization: "Bearer synthetic-service-role",
    })),
  );
  expect(result.connections).toBe(1);
});

test("a fresh disabled role cannot reuse the preceding active role result", async () => {
  const result = await runFixture("role-disabled");
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  expect(result.users).toEqual([a, null, b]);
  expect(result.roleReads).toEqual([
    { actor: a, status: "active", authorization: "Bearer synthetic-service-role" },
    { actor: a, status: "disabled", authorization: "Bearer synthetic-service-role" },
    { actor: b, status: "active", authorization: "Bearer synthetic-service-role" },
  ]);
  expect(result.connections).toBe(1);
});
test("bounded read RPCs share the fresh Auth/role connection and never cache actors or results", async () => {
  const result = await runFixture("rpc-fresh");
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  expect(result.authorizations).toEqual(["Bearer actor-a", "Bearer actor-b", "Bearer actor-a"]);
  const reads = result.rpcReads as { body: string; fallback: boolean; authorization: string }[];
  expect(reads.map((row) => JSON.parse(row.body).p_actor)).toEqual([a, b, a]);
  expect(
    reads.every((row) => !row.fallback && row.authorization === "Bearer synthetic-service-role"),
  ).toBe(true);
  expect(result.values).toEqual([{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }]);
  expect(result.connections).toBe(1);
});
test("a freshly disabled actor cannot execute a bounded read RPC using the previous successful role", async () => {
  const result = await runFixture("rpc-disabled");
  expect(result.authorizations).toEqual(["Bearer actor-a", "Bearer actor-a", "Bearer actor-b"]);
  const reads = result.rpcReads as { body: string }[];
  expect(reads.map((row) => JSON.parse(row.body).p_actor)).toEqual([
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);
  expect(result.values).toEqual([{ ordinal: 1 }, null, { ordinal: 2 }]);
  expect((result.roleReads as { status: string }[]).map((row) => row.status)).toEqual([
    "active",
    "disabled",
    "active",
  ]);
});
test("the three bounded POST read schemas retain exact UTF-8 body and framing", async () => {
  const result = await runFixture("rpc-bounded");
  const reads = result.rpcReads as {
    path: string;
    body: string;
    fallback: boolean;
    bytes: number;
    contentLength: string;
  }[];
  const bodies = result.bodies as [string, string][];
  expect(reads.map((row) => row.body)).toEqual(bodies.map(([, body]) => body));
  expect(
    reads.every(
      (row) =>
        !row.fallback &&
        Number(row.contentLength) === Buffer.byteLength(row.body) &&
        row.bytes === Buffer.byteLength(row.body),
    ),
  ).toBe(true);
  expect(result.connections).toBe(1);
});
for (const encoding of ["gzip", "deflate", "br"])
  test(`bounded RPC ${encoding} decodes once without another upstream request or disabling negotiation`, async () => {
    const result = await runFixture("rpc-" + encoding);
    expect(result.value).toEqual({ value: "義工🌏", ordinal: 1 });
    expect(result.encoding).toBe(encoding);
    const reads = result.rpcReads as { fallback: boolean; acceptEncoding: string }[];
    expect(reads).toHaveLength(1);
    expect(reads[0].fallback).toBe(false);
    expect(reads[0].acceptEncoding.split(",").map((value) => value.trim())).toContain(encoding);
  });
test("write RPCs, caller read assertions, unbounded/extended bodies and nonstandard requests retain original fetch", async () => {
  const result = await runFixture("rpc-fallback");
  expect(result.requests).toBe(0);
  const rows = result.observed as { fallback: boolean; method: string; body: string }[];
  expect(rows).toHaveLength(29);
  expect(rows.every((row) => row.fallback)).toBe(true);
  expect(rows[0].body).toContain("attendance_apply");
  expect(rows[1].body).toContain('"operationType":"read"');
});
test("a configured proxy retains the original POST read RPC transport", async () => {
  const result = await runFixture("rpc-proxy");
  const rows = result.rpcReads as { fallback: boolean }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].fallback).toBe(true);
});
test("aborting a bounded RPC body closes its actual upstream response", async () => {
  expect(await runFixture("rpc-abort-body")).toEqual({
    errorName: "AbortError",
    requests: 1,
    upstreamClosed: true,
  });
});

test("unbounded, extended, duplicate and invalid role filters and all writes keep their original fetch", async () => {
  const result = await runFixture("role-fallback");
  const rows = result.observed as { fallback: boolean; method: string; body: string }[];
  expect(rows).toHaveLength(5);
  expect(rows.every((row) => row.fallback)).toBe(true);
  expect(rows.at(-1)).toMatchObject({ method: "POST", body: '{"status":"disabled"}' });
});

test("aborting an exact role read closes its actual upstream response", async () => {
  const result = await runFixture("role-abort-body");
  expect(result).toEqual({ errorName: "AbortError", requests: 1, upstreamClosed: true });
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
