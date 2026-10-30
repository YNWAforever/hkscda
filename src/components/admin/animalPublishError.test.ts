import { describe, expect, test } from "bun:test";
import { AdminApiError } from "../../lib/admin/session";
import { animalFormCopy } from "./animalFormCopy";
import { animalPublishFailure } from "./animalPublishError";

describe("animal publish failures", () => {
  test("BUG-54: a missing content review points staff to source review, not to preview again", () => {
    const failure = animalPublishFailure(
      new AdminApiError({ status: 422, code: "review_required", message: "x" }),
    );
    expect(failure).toEqual({ notice: "reviewRequired", keepPreview: true });
    expect(animalFormCopy.zh.publish.reviewRequired).toContain("來源審核");
    expect(animalFormCopy.en.publish.reviewRequired).toContain("source review");
    expect(animalFormCopy.en.publish.reviewRequired).not.toContain("Preview the draft again");
  });

  test("BUG-54: a stale preview or invalid draft still asks for a new preview", () => {
    for (const [status, code] of [
      [409, "stale_preview"],
      [404, "stale_preview"],
      [422, "invalid_draft"],
      [403, undefined],
    ] as const) {
      expect(animalPublishFailure(new AdminApiError({ status, code, message: "x" }))).toEqual({
        notice: "conflict",
        keepPreview: false,
      });
    }
  });

  test("an unknown failure keeps the preview so the idempotent publish can be retried", () => {
    expect(animalPublishFailure(new Error("network"))).toEqual({
      notice: "unconfirmed",
      keepPreview: true,
    });
    expect(
      animalPublishFailure(
        new AdminApiError({ status: 500, code: "publication_failed", message: "x" }),
      ),
    ).toEqual({ notice: "unconfirmed", keepPreview: true });
  });
});
