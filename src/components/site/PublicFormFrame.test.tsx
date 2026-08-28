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

describe("PublicFormFrame", () => {
  test("omits the breadcrumb when no href/label is given, and renders the trust note", async () => {
    const { PublicFormFrame } = await import("./PublicFormFrame");
    const markup = renderToStaticMarkup(
      <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
        <p>status-content</p>
      </PublicFormFrame>,
    );

    expect(markup).not.toContain("detail-breadcrumb");
    expect(markup).toContain("status-content");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("此為私人查閱連結，請勿轉發。");
  });

  test("renders the breadcrumb when both href and label are given", async () => {
    const { PublicFormFrame } = await import("./PublicFormFrame");
    const markup = renderToStaticMarkup(
      <PublicFormFrame breadcrumbHref="/volunteer" breadcrumbLabel="返回個人義工報名">
        <p>form-content</p>
      </PublicFormFrame>,
    );

    expect(markup).toContain('href="/volunteer"');
    expect(markup).toContain("返回個人義工報名");
    expect(markup).toContain("detail-breadcrumb");
  });
});
