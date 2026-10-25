import type { SupabaseClient } from "@supabase/supabase-js";
import { volunteerJobHealth, type VolunteerJobHealth, type VolunteerHealthRun } from "./health";
export async function readVolunteerJobHealth(
  client: SupabaseClient,
  now = () => new Date(),
  signal?: AbortSignal,
  includeDiagnostics = false,
): Promise<VolunteerJobHealth> {
  const unknown: VolunteerJobHealth = {
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    state: "unknown",
  };
  try {
    const recentQuery = client
      .from("volunteer_runtime_job_run")
      .select(
        includeDiagnostics
          ? "status,finished_at:updated_at,bucket,result,lease_until"
          : "status,finished_at:updated_at,bucket,lease_until",
      )
      .eq("job_key", "volunteer-hourly")
      .order("bucket", { ascending: false })
      .limit(50);
    const successQuery = client
      .from("volunteer_runtime_job_run")
      .select("status,finished_at:updated_at,bucket")
      .eq("job_key", "volunteer-hourly")
      .eq("status", "complete")
      .order("bucket", { ascending: false })
      .limit(1);
    const [recent, success] = await Promise.all([
      signal ? recentQuery.abortSignal(signal) : recentQuery,
      (signal ? successQuery.abortSignal(signal) : successQuery).maybeSingle(),
    ]);
    if (recent.error || success.error) return unknown;
    const runs = [
      ...(recent.data ?? []),
      ...(success.data ? [success.data] : []),
    ] as VolunteerHealthRun[];
    const unique = [...new Map(runs.map((run) => [run.bucket, run])).values()];
    return volunteerJobHealth(unique, now(), undefined, includeDiagnostics);
  } catch {
    return unknown;
  }
}
