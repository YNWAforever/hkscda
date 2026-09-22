import { describe, expect, test } from "bun:test";

import {
  createDefaultValues,
  draftHasRetiredAnswers,
  mergeDraftValues,
  normalizeApplicationVisitValues,
} from "./ApplicationWizard";

describe("application wizard grouped visit state", () => {
  test("starts with stable empty grouped windows", () => {
    expect(createDefaultValues().visit).toMatchObject({
      dogTimeWindows: [],
      catTimeWindows: [],
    });
  });

  test("normalizes restored draft windows for the current shortlist species", () => {
    const restored = mergeDraftValues(
      createDefaultValues(),
      {
        visit: {
          dogTimeWindows: ["weekend_afternoon", "weekday_afternoon", "weekend_afternoon"],
          catTimeWindows: ["weekday_morning"],
        },
      },
      ["dog"],
    );

    expect(restored.visit.dogTimeWindows).toEqual(["weekday_afternoon", "weekend_afternoon"]);
    expect(restored.visit.catTimeWindows).toEqual([]);
  });

  test("clears retired draft answers while preserving other entries", () => {
    const draft = {
      contact: { applicantName: "Ada", preferredContactMethod: "email" },
      readiness: { dailySchedule: "Home nights", householdAgreement: "Everyone agrees" },
      visit: { catTimeWindows: ["weekday_morning", "weekday_evening"] },
    };
    expect(draftHasRetiredAnswers(draft)).toBe(true);
    const restored = mergeDraftValues(createDefaultValues(), draft, ["cat"]);
    expect(restored.contact.applicantName).toBe("Ada");
    expect(String(restored.contact.preferredContactMethod)).toBe("");
    expect(restored.readiness.dailySchedule).toBe("Home nights");
    expect(String(restored.readiness.householdAgreement)).toBe("");
    expect(restored.visit.catTimeWindows).toEqual(["weekday_evening"]);
  });

  test("prunes only inapplicable windows after an explicit species change", () => {
    const nextVisit = normalizeApplicationVisitValues(
      {
        ...createDefaultValues().visit,
        dogTimeWindows: ["weekday_afternoon"],
        catTimeWindows: ["weekday_evening"],
      },
      ["cat"],
    );

    expect(nextVisit.dogTimeWindows).toEqual([]);
    expect(nextVisit.catTimeWindows).toEqual(["weekday_evening"]);
  });
});
