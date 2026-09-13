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
import { selectAutoAssignAnimal } from "./autoAssign";
import type { CandidateAnimalState } from "./autoAssign";
import type { PledgeDetail, SponsorshipAssignmentRecord } from "./types";
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
  "provisional",
  "needs_followup",
  "active",
];

/**
 * Why an open assignment needs a person to look at it.
 *
 * Derived on every read rather than stored: a flag written at one moment would
 * drift from the animal's real state the instant the CMS changed it.
 *
 * `retired` flags even though retirement is not an automatic end reason —
 * flagging is not ending, and an archived record is worth a look.
 *
 * Adoption is read from BOTH of its homes. `animals.status` is written by the
 * staff status RPC; `animal_profile_internal.adopted_at` is written by the
 * adoptions internal-profile form, which never touches `animals.status`. An
 * animal adopted through that form would otherwise go unflagged while the
 * supporter kept paying for it.
 */
function reviewReasonFor(
  animal: CandidateAnimalState | null,
): SponsorshipAssignmentRecord["reviewReason"] {
  if (!animal) return null;
  if (animal.deceasedAt !== null) return "deceased";
  if (animal.status === "adopted" || animal.adoptedAt !== null) return "adopted";
  if (animal.retiredAt !== null) return "retired";
  if (!animal.sponsorshipEligible) return "ineligible";
  return null;
}

export function createSponsorshipAdminService({
  repo,
  sendPledgeStatusUpdateEmail,
  client,
  logger = console,
}: CreateSponsorshipAdminServiceArgs) {
  async function notify(
    detail: PledgeDetail,
    event: SendPledgeStatusUpdateEmailArgs["event"],
    actorUserId: string,
  ) {
    if (!detail.supporterEmail) return;
    try {
      await sendPledgeStatusUpdateEmail(client, {
        event,
        actorUserId,
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
      const detail = await repo.getPledgeDetail(id);
      if (!detail) return null;

      // The state comes off the assigned animal itself, never off the
      // supporter's ranked preferences. Only the first animal is auto-confirmed
      // from that shortlist; every animal a staff member adds by hand
      // afterwards is absent from it, and deriving the flag from preferences
      // meant those animals could never be flagged at all.
      const assignments = detail.assignments.map((assignment) =>
        assignment.endedOn !== null || assignment.animalId === null
          ? assignment
          : {
              ...assignment,
              reviewReason: reviewReasonFor(assignment.animalState),
            },
      );

      return {
        ...detail,
        assignments,
        // The second derived signal: a sponsorship that is running but backs
        // no animal. Only `active` counts -- a pledge that has not reached
        // `active` yet (pending_payment, provisional, needs_followup) has no
        // animal for an ordinary reason: nothing has been paid and confirmed
        // yet, so there is nothing for staff to resolve. `cancelled` is
        // likewise excluded, since it takes no further payments.
        needsAnimal:
          detail.status === "active" &&
          assignments.every((assignment) => assignment.endedOn !== null),
      };
    },

    async getProofSigningInfo(id: string, proofId: string, expectedRevision: number) {
      const info = await repo.getProofSigningInfo(id, proofId, expectedRevision);
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
        idempotencyKey: input.idempotencyKey,
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

      await notify(detail, "proof_recorded", args.actorUserId);
      return result;
    },

    async reviewProof(args: {
      actorUserId: string;
      actorRole?: "staff" | "treasurer" | "admin";
      pledgeId: string;
      input: unknown;
    }) {
      const input = reviewPledgeProofSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      // The database checks this exact proof and computes allocations from the locked ledger.
      // Confirm the supporter's animal on the FIRST approval only. "First"
      // means the pledge has never had an assignment: one that was ended
      // because the animal was adopted or died must be replaced by a person,
      // not silently by the next payment.
      const assignAnimalId =
        input.decision === "approve" &&
        args.actorRole !== "treasurer" &&
        detail.assignments.length === 0
          ? (selectAutoAssignAnimal(
              detail.preferences.map((preference) => ({
                rank: preference.rank,
                animalId: preference.animalId,
                animalNameSnapshot: preference.animalNameSnapshot,
                animal: preference.animalState,
              })),
            )?.animalId ?? null)
          : null;

      const result = await repo.reviewProof({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        proofId: input.proofId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        decision: input.decision,
        note: input.note ?? null,
        assignAnimalId,
      });

      if (!result?.replayed)
        await notify(
          detail,
          input.decision === "approve" ? "active" : "needs_followup",
          args.actorUserId,
        );
      return result;
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

      await notify(detail, "cancelled", args.actorUserId);
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
