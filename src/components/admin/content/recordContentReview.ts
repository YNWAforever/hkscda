import type { ReviewInput } from "../../../lib/contentReview/service";
import { fetchAdminJson } from "../../../lib/admin/http";

/** How recording a review went. The review panel writes its own message for each. */
export type ReviewResult = "recorded" | "failed";

/**
 * Records the review of one saved version and says how it went. A failure is only ever reported as
 * `"failed"`: whatever the server said (the content review route answers in zh-HK, and so does the
 * database trigger that blocks an unreviewed publish) is not shown, so the panel writes the message
 * for the admin's language.
 */
export async function recordContentReview(
  input: {
    kind: "animal" | "content";
    id: string;
    revision: string;
    classification: ReviewInput["classification"];
    evidence: string;
  },
  post: typeof fetchAdminJson = fetchAdminJson,
): Promise<ReviewResult> {
  try {
    await post("/api/admin/content-review", {
      method: "POST",
      body: JSON.stringify({
        entity_kind: input.kind,
        entity_id: input.id,
        revision_key: input.revision,
        classification: input.classification,
        evidence: input.evidence,
      }),
    });
    return "recorded";
  } catch {
    return "failed";
  }
}
