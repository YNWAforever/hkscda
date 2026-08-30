import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TNRContent } from "./tnr";
import { brand } from "../../lib/brand/brand";
import type { TnrPageContent } from "../../lib/aboutPages/types";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

describe("TNRContent", () => {
  test("falls back to the default content and appends brand.org.email to the CTA", () => {
    const markup = renderToStaticMarkup(<TNRContent content={null} />);
    expect(markup).toContain("TNR 捕捉絕育放回");
    expect(markup).toContain("誘捕 Trap");
    expect(markup).toContain(
      "義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵 " + brand.org.email + "。",
    );
  });

  test("renders loaded content in place of the default", () => {
    const custom: TnrPageContent = {
      hero: { eyebrow: "自訂標語", title: "自訂 TNR 標題", description: "自訂描述" },
      stages: [
        { title: "自訂階段一標題", description: "自訂階段一描述" },
        { title: "自訂階段二標題", description: "自訂階段二描述" },
        { title: "自訂階段三標題", description: "自訂階段三描述" },
      ],
      chapter: {
        title: "自訂章節標題",
        description: "自訂章節描述",
        bullets: ["自訂重點一", "自訂重點二", "自訂重點三"],
      },
      cta: { eyebrow: "自訂CTA標語", title: "自訂CTA標題", descriptionPrefix: "自訂CTA前綴" },
    };
    const markup = renderToStaticMarkup(<TNRContent content={custom} />);
    expect(markup).toContain("自訂 TNR 標題");
    expect(markup).toContain("自訂階段一標題");
    expect(markup).toContain("自訂階段二標題");
    expect(markup).toContain("自訂階段三標題");
    expect(markup).toContain("自訂章節標題");
    expect(markup).toContain("自訂重點二");
    expect(markup).toContain("自訂CTA前綴 " + brand.org.email + "。");
    expect(markup).not.toContain("TNR 捕捉絕育放回");
    expect(markup).not.toContain("誘捕 Trap");
  });
});
