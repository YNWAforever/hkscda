import { describe, expect, test } from "bun:test";

import { hasProofAwaitingReview, selectReviewTargetProof } from "./proofReview";
import type { ReviewableProof } from "./proofReview";

function proof(overrides: Partial<ReviewableProof> = {}): ReviewableProof {
  return {
    id: "proof-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    reviewStatus: "pending",
    ...overrides,
  };
}

const monthOne = proof({
  id: "proof-month-1",
  createdAt: "2026-07-01T00:00:00.000Z",
  reviewStatus: "approved",
});
const monthTwo = proof({ id: "proof-month-2", createdAt: "2026-08-01T00:00:00.000Z" });
const monthThree = proof({ id: "proof-month-3", createdAt: "2026-09-01T00:00:00.000Z" });

describe("selectReviewTargetProof", () => {
  test("returns null when there are no proofs at all", () => {
    expect(selectReviewTargetProof([])).toBeNull();
  });

  test("returns null when every proof has already been decided", () => {
    // An active sponsorship between months. The review action must not be
    // offered, and `review_sponsorship_payment_proof` would reject it.
    const decided = [monthOne, proof({ id: "p2", reviewStatus: "rejected" })];
    expect(selectReviewTargetProof(decided)).toBeNull();
    expect(hasProofAwaitingReview(decided)).toBe(false);
  });

  test("skips decided proofs and returns the one awaiting review", () => {
    // The second month: month one is approved and the pledge is active, so a
    // rule that took the newest *approved* row, or the newest row overall,
    // would land on the wrong month.
    expect(selectReviewTargetProof([monthOne, monthTwo])?.id).toBe("proof-month-2");
    expect(hasProofAwaitingReview([monthOne, monthTwo])).toBe(true);
  });

  test("takes the OLDEST pending proof, not the newest", () => {
    // The load-bearing assertion. Newest-first strands month two forever: it
    // can never become the newest again, so no future review could reach it and
    // a real recorded payment would sit unreviewed with no way to act on it.
    expect(selectReviewTargetProof([monthTwo, monthThree])?.id).toBe("proof-month-2");
  });

  test("drains the queue rather than stranding a row", () => {
    // Deciding the target removes it from the pending set, so the next call
    // advances. Two decisions clear two months; nothing is left unreachable.
    const queue = [monthOne, monthTwo, monthThree];
    const first = selectReviewTargetProof(queue);
    expect(first?.id).toBe("proof-month-2");

    const afterFirst = queue.map((p) =>
      p.id === first?.id ? { ...p, reviewStatus: "approved" as const } : p,
    );
    expect(selectReviewTargetProof(afterFirst)?.id).toBe("proof-month-3");

    const afterSecond = afterFirst.map((p) => ({ ...p, reviewStatus: "approved" as const }));
    expect(selectReviewTargetProof(afterSecond)).toBeNull();
  });

  test("is independent of the order the rows arrive in", () => {
    // The repository fetches newest-first for the history list, the database
    // locks oldest-first, and a fake client may supply any order. All three
    // must reach the same row or the decision lands on a proof staff never saw.
    const shuffled = [monthThree, monthOne, monthTwo];
    expect(selectReviewTargetProof(shuffled)?.id).toBe("proof-month-2");
  });

  test("breaks a createdAt tie deterministically by id", () => {
    // Two proofs written in one transaction share now(). Without a tiebreak the
    // choice is whatever order the rows happen to come back in, which is how
    // the database picked an already-approved row and reported the genuinely
    // pending one as "no proof pending review".
    const tiedLater = proof({ id: "proof-b", createdAt: "2026-08-01T00:00:00.000Z" });
    const tiedEarlier = proof({ id: "proof-a", createdAt: "2026-08-01T00:00:00.000Z" });
    expect(selectReviewTargetProof([tiedLater, tiedEarlier])?.id).toBe("proof-a");
    expect(selectReviewTargetProof([tiedEarlier, tiedLater])?.id).toBe("proof-a");
  });

  test("does not reorder or mutate the caller's array", () => {
    // The same array backs the history list rendered to staff, which is
    // deliberately newest-first.
    const history = [monthThree, monthTwo, monthOne];
    selectReviewTargetProof(history);
    expect(history.map((p) => p.id)).toEqual(["proof-month-3", "proof-month-2", "proof-month-1"]);
  });
});
