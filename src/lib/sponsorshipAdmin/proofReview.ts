/**
 * Which payment proof a review decision acts on.
 *
 * A pledge accumulates proofs — one per month once a sponsorship is running —
 * so "the proof" is no longer a single row and the choice has to be written
 * down once. It is depended on in four places that must agree:
 *
 *   1. `review_sponsorship_payment_proof` in the database, which locks and
 *      updates the row (`20260911180000_sponsorship_second_month.sql`);
 *   2. `getPledgeDetail`, whose `currentProof` is what staff read before
 *      deciding;
 *   3. `getProofSigningInfo`, which signs the file staff actually look at;
 *   4. the drawer's review section, which is offered only when a decision is
 *      possible.
 *
 * If 2 and 3 disagree, staff approve one payment while viewing another
 * document. If 1 disagrees with either, the decision lands on a row they never
 * saw. So all four call the rule below rather than restating it.
 *
 * **The rule: the oldest proof still awaiting review.**
 *
 * Oldest-first, not newest-first. Proofs are a queue, and taking the newest
 * strands every older pending row permanently: it can never again be the
 * newest, so no future review would ever reach it — a recorded payment left
 * unreviewed with no way to act on it. That is reachable in ordinary use,
 * because recording a payment on an active pledge deliberately leaves the
 * pledge active, so a second proof can be recorded while a first is still
 * queued. Oldest-first strands nothing: each decision removes a row from the
 * pending set, so the queue drains.
 *
 * `createdAt` alone does not order the queue totally — two proofs written in
 * one transaction share `now()` — so `id` breaks ties. The tiebreak only has to
 * be deterministic and agree with the database, not meaningful.
 */

export type ReviewableProof = {
  id: string;
  createdAt: string;
  reviewStatus: "pending" | "approved" | "rejected";
};

/**
 * The proof a review decision would act on, or `null` when nothing is awaiting
 * review. Does not mutate or reorder the caller's array.
 */
export function selectReviewTargetProof<T extends ReviewableProof>(proofs: readonly T[]): T | null {
  let target: T | null = null;
  for (const proof of proofs) {
    if (proof.reviewStatus !== "pending") continue;
    if (target === null || isEarlierInQueue(proof, target)) {
      target = proof;
    }
  }
  return target;
}

/**
 * Whether a review decision is possible at all. Deciding is a property of the
 * proofs, not of the pledge's status: an active sponsorship with this month's
 * proof queued is reviewable, and a `provisional` pledge whose only proof was
 * already decided is not.
 */
export function hasProofAwaitingReview(proofs: readonly ReviewableProof[]): boolean {
  return selectReviewTargetProof(proofs) !== null;
}

function isEarlierInQueue(candidate: ReviewableProof, incumbent: ReviewableProof): boolean {
  if (candidate.createdAt !== incumbent.createdAt) {
    return candidate.createdAt < incumbent.createdAt;
  }
  return candidate.id < incumbent.id;
}
