import { SQL } from "bun";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
assert.equal(process.env.HKSCDA_LOCAL_PERFORMANCE, "1");
const url = "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
const db = new SQL(url, { max: 1, prepare: false });
const lock = new SQL(url, { max: 1, prepare: false });
const actor = (await Bun.file(".local-policy-test/browser/synthetic-auth.json").json()).admin.id;
const stats = (samples: { ms: number; bytes: number }[]) => {
  const times = samples.map((x) => x.ms).sort((a, b) => a - b);
  return {
    n: samples.length,
    p50_ms: times[Math.ceil(times.length * 0.5) - 1],
    p95_ms: times[Math.ceil(times.length * 0.95) - 1],
    bytes_min: Math.min(...samples.map((x) => x.bytes)),
    bytes_max: Math.max(...samples.map((x) => x.bytes)),
  };
};
try {
  const results: Record<string, unknown> = {};
  // Same read-only dataset and transaction snapshot. The old command is retained for comparison.
  await db.unsafe("begin isolation level repeatable read");
  let oldResult: Record<string, unknown> | undefined,
    newResult: Record<string, unknown> | undefined;
  for (const mode of ["before", "after"]) {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const value =
        mode === "before"
          ? (
              await db`select public.volunteer_policy_command(${actor}::uuid,'{"action":"list"}'::jsonb) result`
            )[0].result
          : (await db`select public.volunteer_policy_settings_read(${actor}::uuid) result`)[0]
              .result;
      samples.push({
        ms: performance.now() - start,
        bytes: Buffer.byteLength(JSON.stringify(value)),
      });
      if (mode === "before") oldResult = value;
      else newResult = value;
    }
    results[mode] = { ...stats(samples), samples };
  }
  assert.deepEqual(
    (oldResult!.versions as { id: string }[]).map((x) => x.id).sort(),
    (newResult!.versions as { id: string }[]).map((x) => x.id).sort(),
  );
  const oldActivities = oldResult!.activities as { id: string; starts_at: string }[],
    newActivities = newResult!.activities as { id: string; starts_at: string }[];
  const boundary = [...oldActivities, ...newActivities]
    .map((x) => x.starts_at)
    .sort()
    .at(-1)!;
  // The old500-row cutoff had no tie-breaker. Compare complete dates before the tied boundary.
  assert.deepEqual(
    oldActivities
      .filter((x) => x.starts_at < boundary)
      .map((x) => x.id)
      .sort(),
    newActivities
      .filter((x) => x.starts_at < boundary)
      .map((x) => x.id)
      .sort(),
  );
  assert.equal(oldActivities.length, newActivities.length);
  await db.unsafe("rollback");
  await lock.unsafe("begin");
  await lock.unsafe("select pg_advisory_xact_lock(hashtextextended('volunteer-domain',0))");
  await db.unsafe("set statement_timeout='1000ms'");
  const start = performance.now();
  await db`select public.volunteer_policy_settings_read(${actor}::uuid)`;
  const readWithoutDomainLockMs = performance.now() - start;
  await lock.unsafe("rollback");
  const plan = await db.unsafe(
    "explain (analyze,buffers,format json) select a.id,a.starts_at from public.volunteer_activity a where a.starts_at>now() order by a.starts_at,a.id limit 500",
  );
  const artifact = {
    at: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    runtime: Bun.version,
    mode: "loopback PostgreSQL; before/after same repeatable-read snapshot; sequential20; no production speed claim",
    versions: (newResult!.versions as unknown[]).length,
    activities: (newResult!.activities as unknown[]).length,
    results,
    readWhileMutationLockHeld: { passed: true, ms: readWithoutDomainLockMs, timeoutMs: 1000 },
    plan,
  };
  await writeFile(
    "docs/evidence/operations-release-20260915/policy-read-performance.json",
    JSON.stringify(artifact, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ before: results.before, after: results.after, readWithoutDomainLockMs }),
  );
} finally {
  await lock.unsafe("rollback").catch(() => {});
  await db.unsafe("rollback").catch(() => {});
  await Promise.all([db.close(), lock.close()]);
}
