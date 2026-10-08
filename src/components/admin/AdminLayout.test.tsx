import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => async () => {},
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/admin" } }),
}));
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ clear: () => {} }),
  useQuery: () => ({ data: { admin: { email: "staff@example.org", role: "admin" } } }),
}));

const { AdminLayout } = await import("./AdminLayout");

describe("AdminLayout", () => {
  test("marks the admin shell as Hong Kong Chinese before a language is chosen", () => {
    const markup = renderToStaticMarkup(
      <AdminLayout activeSection="cat">
        <p>page</p>
      </AdminLayout>,
    );
    expect(markup).toContain('lang="zh-HK"');
    expect(markup).not.toContain('lang="en"');
  });
});
