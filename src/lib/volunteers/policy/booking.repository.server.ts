import type { SupabaseClient } from "@supabase/supabase-js";
import { policyDraftSchema } from "./schemas";
import type { BookingRepository, PolicySession, VolunteerMe } from "./booking";
export function createBookingRepository(
  client: SupabaseClient,
  now = () => new Date(),
): BookingRepository {
  return {
    async claim(actor, command) {
      const { data, error } = await client.rpc("volunteer_profile_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data;
    },
    async command(actor, command) {
      const { data, error } = await client.rpc("volunteer_booking_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data;
    },
    async sessions() {
      const { data, error } = await client
        .from("volunteer_activity")
        .select(
          "id,title,starts_at,ends_at,location,capacity,policy_version_id,version:volunteer_policy_version(body)",
        )
        .eq("status", "published")
        .not("policy_version_id", "is", null)
        .gte("starts_at", now().toISOString())
        .order("starts_at")
        .limit(100);
      if (error) throw error;
      const { data: summaries, error: summaryError } = await client.rpc(
        "volunteer_public_session_summary",
        { p_ids: (data ?? []).map((row) => row.id) },
      );
      if (summaryError) throw summaryError;
      return (data ?? []).map((raw) => {
        const row = raw as unknown as Omit<PolicySession, "policy"> & {
          version: { body: unknown };
        };
        const parsed = policyDraftSchema.parse(row.version.body);
        // Explicit projection: no staff notes, actor IDs or private source metadata.
        return {
          id: row.id,
          summary: summaries?.[row.id],
          title: row.title,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          location: row.location,
          capacity: row.capacity,
          policy_version_id: row.policy_version_id,
          policy: {
            eligibility: parsed.eligibility,
            roles: parsed.roles,
            remarks: parsed.remarks,
            terms: parsed.terms,
          },
        };
      });
    },
    async terms() {
      const { data, error } = await client
        .from("volunteer_terms_version")
        .select("id,body,published_at")
        .lte("published_at", now().toISOString())
        .order("published_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const sessions = await this.sessions();
      const ids = [
        ...new Set(
          sessions.flatMap((session) =>
            session.policy.terms.version_id ? [session.policy.terms.version_id] : [],
          ),
        ),
      ];
      if (!ids.length) return data ?? [];
      const { data: pinned, error: pinnedError } = await client
        .from("volunteer_terms_version")
        .select("id,body,published_at")
        .in("id", ids)
        .lte("published_at", now().toISOString());
      if (pinnedError) throw pinnedError;
      return [...(data ?? []), ...(pinned ?? []).filter((term) => term.id !== data?.[0]?.id)];
    },
    async me(actor) {
      const { data: profile, error } = await client
        .from("volunteer_profile")
        .select("id,display_name,tier,status")
        .eq("auth_user_id", actor)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return { profile: null, registrations: [] };
      const { data: registrations, error: registrationError } = await client
        .from("volunteer_registration")
        .select("id,activity_id,status,attendance_status,notes")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (registrationError) throw registrationError;
      const { data: history, error: historyError } = await client.rpc("volunteer_my_history", {
        p_actor: actor,
      });
      if (historyError) throw historyError;
      return { profile, registrations: registrations ?? [], history } as VolunteerMe;
    },
  };
}
export async function requireVerifiedVolunteer(request: Request, client: SupabaseClient) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new Response("請先登入", { status: 401 });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Response("登入已過期，請重新登入", { status: 401 });
  if (!data.user.email_confirmed_at) throw new Response("請先驗證電郵", { status: 403 });
  return data.user.id;
}
