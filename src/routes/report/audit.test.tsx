import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import type { AnnualReport } from "@/lib/documents/types";

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const report2526: AnnualReport = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "2025-2026 Annual Report",
  yearLabel: "2025-26",
  document: {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "annual_report",
    title: "2025-2026 Annual Report",
    language: "bilingual",
    bucketName: "site-documents",
    objectPath: "annual-reports/2025-26.pdf",
    fileUrl: "https://documents.example/2025-26.pdf",
    mimeType: "application/pdf",
    byteSize: 29_400_000,
    checksumSha256: null,
    isPublished: true,
    sortOrder: 0,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
  isPublished: true,
  sortOrder: 0,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

const report2425: AnnualReport = {
  ...report2526,
  id: "33333333-3333-4333-8333-333333333333",
  title: "2024-2025 Year-End Review Winter Edition",
  yearLabel: "2024-25",
  document: {
    ...report2526.document,
    id: "44444444-4444-4444-8444-444444444444",
    title: "2024-2025 Year-End Review Winter Edition",
    objectPath: "annual-reports/2024-25.pdf",
    fileUrl: "https://documents.example/2024-25.pdf",
    byteSize: 8_500_000,
  },
};

test("renders annual reports and removes all sensitive audit summaries", async () => {
  const { AnnualReportPage } = await import("./audit");
  const html = renderToString(
    <AnnualReportPage
      reports={[
        report2526,
        report2425,
        {
          ...report2425,
          id: "55555555-5555-4555-8555-555555555555",
          title: "Unavailable report",
          document: { ...report2425.document, fileUrl: null },
        },
      ]}
    />,
  );

  expect(html).toContain("年度報告 Annual Report");
  expect(html).toContain("我們每年發表協會年度報告電子書，分享救援成果與資金運用摘要。");
  expect(html).toContain("2025-2026 Annual Report");
  expect(html).toContain("2024-2025 Year-End Review Winter Edition");
  expect(html).not.toContain("Unavailable report");
  expect(html).not.toContain("總收入");
  expect(html).not.toContain("總支出");
  expect(html).not.toContain("盈餘");
  expect(html).toContain(">2025–26<");
  expect(html).toContain(">2024–25<");
  expect(html.match(/查看報告 \/ View Report/g)).toHaveLength(2);
  expect(html).toContain(
    'aria-label="查看 2025-2026 Annual Report（在新分頁開啟） / View report in a new tab"',
  );
  expect(html.match(/target="_blank"/g)).toHaveLength(2);
  expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
});
