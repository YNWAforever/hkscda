/**
 * Which animal a first payment approval confirms.
 *
 * The supporter ranks up to ten animals at submission; those are wishes, not
 * agreements. On the first approved payment, the highest-ranked one that is
 * still assignable becomes a confirmed assignment.
 *
 * The rule lives here rather than only in SQL so it can be read and tested
 * without a database, matching `planPaymentAllocation` and
 * `selectReviewTargetProof`. `assign_sponsorship_animal_with_audit` re-checks
 * the same conditions before inserting, so a stale or hand-built call cannot
 * bypass them — the same defence-in-depth the allocation planner and its
 * triggers already use.
 */

export type CandidateAnimalState = {
  sponsorshipEligible: boolean;
  status: "available" | "fostered" | "adopted";
  retiredAt: string | null;
  publicationState: "draft" | "published" | "unpublished";
  /** Recorded on `animal_profile_internal`; `animals.status` has no deceased value. */
  deceasedAt: string | null;
};

export type PreferenceCandidate = {
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
  /** `null` when the preference names no animal, or its row could not be read. */
  animal: CandidateAnimalState | null;
};

/**
 * Whether this preference can become a confirmed assignment right now.
 *
 * `status` names the excluded state rather than requiring `available`: a
 * fostered animal is in temporary care and still needs a sponsor, which is the
 * same reasoning that published fostered animals to the public catalogue.
 *
 * `publicationState` is checked because confirming an assignment opens a new
 * public-facing commitment. It deliberately plays no part in ENDING one —
 * withholding a profile is an editorial act, not a reason to stop a
 * sponsorship someone is already paying for.
 */
export function isAssignable(candidate: PreferenceCandidate): boolean {
  if (!candidate.animalId || !candidate.animal) return false;

  const animal = candidate.animal;
  return (
    animal.sponsorshipEligible &&
    animal.status !== "adopted" &&
    animal.retiredAt === null &&
    animal.deceasedAt === null &&
    animal.publicationState === "published"
  );
}

/**
 * The supporter's highest-ranked assignable choice, or `null` when none is.
 *
 * Returning `null` is a real outcome, not a failure: the pledge is active with
 * no animal, which the attention query surfaces so a person can choose one.
 * Falling back to an unranked animal would assign someone's money to an animal
 * they never asked for.
 */
export function selectAutoAssignAnimal(
  candidates: readonly PreferenceCandidate[],
): PreferenceCandidate | null {
  let best: PreferenceCandidate | null = null;
  for (const candidate of candidates) {
    if (!isAssignable(candidate)) continue;
    if (best === null || candidate.rank < best.rank) best = candidate;
  }
  return best;
}
