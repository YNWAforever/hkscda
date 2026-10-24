import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import { createOverviewHandler, overviewStatKeys } from "./overview";
import { readVolunteerCoverage } from "./sessionCoverage.server";
import { readPendingSnapshot } from "./pending";
import { readVolunteerJobHealth } from "./jobs/health.server";
import { logVolunteerFailure } from "./telemetry.server";
export async function handleVolunteerOverview(request: Request, countTimeoutMs = 5_000) {
  const client = createSupabaseServiceClient();
  let actorId = "";
  let jobDiagnostics = false;
  return createOverviewHandler({
    authorize: async (request) => {
      const actor = await requireAdmin(request, ["staff", "admin"], client);
      actorId = actor.authUserId;
      jobDiagnostics = actor.role === "admin";
    },
    readCoverage: (query) => readVolunteerCoverage(client, query),
    readHealth: (signal) => readVolunteerJobHealth(client, undefined, signal, jobDiagnostics),
    reportFailure: (part, error) => logVolunteerFailure(`overview_${part}`, error),
    read: async (range, snapshot, selected = overviewStatKeys) => {
      const signals = overviewStatKeys.map((key) =>
        selected.includes(key) ? AbortSignal.timeout(countTimeoutMs) : undefined,
      );
      const actions = [
        "overview_pending_profiles",
        "overview_pending_registrations",
        "overview_today_activities",
      ];
      const report = (index: number, error: unknown) =>
        logVolunteerFailure(actions[index], signals[index]?.aborted ? { code: "TIMEOUT" } : error);
      const observe = async <T>(operation: PromiseLike<T>, index: number): Promise<T> => {
        try {
          const value = await operation;
          if (value && typeof value === "object" && "error" in value && value.error)
            report(index, value.error);
          return value;
        } catch (error) {
          report(index, error);
          throw error;
        }
      };
      const results = await Promise.allSettled([
        observe<{ count: number | null; error: unknown }>(
          selected.includes("pendingProfiles")
            ? client
                .from("volunteer_profile")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending")
                .abortSignal(signals[0]!)
            : Promise.resolve({ count: null, error: null }),
          0,
        ),
        observe(
          selected.includes("pendingRegistrations")
            ? readPendingSnapshot(
                async (args) => {
                  const { data, error } = await client
                    .rpc("volunteer_pending_snapshot", args)
                    .abortSignal(signals[1]!);
                  if (error) throw error;
                  return data;
                },
                actorId,
                { scope: "all", pageSize: 0 },
                () => snapshot,
              )
            : Promise.resolve(null),
          1,
        ),
        observe<{ count: number | null; error: unknown }>(
          selected.includes("todayActivities")
            ? client
                .from("volunteer_activity")
                .select("id", { count: "exact", head: true })
                .gte("starts_at", range.from)
                .lt("starts_at", range.until)
                .eq("status", "published")
                .abortSignal(signals[2]!)
            : Promise.resolve({ count: null, error: null }),
          2,
        ),
      ]);
      const pending = results[1].status === "fulfilled" ? results[1].value : null;
      return {
        pendingProfiles:
          results[0].status === "fulfilled" && !results[0].value.error
            ? results[0].value.count
            : null,
        pendingRegistrations: pending?.counts.total ?? null,
        pendingBreakdown: pending?.counts ?? null,
        todayActivities:
          results[2].status === "fulfilled" && !results[2].value.error
            ? results[2].value.count
            : null,
      };
    },
  })(request);
}
