import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/" } }),
}));

describe("public site chrome", () => {
  test("uses the official logo and adoption-led action hierarchy", async () => {
    const { Header } = await import("./Header");
    const { reportLinks } = await import("./reportNavigation");
    const markup = renderToStaticMarkup(<Header />);

    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("查看待領養動物");
    expect(markup).toContain("立即捐助");
    expect(reportLinks).toContainEqual({
      to: "/report/audit",
      label: "年度報告",
      desc: "歷年救援成果及資金運用摘要",
    });
    expect(markup).not.toContain("shimmer-surface");
    expect(markup).not.toContain("PawPrint");
  });

  test("footer keeps verified organisation identity without paw or emoji decoration", async () => {
    const { Footer } = await import("./Footer");
    const markup = renderToStaticMarkup(<Footer />);

    expect(markup).toContain("/brand/hkscda-logo-primary.jpg");
    expect(markup).toContain("91/14493");
    expect(markup).toContain('href="/report/audit"');
    expect(markup).not.toContain("年度核數報告");
    expect(markup).not.toContain("🐾");
    expect(markup).not.toContain("pink-strip");
  });
});
