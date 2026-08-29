import type { SupabaseClient } from "@supabase/supabase-js";

import type { SponsorshipAdminRepository } from "./repository.server";
import {
  cancelPledgeSchema,
  pledgeListSearchSchema,
  recordPledgePaymentSchema,
  reviewPledgeProofSchema,
} from "./schemas";
import type { PledgeDetail } from "./types";
import type { SendPledgeStatusUpdateEmailArgs } from "./notifications.server";
import { pledgeReference } from "../sponsorship/statusSummary";

const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";
const PROOF_SIGNED_URL_TTL_SECONDS = 60;

type SendPledgeStatusUpdateEmail = (
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
) => Promise<unknown>;

export type CreateSponsorshipAdminServiceArgs = {
  repo: SponsorshipAdminRepository;
  sendPledgeStatusUpdateEmail: SendPledgeStatusUpdateEmail;
  client: SupabaseClient;
  logger?: Pick<Console, "error">;
};

function requirePledge(detail: PledgeDetail | null): PledgeDetail {
  if (!detail) throw new Error("Sponsorship pledge not found");
  return detail;
}

const RECORD_PAYMENT_ELIGIBLE_STATUSES: PledgeDetail["status"][] = [
  "pending_payment",
  "needs_followup",
];

export function createSponsorshipAdminService({
  repo,
  sendPledgeStatusUpdateEmail,
  client,
  logger = console,
}: CreateSponsorshipAdminServiceArgs) {
  async function notify(detail: PledgeDetail, event: SendPledgeStatusUpdateEmailArgs["event"]) {
    if (!detail.supporterEmail) return;
    try {
      await sendPledgeStatusUpdateEmail(client, {
        event,
        language: detail.language,
        supporterId: detail.supporterId,
        supporterEmail: detail.supporterEmail,
        supporterName: detail.supporterName,
        reference: pledgeReference(detail.id),
        amountCents: detail.amountCents,
      });
    } catch (error) {
      logger.error("Failed to send sponsorship pledge status update email", error);
    }
  }

  return {
    async listPledges(rawSearch: unknown) {
      const search = pledgeListSearchSchema.parse(rawSearch);
      return repo.listPledges(search);
    },

    async getPledgeDetail(id: string) {
      return repo.getPledgeDetail(id);
    },

    async getProofSigningInfo(id: string) {
      const info = await repo.getProofSigningInfo(id);
      if (!info) return null;

      const { data, error } = await client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .createSignedUrl(info.storagePath, PROOF_SIGNED_URL_TTL_SECONDS, {
          download: info.fileName ?? true,
        });
      if (error) throw error;

      return { url: data.signedUrl, fileName: info.fileName };
    },

    /**
     * Validates that a pledge is currently eligible to receive a recorded
     * payment, without mutating anything. Callers that must upload a proof
     * file to storage before invoking `recordPayment` (e.g. the multipart
     * proof-record route) should call this first so an ineligible pledge is
     * rejected before any file lands in the bucket.
     */
    async assertRecordPaymentEligible(pledgeId: string) {
      const detail = requirePledge(await repo.getPledgeDetail(pledgeId));
      if (!RECORD_PAYMENT_ELIGIBLE_STATUSES.includes(detail.status)) {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }
      return detail;
    },

    async recordPayment(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = recordPledgePaymentSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (!RECORD_PAYMENT_ELIGIBLE_STATUSES.includes(detail.status)) {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }

      // The proof file is optional per the design spec: staff can record a
      // payment they verified some other way (e.g. checked the bank system
      // directly) without attaching a file. When absent, persist null file
      // fields rather than rejecting the request.
      const result = await repo.recordPayment({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        storagePath: input.file?.storagePath ?? null,
        fileName: input.file?.fileName ?? null,
        fileType: input.file?.fileType ?? null,
        fileSize: input.file?.fileSize ?? null,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        amountCents: input.amountCents,
        paymentDate: input.paymentDate,
        note: input.note ?? null,
      });

      await notify(detail, "proof_recorded");
      return result;
    },

    async reviewProof(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = reviewPledgeProofSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (detail.status !== "provisional") {
        throw new Error("Sponsorship pledge is not awaiting review");
      }
      if (!detail.currentProof || detail.currentProof.reviewStatus !== "pending") {
        throw new Error("Sponsorship pledge has no proof pending review");
      }

      await repo.reviewProof({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        decision: input.decision,
        note: input.note ?? null,
      });

      await notify(detail, input.decision === "approve" ? "active" : "needs_followup");
    },

    async cancelPledge(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = cancelPledgeSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (detail.status === "cancelled") {
        throw new Error("Sponsorship pledge is already cancelled");
      }

      await repo.cancelPledge({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });

      await notify(detail, "cancelled");
    },
  };
}
