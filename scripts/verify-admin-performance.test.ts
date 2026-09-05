import { createServer } from "node:http";
import { test, expect } from "bun:test";
import { benchmarkScenario } from "./verify-admin-performance.mjs";

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
