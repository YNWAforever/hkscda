import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ADMIN_NAV_ITEMS } from "./adminNav";
import { expectNoChineseText, renderAdminInChinese, renderAdminInEnglish } from "./i18n/testing";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

let pathname = "/admin";
let role: "staff" | "treasurer" | "admin" | null = "admin";

type LinkProps = {
  children?: ReactNode;
  to: string;
  title?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
};

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    children,
    to,
    title,
    "aria-label": ariaLabel,
    "aria-current": ariaCurrent,
  }: LinkProps) => (
    <a href={to} title={title} aria-label={ariaLabel} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
  useNavigate: () => async () => {},
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname } }),
}));
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ clear: () => {} }),
  useQuery: () => ({
    data: role ? { admin: { email: "staff@example.org", role } } : undefined,
  }),
}));

const { AdminLayout } = await import("./AdminLayout");

function layout(activeSection: Parameters<typeof AdminLayout>[0]["activeSection"] = "cat") {
  return (
    <AdminLayout activeSection={activeSection}>
      <p>page</p>
    </AdminLayout>
  );
}

// The language toggle names each language in its own language, so it keeps this one word.
const TOGGLE_WORD = "中文";

describe("AdminLayout", () => {
  test("marks the admin shell as Hong Kong Chinese before a language is chosen", () => {
    const markup = renderToStaticMarkup(layout());
    expect(markup).toContain('lang="zh-HK"');
    expect(markup).not.toContain('lang="en"');
  });

  test("shows the shell in Chinese, as before", () => {
    pathname = "/admin/applications";
    role = "admin";
    const markup = renderAdminInChinese(layout("applications"));
    for (const text of ["待辦總覽", "動物管理", "領養管理", "捐款與助養", "系統設定", "登出"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('aria-label="待辦總覽"');
    expect(markup).toContain('aria-label="後台主要導覽"');
    expect(markup).toContain('aria-label="導覽路徑"');
    expect(markup).toContain("處理申請個案、領養配對與工作跟進。");
    expect(markup).toContain("手動建案");
  });

  describe("in English", () => {
    test("shows the navigation, the account menu and the page language without Chinese", () => {
      pathname = "/admin/applications";
      role = "admin";
      const markup = renderAdminInEnglish(layout("applications"));
      expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
      expect(markup).toMatch(/<div class="flex min-h-dvh" lang="en"/);
      expect(markup).not.toContain('lang="zh-HK"');
      for (const text of [
        "Task overview",
        "Animal management",
        "Adoption management",
        "Donations and sponsorship",
        "System settings",
        "Sign out",
        "Collapse sidebar",
        "Admin primary navigation",
        "Workspace navigation",
        "Breadcrumb",
        "Manual intake",
      ]) {
        expect(markup, text).toContain(text);
      }
      expect(markup).toContain('aria-label="Task overview"');
      expect(markup).not.toContain("Log out");
    });

    test("shows every navigation destination without Chinese, for every role", () => {
      for (const adminRole of ["staff", "treasurer", "admin"] as const) {
        role = adminRole;
        for (const item of ADMIN_NAV_ITEMS) {
          pathname = item.to.split("?")[0];
          const markup = renderAdminInEnglish(layout(item.section));
          expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
        }
      }
    });

    test("shows the volunteer workspace tabs and the sponsorship breadcrumb in English", () => {
      role = "admin";
      pathname = "/admin/volunteers/settings";
      const volunteers = renderAdminInEnglish(layout("volunteers"));
      expectNoChineseText(volunteers, { allow: [TOGGLE_WORD] });
      expect(volunteers).toContain("Volunteers and internships");
      expect(volunteers).toContain("Volunteer policy settings");

      pathname = "/admin/sponsorships";
      const sponsorship = renderAdminInEnglish(layout("payments"));
      expectNoChineseText(sponsorship, { allow: [TOGGLE_WORD] });
      expect(sponsorship).toContain("Sponsorship payments and matching");
    });

    test("shows a signed-out shell without Chinese", () => {
      role = null;
      pathname = "/admin";
      const markup = renderAdminInEnglish(layout());
      expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
      expect(markup).toContain("Sign out");
    });
  });
});
