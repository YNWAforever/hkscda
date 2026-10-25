import { expect, test } from "bun:test";
import { expectNoChineseInCopy, expectNoChineseText, renderAdminInEnglish } from "../i18n/testing";
const kit = await import("./volunteerKit.test.support");
const { VolunteerHourlyRetry } = await import("./VolunteerHourlyRetry");
const { volunteerHourlyRetryCopy } = await import("./volunteerHourlyRetryCopy");
const candidate = { bucket: "2026-10-25T03:00:00Z", expectedUpdatedAt: "2026-10-25T03:15:00Z" };
test("English admin sees the hourly action and bilingual errors have no untranslated Chinese", () => {
  kit.state.role = "admin";
  const markup = renderAdminInEnglish(<VolunteerHourlyRetry candidate={candidate} />);
  expect(markup).toContain("Rerun this hour&#x27;s job");
  expectNoChineseText(markup);
  expectNoChineseInCopy(volunteerHourlyRetryCopy.en);
});
for (const role of ["staff", "treasurer", null] as const) {
  test(`no hourly action is rendered for ${role}`, () => {
    kit.state.role = role;
    try {
      expect(renderAdminInEnglish(<VolunteerHourlyRetry candidate={candidate} />)).toBe("");
    } finally {
      kit.state.role = "admin";
    }
  });
}
