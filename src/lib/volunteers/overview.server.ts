import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import { createOverviewHandler } from "./overview";
import { readVolunteerCoverage } from "./sessionCoverage.server";
export async function handleVolunteerOverview(request: Request) {
  const client = createSupabaseServiceClient();
  return createOverviewHandler({
    authorize: (request) => requireAdmin(request, ["staff", "admin"], client),
    readCoverage: (query) => readVolunteerCoverage(client, query),
    read: async (range) => {
      const results = await Promise.allSettled([
        client
          .from("volunteer_profile")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        client
          .from("volunteer_registration")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        client
          .from("volunteer_activity")
          .select("id", { count: "exact", head: true })
          .gte("starts_at", range.from)
          .lt("starts_at", range.until)
          .eq("status", "published"),
      ]);
      const counts = results.map((r) =>
        r.status === "fulfilled" && !r.value.error ? r.value.count : null,
      );
      return {
        pendingProfiles: counts[0],
        pendingRegistrations: counts[1],
        todayActivities: counts[2],
      };
    },
  })(request);
}
