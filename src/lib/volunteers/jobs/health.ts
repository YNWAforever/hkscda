export type VolunteerJobHealth = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  state: "healthy" | "degraded" | "unknown";
};
export type VolunteerHealthRun = { status: string; finished_at: string | null; bucket?: string };
export function volunteerJobHealth(
  runs: VolunteerHealthRun[],
  now = new Date(),
  periodMs = 3600000,
): VolunteerJobHealth {
  const ordered = [...runs].sort(
    (a, b) =>
      Date.parse(b.finished_at ?? b.bucket ?? "") - Date.parse(a.finished_at ?? a.bucket ?? ""),
  );
  const success = ordered.find((run) => run.status === "complete" && run.finished_at);
  const failure = ordered.find((run) => run.status === "failed" && run.finished_at);
  let consecutiveFailures = 0;
  for (const run of ordered) {
    if (run.status === "running") continue;
    if (run.status !== "failed") break;
    consecutiveFailures++;
  }
  const ageSince = success?.finished_at ?? ordered.at(-1)?.finished_at ?? ordered.at(-1)?.bucket;
  const stale = !!ageSince && now.getTime() - Date.parse(ageSince) > periodMs * 2;
  return {
    lastSuccessAt: success?.finished_at ?? null,
    lastFailureAt: failure?.finished_at ?? null,
    consecutiveFailures,
    state: consecutiveFailures >= 2 || stale ? "degraded" : success ? "healthy" : "unknown",
  };
}
