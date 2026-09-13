import { promotionDenial } from "./promotion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dueAssessmentPeriod, type VolunteerJobRepository } from "./service";
import { getEmailConfig } from "../../donations/config.server";
import { createResendMailProvider } from "../../notifications/provider.server";
import {
  createVolunteerNotificationDispatcher,
  type ClaimedNotification,
  confirmedAuthEmail,
} from "./notification.server";
const isoDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(d);
export function createVolunteerJobRepository(
  c: SupabaseClient,
  systemActorId: string,
): VolunteerJobRepository {
  async function actor() {
    const { data, error } = await c
      .from("admin_user")
      .select("auth_user_id")
      .eq("role", "admin")
      .eq("status", "active")
      .eq("auth_user_id", systemActorId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("volunteer_job_actor_missing");
    return data.auth_user_id as string;
  }
  return {
    async claim(bucket, owner, lease) {
      const { data, error } = await c.rpc("claim_volunteer_runtime_job", {
        p_job_key: "volunteer-hourly",
        p_bucket: bucket,
        p_owner: owner,
        p_lease_until: lease,
      });
      if (error) throw error;
      return data === true;
    },
    async finish(bucket, owner, status, result) {
      const { error } = await c.rpc("finish_volunteer_runtime_job", {
        p_job_key: "volunteer-hourly",
        p_bucket: bucket,
        p_owner: owner,
        p_status: status,
        p_result: result,
      });
      if (error) throw error;
    },
    async generate() {
      const { data, error } = await c.rpc("generate_due_volunteer_sessions", {
        p_actor: await actor(),
      });
      if (error) throw error;
      return Number(data);
    },
    async persistReleases() {
      const { data, error } = await c.rpc("volunteer_persist_due_releases", {
        p_actor: await actor(),
      });
      if (error) throw error;
      return Number(data);
    },
    async promote(now) {
      const a = await actor();
      let n = 0;
      let cursor: { created_at: string; id: string } | null = null;
      for (;;) {
        let query = c
          .from("volunteer_registration")
          .select("id,updated_at,created_at,activity:volunteer_activity!inner(starts_at)")
          .eq("status", "waitlisted")
          .gt("activity.starts_at", now.toISOString())
          .order("created_at")
          .order("id");
        if (cursor)
          query = query.or(
            `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
          );
        const { data, error } = await query.limit(200);
        if (error) throw error;
        for (const r of data ?? []) {
          const { data: x, error: e } = await c.rpc(
            "set_volunteer_registration_status_with_audit",
            {
              p_registration_id: r.id,
              p_actor_user_id: a,
              p_expected_updated_at: r.updated_at,
              p_status: "approved",
              p_internal_notes: "系統按候補先後及現行政策補位",
              p_update_internal_notes: true,
            },
          );
          if (e) {
            const denial = promotionDenial(e);
            if (!denial) throw e;
            if (denial.needsReview) {
              const queued = await c.rpc("record_volunteer_promotion_review", {
                p_actor: a,
                p_registration: r.id,
                p_reason: denial.reason,
              });
              if (queued.error) throw queued.error;
            }
            continue;
          }
          if (x?.kind === "updated") n++;
        }

        if (!data || data.length < 200) break;
        const last = data[data.length - 1];
        cursor = { created_at: last.created_at, id: last.id };
      }
      return n;
    },
    async assess(now) {
      const localDay = isoDay(now);
      const { data, error } = await c
        .from("volunteer_assessment_policy_version")
        .select("body")
        .lte("effective_from", localDay)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return false;
      const p = data.body as {
        assessment_day?: number;
        assessment_time?: string;
        shelter_scope?: string;
        short_month?: string;
      };
      const period = dueAssessmentPeriod(now, p);
      if (!period) return false;
      const a = await actor(),
        scope = p.shelter_scope === "separate" ? ["cat", "dog"] : ["combined"];
      for (const s of scope) {
        const { error: e } = await c.rpc("volunteer_assessment_command", {
          p_actor: a,
          p_command: { kind: "run", period_start: period, scope_key: s },
        });
        if (e) throw e;
      }
      return true;
    },
    async deferNotifications(now) {
      const { data, error } = await c.rpc("claim_volunteer_operation_outbox", {
        p_limit: 50,
        p_lease_until: new Date(now.getTime() + 300000).toISOString(),
      });
      if (error) throw error;
      const settle = async (
        job: ClaimedNotification,
        status: "queued" | "failed" | "provider_accepted",
        reason: string | null,
        availableAt: string | null,
        providerMessageId: string | null = null,
      ) => {
        const { data: settled, error: e } = await c.rpc("settle_volunteer_operation_outbox", {
          p_id: job.id,
          p_attempt: job.attempts,
          p_status: status,
          p_reason: reason,
          p_available_at: availableAt,
          p_provider_message_id: providerMessageId,
        });
        if (e) throw e;
        if (!settled) throw new Error("volunteer_notification_lease_lost");
      };
      const defer = async (job: ClaimedNotification, reason: string) =>
        settle(job, "queued", reason, new Date(now.getTime() + 3600000).toISOString());
      const dispatch = createVolunteerNotificationDispatcher({
        defer,
        async resolve(job) {
          const { data: profile, error: pe } = await c
            .from("volunteer_profile")
            .select("display_name,supporter_id,auth_user_id")
            .eq("id", job.payload.profile_id)
            .maybeSingle();
          if (pe) throw pe;
          if (!profile) return null;
          let recipient: string | null = null;
          if (profile.supporter_id) {
            const { data: supporter, error: se } = await c
              .from("supporter")
              .select("email")
              .eq("id", profile.supporter_id)
              .maybeSingle();
            if (se) throw se;
            recipient = supporter?.email ?? null;
          }
          if (!recipient) {
            const { data: authData, error: authError } = await c.auth.admin.getUserById(
              profile.auth_user_id,
            );
            if (authError) throw authError;
            recipient = confirmedAuthEmail(authData.user);
          }
          const { data: assessment, error: ae } = await c
            .from("volunteer_monthly_assessment")
            .select("policy_version_id")
            .eq("id", job.payload.assessment_id)
            .maybeSingle();
          if (ae) throw ae;
          if (!recipient || !assessment) return null;
          const { data: version, error: ve } = await c
            .from("volunteer_assessment_policy_version")
            .select("body")
            .eq("id", assessment.policy_version_id)
            .maybeSingle();
          if (ve) throw ve;
          const body = version?.body as
            | { notifications?: { regular_template?: string; senior_template?: string } }
            | undefined;
          const text =
            job.payload.type === "senior_reminder"
              ? body?.notifications?.senior_template
              : body?.notifications?.regular_template;
          if (!text) return null;
          const escape = (v: string) =>
            v
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;");
          return {
            to: recipient,
            name: profile.display_name,
            subject: "HKSCDA 義工出席提示",
            body: `<p>${escape(profile.display_name)} 你好：</p><p>${escape(text)}</p>`,
          };
        },
        async send(message, idempotencyKey) {
          const config = getEmailConfig();
          if (!config.resendApiKey)
            return {
              kind: "rejected" as const,
              code: "email_provider_not_configured",
              retryable: true,
            };
          const { Resend } = await import("resend");
          const resend = new Resend(config.resendApiKey);
          const provider = createResendMailProvider(async ({ idempotencyKey: key, ...email }) => {
            const result = await resend.emails.send(email, { idempotencyKey: key });
            return {
              data: result.data ? { id: result.data.id } : null,
              error: result.error ? { name: result.error.name } : null,
            };
          });
          return provider.send({
            from: config.from,
            to: message.to,
            replyTo: config.replyTo,
            subject: message.subject,
            html: message.body,
            idempotencyKey,
          });
        },
        async accepted(job, providerMessageId) {
          await settle(job, "provider_accepted", null, null, providerMessageId);
        },
        async reject(job, code, retryable) {
          await settle(
            job,
            "failed",
            code,
            retryable
              ? new Date(now.getTime() + Math.min(60, 2 ** job.attempts) * 60000).toISOString()
              : new Date("9999-12-31").toISOString(),
          );
        },
      });
      for (const row of data ?? [])
        await dispatch({
          id: row.id,
          dedupKey: row.dedup_key,
          attempts: row.attempts,
          payload: row.payload,
        });
      return data?.length ?? 0;
    },
  };
}
