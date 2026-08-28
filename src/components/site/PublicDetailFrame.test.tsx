import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("PublicDetailFrame", () => {
  test("renders the breadcrumb link, panel, and main content in their own regions", async () => {
    const { PublicDetailFrame } = await import("./PublicDetailFrame");
    const markup = renderToStaticMarkup(
      <PublicDetailFrame
        breadcrumbHref="/animals/cat"
        breadcrumbLabel="返回貓貓列表"
        panel={<p>panel-content</p>}
      >
        <p>main-content</p>
      </PublicDetailFrame>,
    );

    expect(markup).toContain("detail-page");
    expect(markup).toContain('href="/animals/cat"');
    expect(markup).toContain("返回貓貓列表");
    expect(markup).toContain("detail-breadcrumb");
    expect(markup).toContain("detail-panel");
    expect(markup).toContain("panel-content");
    expect(markup).toContain("detail-main");
    expect(markup).toContain("main-content");
  });
});
