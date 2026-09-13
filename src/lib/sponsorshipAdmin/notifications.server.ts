import type { SupabaseClient } from "@supabase/supabase-js";
import type { PledgeStatusUpdateEvent } from "../sponsorship/emailTemplates.server";
import { dispatchSponsorshipOutbox } from "./outbox.server";
export type SendPledgeStatusUpdateEmailArgs = {
  actorUserId?: string;
  event: PledgeStatusUpdateEvent;
  language: "zh-HK" | "en";
  supporterId: string;
  supporterEmail: string;
  supporterName: string;
  reference: string;
  amountCents: number;
};
/** The database queued the transition before this post-commit delivery attempt.
 * Failed delivery remains retryable; this function never claims a lifetime event. */
export async function sendPledgeStatusUpdateEmail(
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
) {
  if (!args.actorUserId) return "queued";
  return dispatchSponsorshipOutbox(client, args.actorUserId);
}
