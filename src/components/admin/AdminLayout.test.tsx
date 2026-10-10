import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ADMIN_NAV_ITEMS } from "./adminNav";
import { LoadFailure } from "./LoadFailure";
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

    test("gives a forbidden failure on the page a link to the first page the role can open", () => {
      pathname = "/admin";
      const forbidden = Object.assign(new Error("no"), { status: 403 });
      const page = (
        <AdminLayout activeSection="cat">
          <LoadFailure error={forbidden} onRetry={() => {}} />
        </AdminLayout>
      );
      role = "treasurer";
      expect(renderAdminInEnglish(page)).toContain('href="/admin?section=payments"');
      role = "staff";
      expect(renderAdminInEnglish(page)).toContain('href="/admin?section=cat"');
      // Until the identity is known the line stands without a link to a guess.
      role = null;
      const unknown = renderAdminInEnglish(page);
      expect(unknown).toContain(
        "You don&#x27;t have access to this. Go to a page your role can open.",
      );
      expect(unknown).not.toContain('href="/admin?section=');
    });

    test("draws one breadcrumb: group, destination and the record the page names", () => {
      role = "admin";
      pathname = "/admin/supporters/abc";
      const named = renderAdminInEnglish(
        <AdminLayout activeSection="supporters" recordName="Chan Tai Man">
          <p>page</p>
        </AdminLayout>,
      );
      expect(named.match(/aria-label="Breadcrumb"/g)).toHaveLength(1);
      expect(named).toContain('<a href="/admin?section=payments">Donations and sponsorship</a>');
      expect(named).toContain('<a href="/admin/supporters">Supporters</a>');
      expect(named).toContain(
        '<li aria-current="page"><span aria-hidden="true"> / </span><span class="break-words">Chan Tai Man</span></li>',
      );
    });

    test("ends the breadcrumb at the destination when the record has no name", () => {
      role = "admin";
      pathname = "/admin/supporters/abc";
      for (const recordName of [undefined, null, "", "   "]) {
        const markup = renderAdminInEnglish(
          <AdminLayout activeSection="supporters" recordName={recordName}>
            <p>page</p>
          </AdminLayout>,
        );
        expect(markup, String(recordName)).toContain(
          '<li aria-current="page"><span aria-hidden="true"> / </span><span class="break-words">Supporters</span></li>',
        );
        expect(markup).not.toContain("undefined");
      }
    });

    test("shows the breadcrumb in Chinese with the same trail", () => {
      role = "admin";
      pathname = "/admin/supporters/abc";
      const markup = renderAdminInChinese(
        <AdminLayout activeSection="supporters" recordName="陳大文">
          <p>page</p>
        </AdminLayout>,
      );
      expect(markup).toContain('aria-label="導覽路徑"');
      expect(markup).toContain('<span class="break-words">陳大文</span>');
      expect(markup).toContain(">支持者</a>");
    });

    test("names the group without a link while the role is unknown", () => {
      role = null;
      pathname = "/admin/supporters/abc";
      const markup = renderAdminInEnglish(
        <AdminLayout activeSection="supporters">
          <p>page</p>
        </AdminLayout>,
      );
      expect(markup).toContain("<span");
      expect(markup).toContain("Donations and sponsorship</span>");
      expect(markup).not.toContain('href="/admin?section=payments"');
    });

    test("owns the page's only main landmark", () => {
      role = "admin";
      pathname = "/admin/applications";
      const markup = renderAdminInEnglish(layout("applications"));
      expect(markup.match(/<main/g)).toHaveLength(1);
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
