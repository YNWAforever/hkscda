import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationProfileLink } from "./VolunteerRegistrationDetail";
test("canonical registration links to its person", () => {
  const html = renderToStaticMarkup(
    createElement(RegistrationProfileLink, { profileId: "canonical-profile" }),
  );
  expect(html).toContain("/admin/volunteers/people/canonical-profile");
  expect(html).toContain("查看義工個人詳情");
});
test("legacy registrations offer reconciliation instead of a guessed person", () => {
  const html = renderToStaticMarkup(createElement(RegistrationProfileLink, { profileId: null }));
  expect(html).toContain("/admin/volunteers/qualifications");
  expect(html).toContain("身份未連結");
  expect(html).not.toContain("/people/");
});
