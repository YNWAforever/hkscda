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
    async sessions(query = { page: 1, query: "" }) {
      let request = client
        .from("volunteer_activity")
        .select(
          "id,title,starts_at,ends_at,location,capacity,policy_version_id,version:volunteer_policy_version(body)",
        )
        .eq("status", "published")
        .not("policy_version_id", "is", null)
        .gte("starts_at", now().toISOString())
        .order("starts_at")
        .order("id");
      if (query.shelter) request = request.eq("shelter_key", query.shelter);
      if (query.date) {
        const start = new Date(`${query.date}T00:00:00+08:00`);
        if (!Number.isFinite(start.getTime())) throw new Error("Invalid date");
        request = request
          .gte("starts_at", start.toISOString())
          .lt("starts_at", new Date(start.getTime() + 86400000).toISOString());
      }
      if (query.query) {
        const escaped = query.query.replace(/[,%().*\\]/g, " ").trim();
        if (escaped) request = request.or(`title.ilike.%${escaped}%,location.ilike.%${escaped}%`);
      }
      const { data, error } = await request.range((query.page - 1) * 25, query.page * 25);
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
          shelter: parsed.shelter,
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
    async terms(ids: string[] = []) {
      const { data, error } = await client
        .from("volunteer_terms_version")
        .select("id,body,published_at")
        .lte("published_at", now().toISOString())
        .order("published_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!ids.length) return data ?? [];
      const { data: pinned, error: pinnedError } = await client
        .from("volunteer_terms_version")
        .select("id,body,published_at")
        .in("id", ids)
        .lte("published_at", now().toISOString());
      if (pinnedError) throw pinnedError;
      return [...(data ?? []), ...(pinned ?? []).filter((term) => term.id !== data?.[0]?.id)];
    },
    async me(actor, query = { upcoming_page: 1, history_page: 1 }) {
      const { data: profile, error } = await client
        .from("volunteer_profile")
        .select("id,display_name,tier,status")
        .eq("auth_user_id", actor)
        .maybeSingle();
      if (error) throw error;
      const registrationsLimit = 25;
      if (!profile)
        return { profile: null, registrations: [], registrations_limit: registrationsLimit };
      const { data: page, error: registrationError } = await client.rpc(
        "volunteer_member_registrations",
        {
          p_actor: actor,
          p_upcoming_page: query.upcoming_page,
          p_history_page: query.history_page,
          p_size: 25,
        },
      );
      if (registrationError) throw registrationError;
      const { data: history, error: historyError } = await client.rpc("volunteer_my_history", {
        p_actor: actor,
      });
      if (historyError) throw historyError;
      return {
        profile,
        registrations_limit: registrationsLimit,
        upcoming_total: page.upcoming_total,
        history_total: page.history_total,
        upcoming_page: page.upcoming_page,
        history_page: page.history_page,
        page_size: page.page_size,
        registrations: (page.registrations as VolunteerMe["registrations"]).map((row) => ({
          id: row.id,
          activity_id: row.activity_id,
          status: row.status,
          attendance_status: row.attendance_status,
          notes: row.notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          actions: row.actions,
          activity: row.activity
            ? {
                id: row.activity.id,
                title: row.activity.title,
                starts_at: row.activity.starts_at,
                ends_at: row.activity.ends_at,
                location: row.activity.location,
              }
            : null,
        })),
        history,
      } as VolunteerMe;
    },
  };
}
export async function requireVerifiedVolunteer(
  request: Request,
  client: SupabaseClient,
  now = () => new Date(),
) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new Response("請先登入", { status: 401 });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Response("登入已過期，請重新登入", { status: 401 });
  const bannedUntil = data.user.banned_until;
  if (bannedUntil) {
    const expiry = Date.parse(bannedUntil);
    if (!Number.isFinite(expiry) || expiry > now().getTime())
      throw new Response("帳戶已暫停", { status: 403 });
  }
  if (!data.user.email_confirmed_at) throw new Response("請先驗證電郵", { status: 403 });
  return data.user.id;
}
