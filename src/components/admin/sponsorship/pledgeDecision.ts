import type { PaymentProofRecord } from "../../../lib/sponsorshipAdmin/types";
import type { AdminLanguage } from "../../../lib/admin/language";
import {
  sponsorshipServerErrorCode,
  sponsorshipServerErrorText,
} from "../../../lib/sponsorshipAdmin/serverErrors";
import { fetchCoordinatorJson } from "../adoptions/api";

export type PledgeDecisionRequest = { endpoint: string; body: Record<string, unknown> };

/** What the drawer sends to cancel a pledge: the dialog's reason goes as the cancellation note. */
export function pledgeCancelRequest(
  pledgeId: string,
  reason: string | null,
): PledgeDecisionRequest | null {
  if (reason === null || reason.trim() === "") return null;
  return {
    endpoint: `/api/admin/sponsorships/pledges/${pledgeId}/cancel`,
    body: { note: reason.trim() },
  };
}

/** The part of a proof review that identifies the decision; it is what a retry is matched on. */
export type PledgeReviewCommand = {
  decision: "approve" | "reject";
  note: string | undefined;
  proofId: string;
  expectedRevision: number;
};

/**
 * The review of the proof as staff decided it. Approving takes an optional note; rejecting needs
 * a reason (null or blank builds nothing), which travels as the note.
 */
export function pledgeReviewCommand(
  proof: Pick<PaymentProofRecord, "id" | "revision">,
  decision: "approve" | "reject",
  note: string | null,
): PledgeReviewCommand | null {
  const text = note?.trim() ?? "";
  if (decision === "reject" && text === "") return null;
  return {
    decision,
    note: text === "" ? undefined : text,
    proofId: proof.id,
    expectedRevision: proof.revision,
  };
}

/** The review call for a command, with the idempotency key that makes a retry a replay. */
export function pledgeReviewRequest(
  pledgeId: string,
  command: PledgeReviewCommand,
  idempotencyKey: string,
): PledgeDecisionRequest {
  return {
    endpoint: `/api/admin/sponsorships/pledges/${pledgeId}/review`,
    body: { ...command, idempotencyKey },
  };
}

/** The POST itself, kept apart from the drawer so a test can check the request body. */
export function sendPledgeDecision(request: PledgeDecisionRequest) {
  return fetchCoordinatorJson(request.endpoint, {
    method: "POST",
    body: JSON.stringify(request.body),
  });
}

/**
 * The error a decision dialog shows: the sponsorship API's zh-HK message written for the admin's
 * language, or the error as it came when it is any other message.
 */
export function localizedDecisionError(cause: unknown, language: AdminLanguage): Error {
  const code = sponsorshipServerErrorCode(cause);
  if (code) return new Error(sponsorshipServerErrorText(code, language));
  return cause instanceof Error ? cause : new Error(String(cause));
}
