import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailProvider } from "../notifications/provider.server";
import { createResendMailProvider } from "../notifications/provider.server";
import { getEmailConfig } from "../donations/config.server";
import {
  renderPledgeStatusUpdateEmail,
  type PledgeStatusUpdateEvent,
} from "../sponsorship/emailTemplates.server";
import { pledgeReference } from "../sponsorship/statusSummary";
export type Delivery = {
  id: string;
  lease_token: string;
  pledge_id: string;
  scope: string;
  event: PledgeStatusUpdateEvent;
  supporterEmail: string;
  supporterName: string;
  language: "en" | "zh-HK";
  amountCents: number;
};
export function createSponsorshipOutboxWorker(deps: {
  claim: () => Promise<Delivery[]>;
  finish: (job: Delivery, providerId: string | null, error: string | null) => Promise<boolean>;
  provider: MailProvider;
  from: string;
  replyTo?: string;
}) {
  return async () => {
    const results: Array<{ id: string; status: "provider_accepted" | "failed" | "lease_lost" }> =
      [];
    for (const job of await deps.claim()) {
      const content = renderPledgeStatusUpdateEmail({
        event: job.event,
        language: job.language,
        supporterName: job.supporterName,
        reference: pledgeReference(job.pledge_id),
        amountCents: job.amountCents,
      });
      const sent = await deps.provider.send({
        from: deps.from,
        to: job.supporterEmail,
        replyTo: deps.replyTo,
        subject: content.subject,
        html: content.html,
        idempotencyKey: `sponsorship-${job.id}`,
      });
      const accepted = sent.kind === "accepted";
      const saved = await deps.finish(
        job,
        accepted ? sent.providerMessageId : null,
        accepted ? null : sent.code,
      );
      results.push({
        id: job.id,
        status: !saved ? "lease_lost" : accepted ? "provider_accepted" : "failed",
      });
    }
    return results;
  };
}
export async function dispatchSponsorshipOutbox(client: SupabaseClient, actorUserId: string) {
  const config = getEmailConfig();
  // Unconfigured environments do not claim jobs, so they remain visibly queued.
  if (!config.resendApiKey) return { status: "queued" as const, results: [] };
  const { Resend } = await import("resend");
  const resend = new Resend(config.resendApiKey);
  const provider = createResendMailProvider(({ idempotencyKey, ...input }) =>
    resend.emails.send(input, { idempotencyKey }),
  );
  const run = createSponsorshipOutboxWorker({
    provider,
    from: config.from,
    replyTo: config.replyTo,
    claim: async () => {
      const { data, error } = await client.rpc("claim_sponsorship_deliveries", {
        p_actor: actorUserId,
        p_limit: 10,
        p_pledge: null,
      });
      if (error) throw error;
      return data as Delivery[];
    },
    finish: async (job, providerId, errorCode) => {
      const { data, error } = await client.rpc("finish_sponsorship_delivery", {
        p_actor: actorUserId,
        p_id: job.id,
        p_lease: job.lease_token,
        p_provider_id: providerId,
        p_error: errorCode,
      });
      if (error) throw error;
      return data === true;
    },
  });
  return { status: "processed" as const, results: await run() };
}
