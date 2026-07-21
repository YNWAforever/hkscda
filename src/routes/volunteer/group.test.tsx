import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("volunteer group enquiry page", () => {
  test("contains the approved title, disclaimer, labels, and accessible states", () => {
    const routeSource = readFileSync(new URL("./group.tsx", import.meta.url), "utf8");
    const formSource = readFileSync(new URL("../../components/site/volunteer/GroupEnquiryForm.tsx", import.meta.url), "utf8");

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
