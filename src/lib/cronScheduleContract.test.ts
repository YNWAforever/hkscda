import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// Path -> reason. A job paused by removing its vercel.json entry is listed here, in the same
// commit, so the pause is deliberate and reviewed. See docs/background-jobs-runbook.md.
const INTENTIONALLY_UNSCHEDULED: Record<string, string> = {};

interface VercelCron {
  path: string;
  schedule: string;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function compareCronSchedules(
  routes: string[],
  cronPaths: string[],
  exemptions: Record<string, string>,
): { missing: string[]; unrouted: string[]; staleExemptions: string[] } {
  const routeSet = new Set(routes);
  const cronSet = new Set(cronPaths);
  const exemptPaths = Object.keys(exemptions);

  return {
    missing: uniqueSorted(
      routes.filter((route) => !cronSet.has(route) && !exemptPaths.includes(route)),
    ),
    unrouted: uniqueSorted(cronPaths.filter((path) => !routeSet.has(path))),
    staleExemptions: uniqueSorted(
      exemptPaths.filter((path) => cronSet.has(path) || !routeSet.has(path)),
    ),
  };
}

const jobsDir = join(process.cwd(), "src/routes/api/jobs");
const jobsDirEntries = readdirSync(jobsDir, { withFileTypes: true });
const subdirectoriesOfJobsDir = jobsDirEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const routes = jobsDirEntries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.startsWith("-"),
  )
  .map((entry) => `/api/jobs/${entry.name.slice(0, -".ts".length)}`);

const { crons } = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  crons: VercelCron[];
};
const cronPaths = crons.map((cron) => cron.path);

describe("vercel cron schedule contract", () => {
  test("every job route has a cron and every cron has a job route", () => {
    expect(compareCronSchedules(routes, cronPaths, INTENTIONALLY_UNSCHEDULED)).toEqual({
      missing: [],
      unrouted: [],
      staleExemptions: [],
    });
  });

  test("job routes are flat .ts files so the contract sees them", () => {
    expect(subdirectoriesOfJobsDir).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(7);
  });

  test("every cron schedule has five fields", () => {
    for (const { schedule } of crons) expect(schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  test("the comparison reports each kind of mismatch", () => {
    expect(
      compareCronSchedules(
        ["/api/jobs/a", "/api/jobs/b", "/api/jobs/d"],
        ["/api/jobs/a", "/api/jobs/c", "/api/jobs/a"],
        { "/api/jobs/d": "paused", "/api/jobs/a": "stale", "/api/jobs/e": "gone" },
      ),
    ).toEqual({
      missing: ["/api/jobs/b"],
      unrouted: ["/api/jobs/c"],
      staleExemptions: ["/api/jobs/a", "/api/jobs/e"],
    });
  });
});
