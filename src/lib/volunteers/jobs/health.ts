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
  diagnostic?: { code: string | null; stage?: VolunteerJobStage; since?: string };
};
export type VolunteerHealthRun = {
  status: string;
  finished_at: string | null;
  bucket?: string;
  result?: unknown;
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
  for (const run of ordered) {
    if (run.status === "running") continue;
    if (run.status !== "failed") break;
    consecutiveFailures++;
    failureSince = run.finished_at ?? failureSince;
  }
  const ageSince = success?.finished_at ?? ordered.at(-1)?.finished_at ?? ordered.at(-1)?.bucket;
  const stale = !!ageSince && now.getTime() - Date.parse(ageSince) > periodMs * 2;
  const health: VolunteerJobHealth = {
    lastSuccessAt: success?.finished_at ?? null,
    lastFailureAt: failure?.finished_at ?? null,
    consecutiveFailures,
    state: consecutiveFailures >= 2 || stale ? "degraded" : success ? "healthy" : "unknown",
  };
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
