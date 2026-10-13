import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import { createOverviewHandler } from "./overview";
import { readVolunteerCoverage } from "./sessionCoverage.server";
import { readPendingSnapshot } from "./pending";
export async function handleVolunteerOverview(request: Request) {
  const client = createSupabaseServiceClient();
  let actorId = "";
  return createOverviewHandler({
    authorize: async (request) => {
      const actor = await requireAdmin(request, ["staff", "admin"], client);
      actorId = actor.authUserId;
    },
    readCoverage: (query) => readVolunteerCoverage(client, query),
    read: async (range, snapshot) => {
      const results = await Promise.allSettled([
        client
          .from("volunteer_profile")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        readPendingSnapshot(
          async (args) => {
            const { data, error } = await client.rpc("volunteer_pending_snapshot", args);
            if (error) throw error;
            return data;
          },
          actorId,
          { scope: "all", pageSize: 0 },
          () => snapshot,
        ),
        client
          .from("volunteer_activity")
          .select("id", { count: "exact", head: true })
          .gte("starts_at", range.from)
          .lt("starts_at", range.until)
          .eq("status", "published"),
      ]);
      const counts = results.map((r) =>
        r.status === "fulfilled" && "error" in r.value && !r.value.error ? r.value.count : null,
      );
      return {
        pendingProfiles: counts[0],
        pendingRegistrations:
          results[1].status === "fulfilled" && "counts" in results[1].value
            ? results[1].value.counts.total
            : null,
        pendingBreakdown:
          results[1].status === "fulfilled" && "counts" in results[1].value
            ? results[1].value.counts
            : null,
        todayActivities: counts[2],
      };
    },
  })(request);
}
