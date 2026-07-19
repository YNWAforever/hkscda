import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AnnualReportManagement } from "./AnnualReportManagement";

const draftReport = {
  id: "22222222-3333-4444-8555-666666666666",
  title: "Annual Report 2025/26",
  yearLabel: "2025/26",
  isPublished: false,
  sortOrder: 1,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  document: {
    id: "11111111-2222-4333-8444-555555555555",
    kind: "annual_report" as const,
    title: "Annual Report 2025/26",
    language: "bilingual" as const,
    bucketName: "site-documents",
    objectPath: "annual-reports/2025-26.pdf",
    fileUrl: null,
    mimeType: "application/pdf" as const,
    byteSize: 1024,
    checksumSha256: null,
    isPublished: false,
    sortOrder: 0,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
};

describe("AnnualReportManagement", () => {
  test("disables report publication while its PDF asset is unpublished", () => {
    const markup = renderToStaticMarkup(<AnnualReportManagement initialRows={[draftReport]} />);

    expect(markup).toContain("年度報告");
    expect(markup).toContain("Annual Report 2025/26");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>發佈<\/button>/);
    expect(markup).toContain("請先發佈 PDF");
  });
});
