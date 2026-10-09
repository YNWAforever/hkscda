import { describe, expect, mock, test } from "bun:test";

import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../../components/admin/i18n/testing";
import { accessDeniedCopy } from "./-accessDeniedCopy";

const realQuery = await import("@tanstack/react-query");

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({ data: { admin: { role: "treasurer" } } }),
}));

const { AccessDeniedContent } = await import("./access-denied");

describe("access denied page", () => {
  test("is in English without Chinese, and links back to the first allowed page", () => {
    const markup = renderAdminInEnglish(<AccessDeniedContent />);
    expectNoChineseText(markup);
    expect(markup).toMatch(/<h1[^>]*>Access denied<\/h1>/);
    expect(markup).toContain("Your admin role does not have access to this page.");
    expect(markup).toMatch(/<a href="\/admin[^"]*"[^>]*>Back to an available admin area<\/a>/);
  });

  test("is unchanged in Chinese", () => {
    const markup = renderAdminInChinese(<AccessDeniedContent />);
    expect(markup).toMatch(/<h1[^>]*>沒有權限<\/h1>/);
    expect(markup).toContain("你的管理員角色未能開啟此頁面。");
    expect(markup).toContain("返回可用管理頁面");
  });

  test("has no Chinese anywhere in the English copy", () => {
    expectNoChineseInCopy(accessDeniedCopy.en);
  });
});
