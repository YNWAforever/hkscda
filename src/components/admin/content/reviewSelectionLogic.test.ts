import { describe, expect, test } from "bun:test";

import { AdminSessionError } from "../../../lib/admin/session";
import { AnimalReviewSelectionError } from "../../../lib/contentReview/animalBulkSelection";
import { CmsReviewSelectionError } from "../../../lib/contentReview/cmsBulkSelection";
import { selectionErrorFrom, selectionErrorText } from "./reviewSelectionLogic";
import { reviewCopy } from "./reviewCopy";

describe("the review queue's selection errors", () => {
  test("keep the code of a refusal from the selection code for the kind of record it was for", () => {
    expect(
      selectionErrorFrom(new CmsReviewSelectionError("too_many"), "content", "select_failed"),
    ).toEqual({
      kind: "content",
      code: "too_many",
    });
    expect(
      selectionErrorFrom(
        new AnimalReviewSelectionError("list_changed"),
        "animal",
        "collect_failed",
      ),
    ).toEqual({ kind: "animal", code: "list_changed" });
  });

  test("keep any other error under the fallback code, with the error itself", () => {
    const cause = new Error("Network down");
    expect(selectionErrorFrom(cause, "content", "collect_failed")).toEqual({
      code: "collect_failed",
      cause,
    });
    // A refusal for the other kind of record is not one for this kind.
    const other = new AnimalReviewSelectionError("too_many");
    expect(selectionErrorFrom(other, "content", "select_failed")).toEqual({
      code: "select_failed",
      cause: other,
    });
  });

  test("are written in the admin's language when they are shown", () => {
    const queue = reviewCopy.en.queue;
    const zhQueue = reviewCopy.zh.queue;
    const refused = selectionErrorFrom(
      new AnimalReviewSelectionError("too_many"),
      "animal",
      "select_failed",
    );
    expect(selectionErrorText(refused, queue, "en")).toBe(
      "You can select at most 1,000 animal drafts. Clear some and try again.",
    );
    expect(selectionErrorText(refused, zhQueue, "zh")).toBe("最多只能選取 1000 筆動物草稿");

    const failed = selectionErrorFrom(new Error("Preview expired"), "content", "collect_failed");
    // The reason the server gave is shown as it came, in both languages.
    expect(selectionErrorText(failed, queue, "en")).toBe("Preview expired");
    expect(selectionErrorText(failed, zhQueue, "zh")).toBe("Preview expired");

    // Something that is not an error gets the message for the code.
    const unknown = selectionErrorFrom("nope", "content", "select_failed");
    expect(selectionErrorText(unknown, queue, "en")).toBe("Could not select. Try again.");
    expect(selectionErrorText(unknown, zhQueue, "zh")).toBe("無法選取");
    expect(selectionErrorText({ code: "filter_changed" }, queue, "en")).toBe(
      "The filter changed. Select again.",
    );
    expect(selectionErrorText({ code: "filter_changed" }, zhQueue, "zh")).toBe(
      "篩選已變更；請重新選取",
    );

    // A session error is translated.
    const session = selectionErrorFrom(
      new AdminSessionError("not_signed_in"),
      "content",
      "collect_failed",
    );
    expect(selectionErrorText(session, queue, "en")).toBe("Not signed in. Sign in again.");
    expect(selectionErrorText(session, zhQueue, "zh")).toBe("未登入");
  });
});
