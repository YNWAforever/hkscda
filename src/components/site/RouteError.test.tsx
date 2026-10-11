import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    invalidate: async () => undefined,
    history: { push: () => undefined },
    state: { location: { pathname, searchStr: "" } },
  }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}));

mock.module("../../lib/lovable-error-reporting", () => ({
  reportLovableError: () => undefined,
}));

const render = async (path: string) => {
  pathname = path;
  const { RouteError } = await import("./RouteError");
  return renderToStaticMarkup(
    <RouteError error={new Error("relation animals does not exist")} reset={() => undefined} />,
  );
};

describe("route error boundary", () => {
  test("keeps the public error page on public routes", async () => {
    const html = await render("/internships");
    expect(html).toContain("頁面未能載入");
    expect(html).toContain('href="/"');
  });

  test("uses the admin's own failure state on /admin, without the error text", async () => {
    const html = await render("/admin/volunteers");
    expect(html).not.toContain("頁面未能載入");
    expect(html).toContain('role="alert"');
    // LoadFailure shows a reference, never the raw message.
    expect(html).not.toContain("relation animals does not exist");
  });
});
