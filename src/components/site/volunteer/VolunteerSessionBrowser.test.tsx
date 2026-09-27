import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VolunteerSessionBrowser } from "./VolunteerSessionBrowser";

function render(query = "") {
  return renderToStaticMarkup(
    <VolunteerSessionBrowser
      sessions={[]}
      filter={{ query, shelter: "all", date: "", page: 1 }}
      selected=""
      onSelect={() => {}}
      loading={false}
      onRetry={() => {}}
    />,
  );
}

describe("volunteer session empty state", () => {
  test("a filtered empty result does not claim the service has no published sessions", () => {
    const markup = render("cat");
    expect(markup).toContain("沒有符合篩選條件");
    expect(markup).not.toContain("目前未有已發布");
  });

  test("an unfiltered empty result offers the approved contact channel without invented dates", () => {
    const markup = render();
    expect(markup).toContain("目前未有已發布");
    expect(markup).toContain('href="mailto:info@hkscda.com"');
    expect(markup).not.toMatch(/下一次.*20\d\d/);
  });
});
