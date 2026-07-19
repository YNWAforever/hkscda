import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { VisitFields, nextVisitWindowSelection } from "./WizardFields";

function renderVisitFields(values: Record<string, unknown>, errors: unknown = {}) {
  const watch = ((name: string) => values[name]) as never;
  return renderToStaticMarkup(
    <VisitFields register={(() => ({})) as never} errors={errors as never} setValue={(() => {}) as never} watch={watch} />,
  );
}

describe("VisitFields", () => {
  test("renders only the dog group for a dog-only shortlist", () => {
    const markup = renderVisitFields({
      animalPreferences: [{ animalType: "dog" }],
      "visit.dogTimeWindows": [],
      "visit.catTimeWindows": [],
    });

    expect(markup).toContain("狗舍參觀時間");
    expect(markup).toContain("Dog visit windows");
    expect(markup).not.toContain("貓舍參觀時間");
    expect(markup).not.toContain("Weekday morning");
  });

  test("renders separately labelled dog and cat groups", () => {
    const markup = renderVisitFields({
      animalPreferences: [{ animalType: "dog" }, { animalType: "cat" }],
      "visit.dogTimeWindows": ["weekday_afternoon"],
      "visit.catTimeWindows": ["weekday_morning"],
    });

    expect(markup).toContain("狗舍參觀時間");
    expect(markup).toContain("貓舍參觀時間");
    expect(markup).toContain("Cat visit windows");
  });

  test("toggles and orders checkbox values canonically", () => {
    expect(
      nextVisitWindowSelection(
        ["weekend_afternoon"],
        "weekday_afternoon",
        ["weekday_afternoon", "weekend_afternoon"],
      ),
    ).toEqual(["weekday_afternoon", "weekend_afternoon"]);
    expect(
      nextVisitWindowSelection(
        ["weekday_afternoon", "weekend_afternoon"],
        "weekday_afternoon",
        ["weekday_afternoon", "weekend_afternoon"],
      ),
    ).toEqual(["weekend_afternoon"]);
  });

  test("announces grouped validation errors inline", () => {
    const markup = renderVisitFields(
      {
        animalPreferences: [{ animalType: "cat" }],
        "visit.dogTimeWindows": [],
        "visit.catTimeWindows": [],
      },
      { visit: { catTimeWindows: { message: "Select at least one cat visit window" } } },
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Select at least one cat visit window");
  });
});
