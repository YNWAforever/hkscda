import type { SupabaseClient } from "@supabase/supabase-js";
import { addHkDays } from "./bulk/service";
import { policyDraftSchema } from "./policy/schemas";
import { getSessionCoverage, type CoverageActivity, type CoveragePolicy } from "./sessionCoverage";
import type { OverviewCoverage } from "./overview";

type RawVersion = {
  id: string;
  template_key: string;
  body: unknown;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
};
type RawActivity = {
  id: string;
  template_key: string | null;
  shelter_key: string | null;
  starts_at: string;
  status: string;
  policy_version_id: string | null;
};

/** Service-role read after the overview handler has authorized staff/admin. */
export async function readVolunteerCoverage(
  client: SupabaseClient,
  { from, centre, now }: { from: string; centre: string; now: Date },
): Promise<OverviewCoverage> {
  const to30 = addHkDays(from, 29);
  const until = addHkDays(from, 30) + "T00:00:00+08:00";
  const start = from + "T00:00:00+08:00";
  const [versionResult, activityResult] = await Promise.all([
    client
      .from("volunteer_policy_version")
      .select("id,template_key,body,effective_from,effective_until,created_at", { count: "exact" })
      .order("effective_from", { ascending: false })
      .range(0, 500),
    client
      .from("volunteer_activity")
      .select("id,template_key,shelter_key,starts_at,status,policy_version_id", { count: "exact" })
      .gte("starts_at", start)
      .lt("starts_at", until)
      .order("starts_at")
      .range(0, 2000),
  ]);
  if (versionResult.error) throw versionResult.error;
  if (activityResult.error) throw activityResult.error;
  if (
    versionResult.count === null ||
    activityResult.count === null ||
    versionResult.count > 500 ||
    activityResult.count > 2000
  )
    throw new Error("coverage_read_truncated");

  const policies: CoveragePolicy[] = ((versionResult.data ?? []) as RawVersion[]).map((row) => {
    const parsed = policyDraftSchema.safeParse(row.body);
    if (!parsed.success) throw new Error("coverage_policy_invalid");
    const policy = parsed.data;
    if (typeof policy.schedule.start_time !== "string" || !Array.isArray(policy.schedule.weekdays))
      throw new Error("coverage_policy_unresolved");
    return {
      id: row.id,
      templateKey: row.template_key,
      name: policy.name,
      shelter: policy.shelter,
      effectiveFrom: row.effective_from,
      effectiveUntil: row.effective_until,
      createdAt: row.created_at,
      schedule: {
        enabled: policy.schedule.enabled,
        startTime: policy.schedule.start_time,
        weekdays: policy.schedule.weekdays,
        excludedDates: policy.schedule.excluded_dates,
        effectiveFrom: policy.schedule.effective_from,
        effectiveUntil: policy.schedule.effective_until,
      },
    };
  });
  const activities: CoverageActivity[] = ((activityResult.data ?? []) as RawActivity[]).map(
    (row) => ({
      id: row.id,
      templateKey: row.template_key,
      shelter: row.shelter_key,
      startsAt: row.starts_at,
      status: row.status,
      policyVersionId: row.policy_version_id,
    }),
  );
  const centres = [...new Set(policies.map((policy) => policy.shelter))].sort();
  const base = { from, centre, policies, activities };
  return {
    centres,
    next14: getSessionCoverage({ ...base, to: addHkDays(from, 13) }, now),
    next30: getSessionCoverage({ ...base, to: to30 }, now),
  };
}
