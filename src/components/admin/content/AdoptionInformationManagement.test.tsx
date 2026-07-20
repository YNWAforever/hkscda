import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

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
    const markup = renderToStaticMarkup(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );

    expect(markup).toContain("????");
    expect(markup).toContain("Typical Species ????");
    expect(markup).toContain('value="HK$1,500"');
    expect(markup).toContain("??");
    expect(markup).toContain("??");
    expect(markup).toContain("??");
  });

  test("supports estate create, edit, publish, and delete controls", () => {
    const markup = renderToStaticMarkup(
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
      renderToStaticMarkup(<AdoptionInformationManagementView activeTab="fees" loading query="" />),
    ).toContain("載入領養資料中");
    expect(
      renderToStaticMarkup(
        <AdoptionInformationManagementView activeTab="fees" error="Could not load" query="" />,
      ),
    ).toContain('role="alert"');
    expect(
      renderToStaticMarkup(
        <AdoptionInformationManagementView
          activeTab="estates"
          data={{ ...estates, items: [], total: 0 }}
          query=""
        />,
      ),
    ).toContain("沒有可養狗屋苑資料");
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
});
