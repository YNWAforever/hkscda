import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryResults } from "./VolunteerDirectory";
import { parseDirectorySearch } from "./directorySearch";

const profile = {
  id: "profile-1",
  display_name: "同名義工",
  birth_date: "1990-01-01",
  tier: "newcomer" as const,
  status: "pending" as const,
  verified_at: null,
  joined_on: null,
  history_coverage_start: null,
  revision: 1,
  linked_email: "fixture@example.test",
  email_verified: true,
  account_linked: true,
};
describe("volunteer directory", () => {
  test("shows zero-registration profiles and distinguishes verified email from pending identity", () => {
    const html = renderToStaticMarkup(
      createElement(DirectoryResults, {
        data: { profiles: [profile], total: 51, page: 2, limit: 25 },
        search: { q: "fixture", page: 2 },
      }),
    );
    expect(html).toContain("fixture@example.test");
    expect(html).toContain("待核實");
    expect(html).toContain("電郵已驗證");
    expect(html).toContain("51");
    expect(html).toContain("/admin/volunteers/people/profile-1?");
    expect(html).toContain("page=2");
  });
  test("admin selection is explicit and unavailable without selection context", () => {
    const props = {
      data: { profiles: [profile], total: 1, page: 1, limit: 25 },
      search: { page: 1 },
    };
    expect(renderToStaticMarkup(createElement(DirectoryResults, props))).not.toContain(
      'type="checkbox"',
    );
    const html = renderToStaticMarkup(
      createElement(DirectoryResults, {
        ...props,
        selection: { ids: [profile.id], disabled: false, toggle: () => {} },
      }),
    );
    expect(html).toContain('aria-label="選取 同名義工"');
    expect(html).toContain('checked=""');
  });
  test("distinguishes no search results from empty directory", () => {
    const data = { profiles: [], total: 0, page: 1, limit: 25 };
    expect(
      renderToStaticMarkup(
        createElement(DirectoryResults, { data, search: { q: "missing", page: 1 } }),
      ),
    ).toContain("找不到符合條件的義工");
    expect(
      renderToStaticMarkup(createElement(DirectoryResults, { data, search: { page: 1 } })),
    ).toContain("尚未有義工身份");
  });
  test("normalizes invalid URL filters and clamps untrusted query length", () => {
    expect(
      parseDirectorySearch({ q: " a ", status: "invalid", tier: "senior", page: "-4" }),
    ).toEqual({ q: "a", status: undefined, tier: "senior", page: 1 });
    expect(parseDirectorySearch({ q: "x".repeat(300), page: "2" }).q?.length).toBe(200);
    expect(parseDirectorySearch({ page: "1000001" }).page).toBe(1);
  });
});
