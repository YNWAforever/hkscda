import { describe, expect, test } from "bun:test";

import { buildIntakeSearchParams, intakeUrgencyLabel } from "./intakeInboxLogic";

describe("intake inbox logic", () => {
  test("builds lane query params", () => {
    expect(buildIntakeSearchParams({ lane: "photos_to_review", openOnly: true }).toString()).toBe(
      "lane=photos_to_review&openOnly=true",
    );
  });

  test("labels urgency", () => {
    expect(intakeUrgencyLabel("normal", "zh")).toBe("普通");
    expect(intakeUrgencyLabel("high", "en")).toBe("High");
    expect(intakeUrgencyLabel("overdue", "zh")).toBe("逾期");
  });
});
