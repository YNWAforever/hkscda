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

type SendPledgeStatusUpdateEmail = (
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
) => Promise<unknown>;

export type CreateSponsorshipAdminServiceArgs = {
  repo: SponsorshipAdminRepository;
  sendPledgeStatusUpdateEmail: SendPledgeStatusUpdateEmail;
  client?: SupabaseClient;
  logger?: Pick<Console, "error">;
};

function requirePledge(detail: PledgeDetail | null): PledgeDetail {
  if (!detail) throw new Error("Sponsorship pledge not found");
  return detail;
}

export function createSponsorshipAdminService({
  repo,
  sendPledgeStatusUpdateEmail,
  client,
  logger = console,
}: CreateSponsorshipAdminServiceArgs) {
  async function notify(detail: PledgeDetail, event: SendPledgeStatusUpdateEmailArgs["event"]) {
    if (!detail.supporterEmail) return;
    try {
      await sendPledgeStatusUpdateEmail(client as SupabaseClient, {
        event,
        language: detail.language,
        supporterId: detail.supporterId,
        supporterEmail: detail.supporterEmail,
        supporterName: detail.supporterName,
        reference: detail.id,
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
      return repo.getProofSigningInfo(id);
    },

    async recordPayment(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = recordPledgePaymentSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (!["pending_payment", "needs_followup"].includes(detail.status)) {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }
      if (!input.file) {
        throw new Error("A proof file is required to record a payment");
      }

      const result = await repo.recordPayment({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        storagePath: input.file.storagePath,
        fileName: input.file.fileName,
        fileType: input.file.fileType,
        fileSize: input.file.fileSize,
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
