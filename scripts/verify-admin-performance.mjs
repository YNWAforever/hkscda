import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const WARM_COUNT = 30;

function requireTarget(baseURL, allowedOrigin) {
  const target = new URL(baseURL);
  if (target.username || target.password || target.search || target.hash) {
    throw new Error("Target must be an origin without credentials or query parameters");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
  if (
    target.hostname === "hkscda.vercel.app" ||
    (!local && (target.protocol !== "https:" || target.origin !== allowedOrigin))
  ) {
    throw new Error("Use a disposable local target or an explicitly allowed staging origin");
  }
  return target;
}

export async function benchmarkScenario({
  baseURL,
  scenario,
  headers = {},
  allowedOrigin,
  allowMutations = false,
}) {
  const target = requireTarget(baseURL, allowedOrigin);
  const endpoint = new URL(scenario.path, target);
  if (
    endpoint.origin !== target.origin ||
    !endpoint.pathname.startsWith("/api/admin/") ||
    endpoint.hash
  ) {
    throw new Error("Only same-origin admin API scenarios are supported");
  }
  const method = scenario.method ?? "GET";
  const mutation = method !== "GET";
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method))
    throw new Error("Invalid method");
  if (mutation && !allowMutations) throw new Error("Mutation scenarios require allowMutations");
  if (
    mutation &&
    (!Array.isArray(scenario.requestBodies) ||
      scenario.requestBodies.length !== WARM_COUNT + 1 ||
      new Set(scenario.requestBodies.map((body) => JSON.stringify(body))).size !== WARM_COUNT + 1)
  ) {
    throw new Error(
      "Mutation benchmarks require 31 distinct prepared request bodies, including cold observation",
    );
  }
  const samples = [];
  for (let index = 0; index <= WARM_COUNT; index++) {
    const started = performance.now();
    const response = await fetch(endpoint, {
      method,
      headers: { ...headers, ...(mutation ? { "content-type": "application/json" } : {}) },
      body: mutation ? JSON.stringify(scenario.requestBodies[index]) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const durationMs = performance.now() - started;
    if (!response.ok)
      throw new Error(
        `Scenario ${scenario.name} returned HTTP ${response.status}; no response body retained`,
      );
    samples.push({
      durationMs,
      status: response.status,
      decodedBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
    });
  }
  const warmSamples = samples.slice(1);
  const sorted = warmSamples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  const p95Ms = percentile(0.95);
  const targetMs = mutation ? 1000 : 750;
  return {
    name: scenario.name,
    kind: scenario.kind,
    routeTemplate: scenario.routeTemplate ?? endpoint.pathname,
    method,
    cold: samples[0],
    coldDefinition: "First observed request; does not assert cleared server or database caches",
    warmSamples,
    p50Ms: percentile(0.5),
    p95Ms,
    targetMs,
    targetMet: p95Ms <= targetMs,
    maxGzipBytes: Math.max(...warmSamples.map((sample) => sample.gzipBytes)),
    gzipDefinition: "Local gzip of decoded response, not observed wire transfer",
    queryCount: null,
    sqlExplain: null,
  };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath)
    throw new Error(
      "Usage: node scripts/verify-admin-performance.mjs <synthetic-staging-manifest.json>",
    );
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    !manifest.fixtureId ||
    ![1000, 10000, 50000].includes(manifest.supporterCount) ||
    !Array.isArray(manifest.scenarios) ||
    !manifest.scenarios.length
  ) {
    throw new Error(
      "Manifest requires fixtureId, supporterCount (1000/10000/50000), and scenarios",
    );
  }
  const token = process.env.ADMIN_PERF_TOKEN;
  if (!token)
    throw new Error(
      "ADMIN_PERF_TOKEN is required for a synthetic role fixture; never use a real supporter session",
    );
  requireTarget(manifest.baseURL, process.env.ADMIN_PERF_ALLOWED_ORIGIN);
  const report = {
    schemaVersion: 1,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    fixtureId: manifest.fixtureId,
    supporterCount: manifest.supporterCount,
    origin: new URL(manifest.baseURL).origin,
    measuredAt: new Date().toISOString(),
    runtime: process.version,
    status: "incomplete",
    scenarios: [],
  };
  try {
    for (const scenario of manifest.scenarios) {
      report.scenarios.push(
        await benchmarkScenario({
          baseURL: manifest.baseURL,
          scenario,
          headers: { authorization: `Bearer ${token}` },
          allowedOrigin: process.env.ADMIN_PERF_ALLOWED_ORIGIN,
          allowMutations: process.env.ADMIN_PERF_ALLOW_MUTATIONS === "true",
        }),
      );
    }
    report.status = "complete";
  } finally {
    const output = path.resolve(
      process.env.ADMIN_PERF_OUTPUT ?? "artifacts/performance/admin-results.json",
    );
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
  }
  if (report.scenarios.some((scenario) => !scenario.targetMet)) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
