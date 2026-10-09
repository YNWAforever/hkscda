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
      itemName: "Typical Species 一般品種",
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
      estateName: "美孚新邨",
      district: "荔枝角",
      notes: "需預約，狗隻須繫繩",
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

    expect(markup).toContain("領養費用");
    expect(markup).toContain("Typical Species 一般品種");
    expect(markup).toContain("頁面內容");
    expect(markup).toContain('value="HK$1,500"');
    expect(markup).toContain("狗隻");
    expect(markup).toContain("貓隻");
    // The dog fee has move buttons; the cat section has no fee yet.
    expect(markup).toContain("上移");
    expect(markup).toContain("下移");
    expect(markup).toContain("沒有領養費用資料");
    expect(markup).toContain('href="/admin/content/adoption-guides"');
    expect(markup).toContain("領養後指南版本");
  });

  test("supports estate create, edit, publish, and delete controls", () => {
    const markup = renderAdminInChinese(
      <AdoptionInformationManagementView activeTab="estates" data={estates} query="" />,
    );

    expect(markup).toContain("可養狗屋苑");
    expect(markup).toContain("新增屋苑");
    expect(markup).toContain("編輯屋苑");
    expect(markup).toContain('value="美孚新邨"');
    expect(markup).toContain('value="荔枝角"');
    expect(markup).toContain('value="需預約，狗隻須繫繩"');
    expect(markup).toContain('aria-label="屋苑名稱"');
    // The estate is not published yet, so it offers to publish it; every estate can be deleted.
    expect(markup).toContain(">發佈</button>");
    expect(markup).not.toContain("取消發佈");
    expect(markup).toContain("刪除</button>");
    expect(markup).toContain(">編輯</button>");
  });

  test("offers to unpublish an estate that is published", () => {
    const published: AdminAdoptionInformationPage = {
      ...estates,
      items: estates.items.map((item) => ({ ...item, isPublished: true })),
    };
    const markup = renderAdminInChinese(
      <AdoptionInformationManagementView activeTab="estates" data={published} query="" />,
    );

    expect(markup).toContain(">取消發佈</button>");
    expect(markup).not.toContain(">發佈</button>");
    expect(markup).toContain("刪除</button>");
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
