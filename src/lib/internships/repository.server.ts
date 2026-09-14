import type { SupabaseClient } from "@supabase/supabase-js";
import type { InternshipRepository } from "./service";
export function createInternshipRepository(client: SupabaseClient): InternshipRepository {
  return {
    async command(actor, command) {
      const input = command as {
        action: string;
        page?: number;
        pageSize?: number;
        status?: string;
        q?: string;
        application_id?: string;
      };
      if (input.action === "list" || input.action === "detail") {
        // Defense in depth: these service-role reads require an active staff actor.
        const access = await client
          .from("admin_user")
          .select("role,status")
          .eq("auth_user_id", actor)
          .maybeSingle();
        if (access.error) throw access.error;
        if (
          !access.data ||
          access.data.status !== "active" ||
          !["staff", "admin"].includes(access.data.role)
        )
          throw Object.assign(new Error("Staff required"), { code: "42501" });
        if (input.action === "list") {
          const page = input.page ?? 1,
            pageSize = input.pageSize ?? 25;
          let query = client
            .from("internship_application")
            .select(
              "id,revision,status,shelter,created_at,contact_snapshot->name,student_snapshot->institution",
              { count: "exact" },
            )
            .order("created_at", { ascending: false })
            .order("id", { ascending: false });
          if (input.q)
            query = query.ilike(
              "contact_snapshot->>name",
              `%${input.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
            );
          if (input.status) query = query.eq("status", input.status);
          const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
          if (result.error) throw result.error;
          return {
            kind: "applications",
            applications: result.data,
            total: result.count ?? 0,
            page,
            pageSize,
          };
        }
        const [application, events, attachments] = await Promise.all([
          client
            .from("internship_application")
            .select("*")
            .eq("id", input.application_id)
            .maybeSingle(),
          client
            .from("internship_event")
            .select("id,kind,detail,created_at")
            .eq("application_id", input.application_id)
            .order("created_at")
            .order("id"),
          client
            .from("internship_attachment")
            .select("id,label")
            .eq("application_id", input.application_id)
            .order("created_at")
            .order("id"),
        ]);
        if (application.error || events.error || attachments.error)
          throw application.error ?? events.error ?? attachments.error;
        return application.data
          ? {
              kind: "application",
              application: {
                ...application.data,
                events: events.data,
                attachments: attachments.data,
              },
            }
          : { kind: "not_found" };
      }
      const { data, error } = await client.rpc("internship_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data;
    },
  };
}
