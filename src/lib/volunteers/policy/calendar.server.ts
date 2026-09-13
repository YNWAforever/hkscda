import { z } from "zod";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import type { PolicyDraft } from "./schemas";
const rangeSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
  })
  .refine((v) => {
    const duration = Date.parse(v.until) - Date.parse(v.from);
    return duration > 0 && duration <= 93 * 86400000;
  });
type Activity = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number;
  shelter_key: string | null;
  status: string;
  group_headcount: number;
  policy_version_id: string | null;
  policy_revision: number;
};
export async function readVolunteerCalendar(request: Request) {
  try {
    const client = createSupabaseServiceClient();
    await requireAdmin(request, ["staff", "admin"], client);
    const range = rangeSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await client
      .from("volunteer_activity")
      .select(
        "id,title,starts_at,ends_at,location,capacity,shelter_key,status,group_headcount,policy_version_id,policy_revision",
      )
      .lt("starts_at", range.until)
      .or(`ends_at.gt.${range.from},and(ends_at.is.null,starts_at.gte.${range.from})`)
      .order("starts_at")
      .limit(1000);
    if (error) throw error;
    const activities = (data ?? []) as Activity[];
    const ids = activities.map((a) => a.id);
    if (!ids.length)
      return Response.json({ activities: [] }, { headers: { "cache-control": "no-store" } });
    const [checks, counts, versions, registrations] = await Promise.all([
      client.rpc("volunteer_calendar_policy_checks", { p_ids: ids }),
      client.rpc("volunteer_activity_counts", { p_activity_ids: ids }),
      client
        .from("volunteer_policy_version")
        .select("id,body")
        .in(
          "id",
          activities.flatMap((a) => (a.policy_version_id ? [a.policy_version_id] : [])),
        ),
      client
        .from("volunteer_registration")
        .select(
          "id,activity_id,status,duty_role,profile_id,contact_name,notes,attendance_status,updated_at",
        )
        .in("activity_id", ids)
        .order("created_at")
        .limit(10000),
    ]);
    for (const result of [checks, counts, versions, registrations])
      if (result.error) throw result.error;
    const policyChecks = (checks.data ?? []) as {
      registration_id: string;
      tier: string | null;
      evaluation: { reason: string };
    }[];
    const unqualified = new Set(
      policyChecks
        .filter((c) =>
          [
            "verified_profile_required",
            "tier_not_allowed",
            "minimum_age_not_met",
            "credentials_required",
            "role_not_allowed",
          ].includes(c.evaluation.reason),
        )
        .map((c) => c.registration_id),
    );
    const policies = (versions.data ?? []) as { id: string; body: PolicyDraft }[];
    const roster = (registrations.data ?? []) as {
      id: string;
      activity_id: string;
      status: string;
      duty_role: string | null;
      profile_id: string | null;
      contact_name: string;
      notes: string | null;
      attendance_status: string;
      updated_at: string;
    }[];
    const countRows = (counts.data ?? []) as {
      activity_id: string;
      approved_participants: number;
      waitlisted_participants: number;
      pending_participants: number;
    }[];
    return Response.json(
      {
        activities: activities.map((a) => {
          const policy = policies.find((p) => p.id === a.policy_version_id)?.body;
          const people = roster.filter((r) => r.activity_id === a.id);
          const count = countRows.find((c) => c.activity_id === a.id);
          return {
            ...a,
            approved_participants: count?.approved_participants ?? 0,
            waitlisted_participants: count?.waitlisted_participants ?? 0,
            pending_participants: count?.pending_participants ?? 0,
            roster: people.map((person) => ({
              ...person,
              tier: policyChecks.find((c) => c.registration_id === person.id)?.tier ?? null,
              qualification_exception: unqualified.has(person.id),
            })),
            qualification_exceptions: people.filter((person) => unqualified.has(person.id)).length,
            policy,
            shortages:
              policy?.roles.flatMap((role) => {
                const occupied = people.filter(
                  (r) =>
                    r.status === "approved" &&
                    !unqualified.has(r.id) &&
                    (r.duty_role === role.key ||
                      (policy?.capacity.role_count_model === "leader_in_assistants" &&
                        role.key === "assistant" &&
                        r.duty_role === "leader")),
                ).length;
                return occupied < role.minimum
                  ? [{ role: role.label, missing: role.minimum - occupied }]
                  : [];
              }) ?? [],
          };
        }),
        truncated: activities.length === 1000 || roster.length === 10000,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return Response.json({ error: "日期範圍須在93日內" }, { status: 400 });
    console.error("Volunteer calendar read failed", error);
    return Response.json({ error: "未能載入義工月曆" }, { status: 500 });
  }
}
