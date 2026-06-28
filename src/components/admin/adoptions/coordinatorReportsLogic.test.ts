import { describe, expect, test } from "bun:test";

import {
  buildExportHistorySearchParams,
  buildRegeneratedExportUrl,
  currentHongKongMonth,
} from "./coordinatorReportsLogic";

describe("coordinator reports logic", () => {
  test("builds export history search params", () => {
    expect(
      buildExportHistorySearchParams({
        month: "2026-06",
        kind: "cases",
        actor: " Ada ",
        page: 2,
        pageSize: 50,
      }).toString(),
    ).toBe("month=2026-06&kind=cases&actor=Ada&page=2&pageSize=50");
  });

  test("builds regenerated export URLs", () => {
    expect(buildRegeneratedExportUrl("aaaaaaaa-bbbb-4333-8444-555555555555")).toBe(
      "/api/admin/adoptions/reports/exports/aaaaaaaa-bbbb-4333-8444-555555555555/download",
    );
  });

  test("formats the current Hong Kong month", () => {
    expect(currentHongKongMonth(new Date("2026-05-31T18:00:00.000Z"))).toBe("2026-06");
  });
});
