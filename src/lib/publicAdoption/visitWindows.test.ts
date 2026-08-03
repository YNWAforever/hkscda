import { describe, expect, test } from "bun:test";

import { normalizeVisitWindows, readVisitWindows } from "./visitWindows";

describe("adoption visit windows", () => {
  test("keeps only selected species and deduplicates in option order", () => {
    expect(
      normalizeVisitWindows(["dog"], {
        dog: ["weekend_afternoon", "weekday_afternoon", "weekend_afternoon"],
        cat: ["weekday_morning"],
      }),
    ).toEqual({ dog: ["weekday_afternoon", "weekend_afternoon"], cat: [] });

    expect(
      normalizeVisitWindows(["cat"], {
        dog: ["weekday_afternoon"],
        cat: ["weekend_afternoon", "weekday_morning", "weekday_morning"],
      }),
    ).toEqual({ dog: [], cat: ["weekday_morning", "weekend_afternoon"] });
  });

  test("falls back from grouped columns to the legacy union for selected species", () => {
    expect(
      readVisitWindows(
        {
          dog_time_windows: null,
          cat_time_windows: null,
          preferred_time_windows: ["weekday_morning", "weekday_afternoon"],
        },
        ["dog", "cat"],
      ),
    ).toEqual({
      dog: ["weekday_afternoon"],
      cat: ["weekday_morning", "weekday_afternoon"],
    });
  });

  test("prefers grouped columns and clears values for unselected species", () => {
    expect(
      readVisitWindows(
        {
          dog_time_windows: ["weekend_afternoon"],
          cat_time_windows: ["weekday_evening"],
          preferred_time_windows: ["weekday_afternoon"],
        },
        ["dog"],
      ),
    ).toEqual({ dog: ["weekend_afternoon"], cat: [] });
  });
});
