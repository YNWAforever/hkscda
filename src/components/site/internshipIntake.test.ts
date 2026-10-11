import { describe, expect, test } from "bun:test";

import { parseInternshipIntake } from "./internshipIntake";

const valid = {
  version: "3",
  settings: {
    enabled: true,
    name: "獸醫學生實習申請",
    shelters: ["cat", "dog"],
    opens_at: null,
    closes_at: "2026-12-31T00:00:00Z",
    instructions: "請上載學生證明。",
  },
};

describe("internship intake parsing", () => {
  test("accepts the published intake", () => {
    expect(parseInternshipIntake(valid)).toEqual(valid);
  });

  test("rejects an error body, an empty result and a missing shelter list", () => {
    // Each of these used to reach `intake.settings.shelters.map` and throw.
    expect(parseInternshipIntake({ error: "未能處理，請重新整理後再試" })).toBeNull();
    expect(parseInternshipIntake([])).toBeNull();
    expect(parseInternshipIntake(null)).toBeNull();
    expect(
      parseInternshipIntake({ ...valid, settings: { ...valid.settings, shelters: undefined } }),
    ).toBeNull();
  });

  test("fills optional fields it cannot read with safe defaults", () => {
    const parsed = parseInternshipIntake({
      version: "1",
      settings: { enabled: false, name: "實習", shelters: [] },
    });
    expect(parsed?.settings.instructions).toBe("");
    expect(parsed?.settings.closes_at).toBeNull();
  });
});
