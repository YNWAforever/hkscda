import type { VolunteerJobStage } from "./errors";
// A result's legacy error field may contain a message. Never display arbitrary
// strings solely because they resemble a SQLSTATE or provider code.
const diagnosticCodes: readonly string[] = [
  "42501",
  "22P02",
  "22023",
  "57014",
  "40001",
  "40P01",
  "23505",
  "23503",
  "23502",
  "42P01",
  "42703",
  "42883",
  "53300",
  "53400",
  "08000",
  "08001",
  "08006",
  "57P01",
  "P0001",
  "PGRST202",
  "PGRST204",
  "PGRST205",
  "PGRST301",
  "PGRST302",
  "UNEXPECTED",
  "VOLUNTEER_JOB_ACTOR_UNCONFIGURED",
  "VOLUNTEER_JOB_ACTOR_INVALID",
  "VOLUNTEER_JOB_ACTOR_INELIGIBLE",
  "VOLUNTEER_JOB_LEASE_LOST",
];
export type VolunteerJobHealth = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  state: "healthy" | "degraded" | "unknown";
  /** A run is still `running` after its lease ended, so nobody recorded its outcome. */
  expiredLease?: true;
  diagnostic?: { code: string | null; stage?: VolunteerJobStage; since?: string };
  retryCandidate?: { bucket: string; expectedUpdatedAt: string };
};
function openLease(run: VolunteerHealthRun, now: Date) {
  if (run.status !== "running" || typeof run.lease_until !== "string") return false;
  const lease = Date.parse(run.lease_until);
  // Equal to now still satisfies finish (`lease_until >= clock_timestamp()`).
  return Number.isFinite(lease) && lease >= now.getTime();
}
function expiredRunning(run: VolunteerHealthRun, now: Date) {
  return run.status === "running" && !openLease(run, now);
}
function finiteLease(lease: string | null | undefined) {
  if (typeof lease !== "string") return null;
  const parsed = Date.parse(lease);
  return Number.isFinite(parsed) ? parsed : null;
}
/** Current-hour rows an admin may retry. A running lease is eligible only after it has ended. */
function retryableCurrentRun(run: VolunteerHealthRun, now: Date) {
  const lease = finiteLease(run.lease_until);
  if (run.status === "failed")
    return run.lease_until === null || (lease !== null && lease <= now.getTime());
  if (run.status === "running") return lease !== null && lease < now.getTime();
  return false;
}
export type VolunteerHealthRun = {
  status: string;
  finished_at: string | null;
  bucket?: string;
  result?: unknown;
  lease_until?: string | null;
};
export function volunteerJobHealth(
  runs: VolunteerHealthRun[],
  now = new Date(),
  periodMs = 3600000,
  includeDiagnostics = false,
): VolunteerJobHealth {
  const ordered = [...runs].sort(
    (a, b) =>
      Date.parse(b.finished_at ?? b.bucket ?? "") - Date.parse(a.finished_at ?? a.bucket ?? ""),
  );
  const success = ordered.find((run) => run.status === "complete" && run.finished_at);
  const failure = ordered.find((run) => run.status === "failed" && run.finished_at);
  let consecutiveFailures = 0;
  let failureSince: string | null = null;
  let expiredLease = false;
  let countingFailures = true;
  let newestProblem: VolunteerHealthRun | undefined;
  for (const run of ordered) {
    // A lease that is still open is in progress. It splits the streak: older
    // failures are not consecutive with anything newer, and this row is not a
    // failure. Keep scanning so an older expired lease stays visible.
    if (openLease(run, now)) {
      countingFailures = false;
      continue;
    }
    if (expiredRunning(run, now)) {
      expiredLease = true;
      newestProblem ??= run;
      continue;
    }
    if (run.status !== "failed") break;
    if (!countingFailures) continue;
    newestProblem ??= run;
    consecutiveFailures++;
    failureSince = run.finished_at ?? failureSince;
  }
  const ageSince = success?.finished_at ?? ordered.at(-1)?.finished_at ?? ordered.at(-1)?.bucket;
  const stale = !!ageSince && now.getTime() - Date.parse(ageSince) > periodMs * 2;
  const health: VolunteerJobHealth = {
    lastSuccessAt: success?.finished_at ?? null,
    lastFailureAt: failure?.finished_at ?? null,
    consecutiveFailures,
    ...(expiredLease ? { expiredLease: true } : {}),
    state:
      consecutiveFailures >= 2 || stale || expiredLease
        ? "degraded"
        : success
          ? "healthy"
          : "unknown",
  };
  if (includeDiagnostics) {
    const current = runs.find(
      (run) =>
        run.bucket && Date.parse(run.bucket) === Math.floor(now.getTime() / 3_600_000) * 3_600_000,
    );
    if (
      current?.bucket &&
      current.finished_at &&
      Number.isFinite(Date.parse(current.finished_at)) &&
      retryableCurrentRun(current, now)
    )
      health.retryCandidate = {
        bucket: current.bucket,
        expectedUpdatedAt: current.finished_at,
      };
  }
  if (
    includeDiagnostics &&
    health.state !== "healthy" &&
    newestProblem &&
    expiredRunning(newestProblem, now)
  ) {
    // The row never finished, so its result payload is not a recorded diagnostic.
    return { ...health, diagnostic: { code: "VOLUNTEER_JOB_LEASE_LOST" } };
  }
  if (includeDiagnostics && health.state !== "healthy" && consecutiveFailures > 0 && failure) {
    const result = failure.result;
    const rawCode =
      result && typeof result === "object" && "error" in result ? result.error : undefined;
    const rawStage =
      result && typeof result === "object" && "stage" in result ? result.stage : undefined;
    const code = typeof rawCode === "string" && diagnosticCodes.includes(rawCode) ? rawCode : null;
    const stages: readonly string[] = [
      "preflight",
      "generate",
      "release",
      "promote",
      "assess",
      "defer",
      "finish",
    ];
    const stage =
      typeof rawStage === "string" && stages.includes(rawStage)
        ? (rawStage as VolunteerJobStage)
        : undefined;
    return {
      ...health,
      diagnostic: {
        code,
        ...(stage ? { stage } : {}),
        ...(failureSince ? { since: failureSince } : {}),
      },
    };
  }
  return health;
}
