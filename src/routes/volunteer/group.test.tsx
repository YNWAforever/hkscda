import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("volunteer group enquiry page", () => {
  test("contains the approved title, disclaimer, labels, and accessible states", () => {
    const routeSource = readFileSync(new URL("./group.tsx", import.meta.url), "utf8");
    const formSource = readFileSync(
      new URL("../../components/site/volunteer/GroupEnquiryForm.tsx", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("團體活動查詢");
    expect(routeSource).toContain("本頁僅供註冊團體使用。");
    expect(routeSource).toContain("<GroupEnquiryForm");
    for (const label of ["團體名稱", "聯絡人", "電郵", "電話 / WhatsApp", "活動類型"]) {
      expect(formSource).toContain(label);
    }
    for (const label of ["團體義工工作坊", "入校講座", "貓狗舍教育參觀活動", "其他活動查詢"]) {
      expect(formSource).toContain(label);
    }
    expect(formSource).toContain("請描述活動內容");
    expect(formSource).toContain("送出中");
    expect(formSource).toContain("查詢已送出");
    expect(formSource).toContain('role="alert"');
  });

  test("is reachable through the volunteer parent route", () => {
    const parentSource = readFileSync(new URL("../volunteer.tsx", import.meta.url), "utf8");
    expect(parentSource).toContain("/volunteer/group");
    expect(parentSource).toContain('pathname.startsWith("/volunteer/group")');
  });
});

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

mock.module("../../components/site/volunteer/GroupEnquiryForm", () => ({
  GroupEnquiryForm: () => <p>group-form-content</p>,
}));

describe("volunteer group enquiry route wrap", () => {
  test("wraps the page in PublicFormFrame with a breadcrumb back to /volunteer and a trust note", async () => {
    const { VolunteerGroupPage } = await import("./group");
    const markup = renderToStaticMarkup(<VolunteerGroupPage />);

    expect(markup).toContain("group-form-content");
    expect(markup).toContain('href="/volunteer"');
    expect(markup).toContain("返回個人義工報名");
    expect(markup).toContain("detail-breadcrumb");
    expect(markup).toContain("trust-cue");
    expect(markup).toContain("你的個人資料只會用於處理團體活動查詢及聯絡，不會作其他用途。");
    expect(markup).toContain("團體活動查詢");
  });
});
