import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CCCPContent } from "./cccp";
import type { CccpPageContent } from "../../lib/aboutPages/types";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

describe("CCCPContent", () => {
  test("falls back to the default content", () => {
    const markup = renderToStaticMarkup(<CCCPContent content={null} />);
    expect(markup).toContain("CCCP 社區貓照顧計劃");
    expect(markup).toContain("什麼是 CCCP");
    expect(markup).toContain("日常照顧");
    expect(markup).toContain("CCCP 的工作方式");
  });

  test("renders loaded content in place of the default", () => {
    const custom: CccpPageContent = {
      hero: { eyebrow: "自訂標語", title: "自訂 CCCP 標題", description: "自訂描述" },
      chapters: [
        { title: "自訂章節一標題", description: "自訂章節一描述" },
        { title: "自訂章節二標題", description: "自訂章節二描述" },
      ],
      workRows: [
        { scope: "自訂範圍一", method: "自訂做法一", result: "自訂結果一" },
        { scope: "自訂範圍二", method: "自訂做法二", result: "自訂結果二" },
        { scope: "自訂範圍三", method: "自訂做法三", result: "自訂結果三" },
      ],
      workSectionTitle: "自訂表格標題",
      cta: {
        eyebrow: "自訂CTA標語",
        title: "自訂CTA標題",
        description: "自訂CTA描述",
        points: ["自訂重點一", "自訂重點二", "自訂重點三"],
      },
    };
    const markup = renderToStaticMarkup(<CCCPContent content={custom} />);
    expect(markup).toContain("自訂 CCCP 標題");
    expect(markup).toContain("自訂章節一標題");
    expect(markup).toContain("自訂章節二標題");
    expect(markup).toContain("自訂範圍一");
    expect(markup).toContain("自訂做法二");
    expect(markup).toContain("自訂結果三");
    expect(markup).toContain("自訂表格標題");
    expect(markup).toContain("自訂重點二");
    expect(markup).not.toContain("CCCP 社區貓照顧計劃");
    expect(markup).not.toContain("什麼是 CCCP");
  });
});
