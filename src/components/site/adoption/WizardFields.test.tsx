import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ContactFields,
  ReadinessFields,
  VisitFields,
  nextVisitWindowSelection,
} from "./WizardFields";

function renderVisitFields(values: Record<string, unknown>, errors: unknown = {}) {
  const watch = ((name: string) => values[name]) as never;
  return renderToStaticMarkup(
    <VisitFields
      register={(() => ({})) as never}
      errors={errors as never}
      setValue={(() => {}) as never}
      watch={watch}
    />,
  );
}

describe("ContactFields", () => {
  test("offers phone and WhatsApp preference while retaining the email address input", () => {
    const markup = renderToStaticMarkup(
      <ContactFields register={(() => ({})) as never} errors={{}} />,
    );
    expect(markup).toContain('id="contact-email"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('value="whatsapp"');
    expect(markup).toContain('value="phone"');
    expect(markup).not.toContain('value="email"');
  });
});

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
    expect(markup).not.toContain("Weekday morning");
    expect(markup).not.toContain("Weekend morning");
  });

  test("toggles and orders checkbox values canonically", () => {
    expect(
      nextVisitWindowSelection(["weekend_afternoon"], "weekday_afternoon", [
        "weekday_afternoon",
        "weekend_afternoon",
      ]),
    ).toEqual(["weekday_afternoon", "weekend_afternoon"]);
    expect(
      nextVisitWindowSelection(["weekday_afternoon", "weekend_afternoon"], "weekday_afternoon", [
        "weekday_afternoon",
        "weekend_afternoon",
      ]),
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

test("asks whether all household members agree with explicit Yes and No choices", () => {
  const markup = renderToStaticMarkup(
    <ReadinessFields register={(() => ({})) as never} errors={{}} />,
  );
  expect(markup).toContain("所有家庭成員同意");
  expect(markup).toContain("All household members agree");
  expect(markup).toContain('value="yes"');
  expect(markup).toContain('value="no"');
});
