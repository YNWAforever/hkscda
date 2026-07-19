import { describe, expect, mock, test } from "bun:test";

import { fetchAllAnnualReportAssets, pageAfterDelete } from "./documentManagementLogic";

describe("document management interaction logic", () => {
  test("moves back when deleting the last item on the current page", () => {
    expect(pageAfterDelete({ page: 2, total: 26, pageSize: 25 })).toBe(1);
    expect(pageAfterDelete({ page: 2, total: 27, pageSize: 25 })).toBe(2);
    expect(pageAfterDelete({ page: 1, total: 1, pageSize: 25 })).toBe(1);
  });

  test("loads every annual-report asset page", async () => {
    const fetchPage = mock(async (page: number) => {
      if (page === 1) {
        return {
          items: [{ id: "asset-1" }, { id: "asset-2" }],
          total: 3,
        };
      }
      return { items: [{ id: "asset-3" }], total: 3 };
    });

    await expect(fetchAllAnnualReportAssets(fetchPage)).resolves.toEqual([
      { id: "asset-1" },
      { id: "asset-2" },
      { id: "asset-3" },
    ]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
  });
});
