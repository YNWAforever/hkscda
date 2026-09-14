import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import assert from "node:assert/strict";
assert.equal(process.env.HKSCDA_LOCAL_PERFORMANCE, "1");
const phase = process.argv[2];
assert.ok(["before", "after"].includes(phase));
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336";
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actor = JSON.parse(
  await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"),
).admin;
const user = await service.auth.admin.getUserById(actor.id);
assert.ok(user.data.user.email.endsWith("@example.invalid"));
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email: user.data.user.email,
});
if (link.error) throw Error("Local auth failed");
const auth = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await auth.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error) throw Error("Local auth failed");
const token = verified.data.session.access_token;
const configPath = ".local-policy-test/operations-performance-dataset.json";
let dataset;
if (phase === "before") {
  const from = "2026-09-15T00:00:00+08:00",
    until = "2026-10-15T00:00:00+08:00";
  const counts = {};
  for (const table of [
    "volunteer_activity",
    "volunteer_registration",
    "volunteer_profile",
    "volunteer_policy_version",
  ]) {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    if (result.error) throw Error("Local dataset count failed");
    counts[table] = result.count;
  }
  dataset = { from, until, counts };
  await writeFile(configPath, JSON.stringify(dataset));
} else {
  dataset = JSON.parse(await readFile(configPath, "utf8"));
  const observedCounts = {};
  for (const table of Object.keys(dataset.counts)) {
    const r = await service.from(table).select("id", { count: "exact", head: true });
    if (r.error) throw Error("Local dataset count failed");
    observedCounts[table] = r.count;
  }
  dataset = {
    ...dataset,
    observedCounts,
    comparisonWarning:
      "Acceptance fixtures grew between HTTP runs. These timings are observations, not a matched dataset speedup. policy-read-performance.json compares a consistent snapshot.",
  };
}
const endpoints = [
  ["directory", "/api/admin/volunteers/people?limit=25"],
  ["activity_list", "/api/admin/volunteers/activities"],
  [
    "calendar",
    "/api/admin/volunteers/calendar?" +
      new URLSearchParams({ from: dataset.from, until: dataset.until }),
  ],
  ["policy_list", "/api/admin/volunteers/settings", { action: "list" }],
  ["public_sessions", "/api/volunteer/policy"],
];
const results = [];
for (const [name, path, body] of endpoints) {
  const samples = [];
  const run = async () => {
    const start = performance.now();
    let response;
    try {
      response = await fetch(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return { ms: performance.now() - start, bytes: 0, status: 0, error: "timeout_or_network" };
    }
    const bytes = (await response.arrayBuffer()).byteLength;
    return { ms: performance.now() - start, bytes, status: response.status };
  };
  const first = await run();
  for (let i = 0; i < (first.status === 200 ? 20 : 1); i++) samples.push(await run());
  const concurrent = [];
  for (let i = 0; i < (first.status === 200 ? 5 : 1); i++)
    concurrent.push(...(await Promise.all(Array.from({ length: 4 }, run))));
  const summarize = (rows) => {
    const times = rows.map((x) => x.ms).sort((a, b) => a - b);
    return {
      n: rows.length,
      p50_ms: times[Math.ceil(times.length * 0.5) - 1],
      p95_ms: times[Math.ceil(times.length * 0.95) - 1],
      bytes_min: Math.min(...rows.map((x) => x.bytes)),
      bytes_max: Math.max(...rows.map((x) => x.bytes)),
      statuses: [...new Set(rows.map((x) => x.status))],
    };
  };
  results.push({
    name,
    path,
    first_observation: first,
    sequential: summarize(samples),
    concurrency4: summarize(concurrent),
    samples,
    concurrent,
  });
  console.log(name, JSON.stringify(results.at(-1).sequential));
}
const sourceFiles = [
  "src/lib/volunteers/policy/calendar.server.ts",
  "src/lib/volunteers/policy/booking.repository.server.ts",
];
const hashes = {};
for (const p of sourceFiles) {
  try {
    hashes[p] = createHash("sha256")
      .update(await readFile(p))
      .digest("hex");
  } catch {}
}
const out = "docs/evidence/operations-release-20260915";
await mkdir(out, { recursive: true });
await writeFile(
  `${out}/performance-${phase}.json`,
  JSON.stringify(
    {
      phase,
      at: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      dirtyFiles: execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
        .trim()
        .split("\n"),
      runtime: process.version,
      mode: "Vite development loopback; first observation is not a proven cold cache; no network throttling",
      device: {
        platform: os.platform(),
        cpu: os.cpus()[0].model,
        memoryGB: Math.round(os.totalmem() / 2 ** 30),
      },
      dataset,
      sourceHashes: hashes,
      results,
    },
    null,
    2,
  ) + "\n",
);
