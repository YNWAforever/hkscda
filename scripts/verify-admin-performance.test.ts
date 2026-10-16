import { createServer } from "node:http";
import { test, expect } from "bun:test";
import {
  benchmarkScenario,
  readPerformanceDataset,
  classifyScenario,
} from "./verify-admin-performance.mjs";

test("pending body search remains a strict allowlisted read while attendance commands cannot claim read", () => {
  expect(
    classifyScenario({
      path: "/api/admin/volunteers/tasks",
      method: "POST",
      operationType: "read",
      requestBody: { action: "list", scope: "upcoming", page: 2, q: "50%_" },
    }),
  ).toBe("read");
  for (const action of ["attendance_preview", "attendance_apply"])
    expect(() =>
      classifyScenario({
        path: "/api/admin/volunteers/bulk",
        method: "POST",
        operationType: "read",
        requestBody: { action, operation_id: crypto.randomUUID() },
      }),
    ).toThrow();
});

test("volunteer counts accept real small fixtures and reject fabricated numeric metadata", () => {
  expect(
    readPerformanceDataset({
      dataset: {
        domain: "volunteers",
        counts: { actors: 5, profiles: 26, activities: 4, registrations: 4, notifications: 3 },
      },
    }).counts.profiles,
  ).toBe(26);
  for (const value of [-1, 1.5, NaN, "1000"])
    expect(() =>
      readPerformanceDataset({ dataset: { domain: "volunteers", counts: { profiles: value } } }),
    ).toThrow();
});
test("mutations retain the 1000ms gate and require 31 distinct prepared bodies", async () => {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    await expect(
      benchmarkScenario({
        baseURL: "http://127.0.0.1:9",
        allowMutations: true,
        scenario: {
          name: "repeat",
          path: "/api/admin/volunteers/bulk",
          method: "POST",
          operationType: "mutation",
          requestBodies: Array(31).fill({ action: "apply" }),
        },
      }),
    ).rejects.toThrow("31 distinct");
    expect(bodies).toHaveLength(0);
    const result = await benchmarkScenario({
      baseURL: "http://127.0.0.1:9",
      allowMutations: true,
      scenario: {
        name: "mutation",
        path: "/api/admin/volunteers/bulk",
        method: "POST",
        operationType: "mutation",
        requestBodies: Array.from({ length: 31 }, (_, id) => ({ action: "apply", id })),
      },
    });
    expect(bodies).toHaveLength(31);
    expect(result.targetMs).toBe(1000);
  } finally {
    globalThis.fetch = original;
  }
});
test("all known production aliases are rejected before any network request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Error("Network forbidden");
  }) as typeof fetch;
  try {
    for (const host of [
      "hkscda.vercel.app",
      "hkscda-ynwaforevers-projects.vercel.app",
      "hkscda-git-main-ynwaforevers-projects.vercel.app",
    ])
      await expect(
        benchmarkScenario({
          baseURL: "https://" + host,
          allowedOrigin: "https://" + host,
          scenario: { name: "blocked", path: "/api/admin/volunteers/overview" },
        }),
      ).rejects.toThrow();
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});

test("semantic POST read sends the same validated body for first1 plus warm30 at 750ms", async () => {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ fixture: true });
  }) as typeof fetch;
  try {
    const result = await benchmarkScenario({
      baseURL: "http://127.0.0.1:9",
      scenario: {
        name: "bulk-list",
        path: "/api/admin/volunteers/bulk/",
        method: "POST",
        operationType: "read",
        requestBody: { action: "list", filter: {}, page: 1 },
      },
    });
    expect(bodies).toHaveLength(31);
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(result.targetMs).toBe(750);
    expect(result.warmSamples).toHaveLength(30);
    expect(result.operationType).toBe("read");
  } finally {
    globalThis.fetch = original;
  }
});
test("caller read claims cannot bypass an unknown endpoint, invalid schema or any bulk write", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("Network forbidden");
  }) as typeof fetch;
  try {
    for (const [path, body] of [
      ["/api/admin/volunteers/bulk", { action: "apply" }],
      ["/api/admin/volunteers/bulk", { action: "preview" }],
      ["/api/admin/volunteers/bulk", { action: "select" }],
      ["/api/admin/volunteers/bulk", { action: "list", filter: { date_scope: "all" } }],
      ["/api/admin/unknown", { action: "list" }],
      ["/api/admin/volunteers/assessments", { action: "list" }],
    ]) {
      await expect(
        benchmarkScenario({
          baseURL: "http://127.0.0.1:9",
          allowMutations: true,
          scenario: {
            name: "unsafe",
            path,
            method: "POST",
            operationType: "read",
            requestBody: body,
          },
        }),
      ).rejects.toThrow();
    }
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});

test("admin measurement keeps cold separate and records thirty warm samples without response data", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ synthetic: "private fixture body" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    const result = await benchmarkScenario({
      baseURL: `http://127.0.0.1:${address.port}`,
      scenario: { name: "fixture", path: "/api/admin/fixture", kind: "list" },
      headers: {},
    });
    expect(result.warmSamples).toHaveLength(30);
    expect(result.cold.status).toBe(200);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
    expect(result.warmSamples[0].gzipBytes).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("private fixture body");
    expect(result.queryCount).toBeNull();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("admin measurement refuses non-admin paths and unauthorized mutation scenarios", async () => {
  await expect(
    benchmarkScenario({
      baseURL: "http://127.0.0.1:9",
      headers: {},
      scenario: { name: "bad", path: "/donate", kind: "list" },
    }),
  ).rejects.toThrow("admin API");
  await expect(
    benchmarkScenario({
      baseURL: "http://127.0.0.1:9",
      headers: {},
      scenario: {
        name: "bad",
        path: "/api/admin/content",
        kind: "mutation",
        method: "POST",
        body: {},
      },
    }),
  ).rejects.toThrow("allowMutations");
});
