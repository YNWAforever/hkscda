import { expect, test } from "bun:test";
import { renderAdminInEnglish } from "./i18n/testing";
import { VolunteerPageHeading } from "./VolunteerPageHeading";
import { VOLUNTEER_WORKSPACE_PAGES } from "./volunteerWorkspace";
test("every primary volunteer page has one shared, bilingual heading", () => {
  for (const page of VOLUNTEER_WORKSPACE_PAGES) {
    const html = renderAdminInEnglish(<VolunteerPageHeading pageId={page.id as never} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('class="vw-page-header"');
  }
});
