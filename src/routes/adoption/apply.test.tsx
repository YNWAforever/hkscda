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
}));

mock.module("../../components/site/adoption/ApplicationWizard", () => ({
  ApplicationWizard: () => <p>wizard-content</p>,
}));

describe("adoption apply route", () => {
  test("wraps ApplicationWizard with a breadcrumb and trust note", async () => {
    const { ApplyPage } = await import("./apply");
    const markup = renderToStaticMarkup(<ApplyPage />);

    expect(markup).toContain("wizard-content");
    expect(markup).toContain('href="/adoption/instructions"');
    expect(markup).toContain("返回領養須知");
    expect(markup).toContain("detail-breadcrumb");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("你的個人資料只會用於處理領養申請及聯絡，不會作其他用途。");
  });
});
