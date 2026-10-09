import { describe, expect, mock, test } from "bun:test";
import { renderAdminInChinese } from "../i18n/testing";

import type { AdminAdoptionInformationPage } from "../../../lib/adoptionInformation/types";
import {
  ADOPTION_INFORMATION_QUERY_KEY,
  AdoptionInformationManagement,
  AdoptionInformationManagementView,
  buildAdoptionInformationSearchParams,
  invalidateAdoptionInformationQueries,
} from "./AdoptionInformationManagement";

const fees: AdminAdoptionInformationPage = {
  resource: "fees",
  items: [
    {
      id: "11111111-2222-4333-8444-555555555555",
      animalType: "dog",
      itemName: "Typical Species ????",
      priceHkd: "HK$1,500",
      sortOrder: 0,
      isPublished: true,
      version: 1,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

const estates: AdminAdoptionInformationPage = {
  resource: "estates",
  items: [
    {
      id: "66666666-7777-4888-9999-000000000000",
      version: 1,
      estateName: "????",
      district: "??",
      notes: "????????",
      sortOrder: 0,
      isPublished: false,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

describe("AdoptionInformationManagement", () => {
  test("preserves fee prices as text and renders species-scoped editing", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );

    expect(markup).toContain("????");
    expect(markup).toContain("Typical Species ????");
    expect(markup).toContain("頁面內容");
    expect(markup).toContain('value="HK$1,500"');
    expect(markup).toContain("??");
    expect(markup).toContain("??");
    expect(markup).toContain("??");
    expect(markup).toContain('href="/admin/content/adoption-guides"');
    expect(markup).toContain("\u9818\u990a\u5f8c\u6307\u5357\u7248\u672c");
  });

  test("supports estate create, edit, publish, and delete controls", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagementView activeTab="estates" data={estates} query="" />,
    );

    expect(markup).toContain("?????");
    expect(markup).toContain("????");
    expect(markup).toContain("????");
    expect(markup).toContain("??");
    expect(markup).toContain("??");
    expect(markup).toContain("??");
  });

  test("announces loading, error, and empty states", () => {
    expect(
      renderAdminInChinese(<AdoptionInformationManagementView activeTab="fees" loading query="" />),
    ).toContain("載入領養資料中");
    expect(
      renderAdminInChinese(
        <AdoptionInformationManagementView activeTab="fees" error="Could not load" query="" />,
      ),
    ).toContain('role="alert"');
    expect(
      renderAdminInChinese(
        <AdoptionInformationManagementView
          activeTab="estates"
          data={{ ...estates, items: [], total: 0 }}
          query=""
        />,
      ),
    ).toContain("沒有可養狗屋苑資料");
  });

  test("uses the shared TablePager for estates and blocks paging forward on a load error", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagementView
        activeTab="estates"
        data={{ ...estates, total: 120 }}
        page={1}
        query=""
        error="boom"
        onPageChange={() => undefined}
      />,
    );
    expect(markup).toContain("下一頁");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("bounds search pages and invalidates every adoption-information query", async () => {
    expect(
      buildAdoptionInformationSearchParams({
        resource: "estates",
        q: "  南區  ",
        page: 0,
        pageSize: 500,
      }).toString(),
    ).toBe("resource=estates&page=1&pageSize=50&q=%E5%8D%97%E5%8D%80");

    const invalidateQueries = mock(async () => undefined);
    await invalidateAdoptionInformationQueries({ invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ADOPTION_INFORMATION_QUERY_KEY,
    });
  });

  test("renders all four content tabs, including rules and care topics", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );
    expect(markup).toContain("領養規則");
    expect(markup).toContain("動物照顧須知");
  });

  test("renders fee move controls from canonical versioned rows", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagementView activeTab="fees" data={fees} query="" pending />,
    );
    expect(markup).toContain("HK$1,500");
    expect(markup).toContain("disabled");
  });
});
