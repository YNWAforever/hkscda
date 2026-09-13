import { getEmailConfig } from "../../../../../lib/donations/config.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
import { createAssessmentHandlers } from "../../../../../lib/volunteers/assessment/http.server";
import type { AssessmentCommand } from "../../../../../lib/volunteers/assessment/schemas";
import { createAssessmentRepository } from "../../../../../lib/volunteers/assessment/service";

export function configuredAssessmentChannels() {
  return getEmailConfig().resendApiKey ? (["email"] as const) : ([] as const);
}

export function unavailableAssessmentChannels(body: unknown, available: readonly string[]) {
  if (!body || typeof body !== "object" || !("notifications" in body)) return [];
  const notifications = (body as { notifications?: unknown }).notifications;
  if (!notifications || typeof notifications !== "object") return [];
  const n = notifications as { enabled?: unknown; dry_run?: unknown; channels?: unknown };
  if (n.enabled !== true || n.dry_run === true || !Array.isArray(n.channels)) return [];
  return n.channels.filter(
    (channel): channel is string => typeof channel === "string" && !available.includes(channel),
  );
}

export function createHandlers() {
  const c = createSupabaseServiceClient(),
    r = createAssessmentRepository(c),
    available = configuredAssessmentChannels();
  return createAssessmentHandlers({
    requireActor: (q) => requireAdmin(q, ["admin"], c),
    execute: async (actor: string, command: AssessmentCommand) => {
      let body: unknown = command.kind === "save" ? command.body : undefined;
      if (command.kind === "publish") {
        const listed = await r.execute(actor, { kind: "list" });
        body =
          "draft" in listed ? (listed as { draft?: { body?: unknown } }).draft?.body : undefined;
      }
      const unavailable = unavailableAssessmentChannels(body, available);
      if (unavailable.length) {
        return {
          kind: "invalid" as const,
          issues: unavailable.map((channel) => `notification_channel_unavailable:${channel}`),
        };
      }
      const result = await r.execute(actor, command);
      if (command.kind === "list" && typeof result === "object" && result) {
        const { data: seniorCandidates, error } = await c
          .from("volunteer_tier_candidate")
          .select(
            "id,profile_id,candidate_tier,policy_version_id,trigger_kind,evidence,detected_at,profile:volunteer_profile(display_name)",
          )
          .order("detected_at", { ascending: false });
        if (error) throw error;
        return {
          ...result,
          available_channels: [...available],
          senior_candidates: seniorCandidates ?? [],
        };
      }
      return result;
    },
  });
}
