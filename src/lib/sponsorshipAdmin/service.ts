import type { SupabaseClient } from "@supabase/supabase-js";

import type { SponsorshipAdminRepository } from "./repository.server";
import {
  assignAnimalSchema,
  cancelPledgeSchema,
  endAssignmentSchema,
  pledgeListSearchSchema,
  recordPledgePaymentSchema,
  reviewPledgeProofSchema,
} from "./schemas";
import { MAX_ADVANCE_PERIODS, monthStartOf, planPaymentAllocation } from "./allocation";
import { selectAutoAssignAnimal } from "./autoAssign";
import type { PledgeDetail, PaymentProofRecord } from "./types";
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

/**
 * Works out which months an approved payment pays for.
 *
 * Returned rather than applied: the plan travels into
 * `review_sponsorship_payment_proof` so the approval and the attribution commit
 * together. Approving in one transaction and attributing in another would leave
 * a window where money is verified but belongs to no month, and a crash inside
 * that window would make it permanent.
 */
function planApprovedPayment(proof: PaymentProofRecord, detail: PledgeDetail) {
  const plan = planPaymentAllocation({
    paymentCents: proof.amountCents,
    periods: detail.periods,
    committedCents: detail.amountCents,
    // payment_date is when the money moved; the month it pays for starts there
    // and runs forward past whatever is already settled.
    startMonth: monthStartOf(proof.paymentDate),
  });

  if (plan.unallocatedCents > 0) {
    // Refusing beats absorbing. A payment covering more than MAX_ADVANCE_PERIODS
    // months is not ordinary traffic -- far more likely a mistyped amount -- and
    // approving it here would leave part of a supporter's money attributed to no
    // month at all. Staff can correct the amount, reject the proof, or attribute
    // it deliberately.
    throw new Error(
      `Payment of ${proof.amountCents} cents exceeds ${MAX_ADVANCE_PERIODS} months of this ` +
        `pledge; ${plan.unallocatedCents} cents could not be attributed to a month. ` +
        `Check the amount, or attribute this payment manually.`,
    );
  }

  return plan.allocations.map((allocation) => ({
    periodMonth: allocation.periodMonth,
    amountCents: allocation.amountCents,
  }));
}

function requirePledge(detail: PledgeDetail | null): PledgeDetail {
  if (!detail) throw new Error("Sponsorship pledge not found");
  return detail;
}

/**
 * Mirrors the status list in `record_sponsorship_payment_proof`
 * (`20260911180000_sponsorship_second_month.sql`). `active` is here because a
 * sponsorship is monthly: the second month's payment is recorded against a
 * pledge that is already running. Recording one does NOT move an active pledge
 * back to `provisional` — the sponsorship is still active; it is the new proof
 * that is pending.
 */
const RECORD_PAYMENT_ELIGIBLE_STATUSES: PledgeDetail["status"][] = [
  "pending_payment",
  "needs_followup",
  "active",
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
      // Deliberately no pledge-status gate. What is being reviewed is a proof,
      // and `currentProof` already resolves to the one awaiting review (see
      // proofReview.ts). Requiring status='provisional' conflated the
      // supporter's standing commitment with the review queue and made every
      // month after the first unreviewable, since approving month one leaves
      // the pledge 'active' for good.
      if (!detail.currentProof || detail.currentProof.reviewStatus !== "pending") {
        throw new Error("Sponsorship pledge has no proof pending review");
      }

      // A rejected payment pays for nothing, so it attributes to nothing.
      const allocations =
        input.decision === "approve" ? planApprovedPayment(detail.currentProof, detail) : [];

      // Confirm the supporter's animal on the FIRST approval only. "First"
      // means the pledge has never had an assignment: one that was ended
      // because the animal was adopted or died must be replaced by a person,
      // not silently by the next payment.
      const assignAnimalId =
        input.decision === "approve" && detail.assignments.length === 0
          ? (selectAutoAssignAnimal(
              detail.preferences.map((preference) => ({
                rank: preference.rank,
                animalId: preference.animalId,
                animalNameSnapshot: preference.animalNameSnapshot,
                animal: preference.animalState,
              })),
            )?.animalId ?? null)
          : null;

      await repo.reviewProof({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        decision: input.decision,
        note: input.note ?? null,
        allocations,
        assignAnimalId,
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

    async assignAnimal(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = assignAnimalSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      // Checked here as well as in the RPC so staff get a clear message rather
      // than a raw database exception; the RPC remains the guard that cannot
      // be bypassed.
      if (detail.status === "cancelled") {
        throw new Error("Sponsorship pledge is already cancelled");
      }

      return repo.assignAnimal({
        pledgeId: args.pledgeId,
        animalId: input.animalId,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });
    },

    async endAssignment(args: {
      actorUserId: string;
      pledgeId: string;
      assignmentId: string;
      input: unknown;
    }) {
      const input = endAssignmentSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      const assignment = detail.assignments.find((a) => a.id === args.assignmentId);
      if (!assignment) {
        throw new Error("Sponsorship assignment not found");
      }
      if (assignment.endedOn !== null) {
        throw new Error("Sponsorship assignment is already ended");
      }

      await repo.endAssignment({
        assignmentId: args.assignmentId,
        actorUserId: args.actorUserId,
        reason: input.reason,
        note: input.note ?? null,
      });
    },
  };
}
