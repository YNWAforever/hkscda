import { describe, expect, mock, test } from "bun:test";

import { expectNoChineseText } from "../i18n/testing";

mock.module("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const { AdminApiError } = await import("../../../lib/admin/session");
const { VolunteerSelectionError } =
  await import("../../../lib/volunteers/directory/reviewerBulkSelection");
const { reviewPanelProblemMessage, selectionProblemMessage } = await import("./directoryProblems");
const { volunteerDirectoryCopy } = await import("./volunteerDirectoryCopy");

/**
 * The directory and the reviewer panel keep a problem as a code and the error behind it, and write
 * the text when they render. These states come from a click and a server answer, so the tests drive
 * the function that writes the text, with the errors each handler stores.
 */
describe("the problem a volunteer selection or the reviewer panel shows", () => {
  const selectionCodes = ["select_failed", "pin_failed"] as const;
  const panelCodes = ["load_saved", "reload_saved", "preview_failed", "apply_failed"] as const;

  test("shows nothing when nothing went wrong, in either language", () => {
    for (const language of ["en", "zh"] as const) {
      expect(selectionProblemMessage(null, language)).toBe("");
      expect(reviewPanelProblemMessage(null, language)).toBe("");
    }
  });

  test("a problem with no error behind it reads as the text of its code, and English says what to do", () => {
    for (const code of selectionCodes) {
      const english = selectionProblemMessage({ code }, "en");
      expect(english).toBe(volunteerDirectoryCopy.en.selection.errors[code]);
      expectNoChineseText(english);
      expect(selectionProblemMessage({ code }, "zh")).toBe(
        volunteerDirectoryCopy.zh.selection.errors[code],
      );
    }
    for (const code of panelCodes) {
      const english = reviewPanelProblemMessage({ code }, "en");
      expect(english).toBe(volunteerDirectoryCopy.en.reviewPanel.errors[code]);
      expectNoChineseText(english);
      expect(reviewPanelProblemMessage({ code }, "zh")).toBe(
        volunteerDirectoryCopy.zh.reviewPanel.errors[code],
      );
    }
    expect(selectionProblemMessage({ code: "select_failed" }, "en")).toBe(
      "Could not select the profile. Try again.",
    );
    expect(selectionProblemMessage({ code: "pin_failed" }, "zh")).toBe("無法固定選取範圍");
    expect(reviewPanelProblemMessage({ code: "apply_failed" }, "en")).toBe(
      "Could not apply the assignment. Use Reload result to check what happened.",
    );
    expect(reviewPanelProblemMessage({ code: "preview_failed" }, "zh")).toBe("無法建立預覽");
  });

  test("a selection refused for a reason writes that reason in the language shown, so a change of language rewrites it", () => {
    const tooMany = {
      code: "select_failed",
      cause: new VolunteerSelectionError("too_many"),
    } as const;
    expect(selectionProblemMessage(tooMany, "en")).toBe(
      "You can select at most 1,000 volunteer profiles. Clear some and try again.",
    );
    expect(selectionProblemMessage(tooMany, "zh")).toBe("最多只能選取 1000 筆義工身份");
    const changed = {
      code: "pin_failed",
      cause: new VolunteerSelectionError("filter_changed"),
    } as const;
    expect(selectionProblemMessage(changed, "en")).toBe(
      "The filters changed. Select the profiles again.",
    );
    expect(selectionProblemMessage(changed, "zh")).toBe("篩選條件已變更；請重新選取");
    // The two refusals the Chinese admin has always seen in English stay as they were in Chinese.
    const outOfRange = {
      code: "pin_failed",
      cause: new VolunteerSelectionError("out_of_range"),
    } as const;
    expect(selectionProblemMessage(outOfRange, "zh")).toBe(
      "Volunteer bulk selection must contain 1 to 1000 profiles",
    );
    expectNoChineseText(selectionProblemMessage(outOfRange, "en"));
    const listChanged = {
      code: "pin_failed",
      cause: new VolunteerSelectionError("list_changed"),
    } as const;
    expect(selectionProblemMessage(listChanged, "en")).toBe(
      "The volunteer directory changed while you were selecting. Select the profiles again.",
    );
  });

  test("a server refusal reads in English with a next step, and never as the Chinese the server sent", () => {
    const known = new AdminApiError({ status: 409, message: "資料已更新，請重新檢查後再試。" });
    const unknown = new AdminApiError({ status: 500, message: "一段沒有人見過的訊息" });
    for (const cause of [known, unknown]) {
      const english = reviewPanelProblemMessage({ code: "apply_failed", cause }, "en");
      expectNoChineseText(english);
      expect(english.length).toBeGreaterThan(10);
      // The Chinese admin keeps the message the server sent.
      expect(reviewPanelProblemMessage({ code: "apply_failed", cause }, "zh")).toBe(cause.message);
      expectNoChineseText(selectionProblemMessage({ code: "pin_failed", cause }, "en"));
    }
    expect(reviewPanelProblemMessage({ code: "apply_failed", cause: known }, "en")).toBe(
      "The data has been updated. Check it again, then try again.",
    );
  });
});
