import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AdoptionImpactReport } from "@/lib/adoptions/publicImpact";

const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const report: AdoptionImpactReport = {
  total: 342,
  monthly: [
    { month: "2025-09", label: "2025年9月", count: 8 },
    { month: "2025-10", label: "2025年10月", count: 5 },
    { month: "2025-11", label: "2025年11月", count: 6 },
    { month: "2025-12", label: "2025年12月", count: 4 },
    { month: "2026-01", label: "2026年1月", count: 3 },
    { month: "2026-02", label: "2026年2月", count: 7 },
    { month: "2026-03", label: "2026年3月", count: 9 },
    { month: "2026-04", label: "2026年4月", count: 6 },
    { month: "2026-05", label: "2026年5月", count: 5 },
    { month: "2026-06", label: "2026年6月", count: 4 },
    { month: "2026-07", label: "2026年7月", count: 6 },
    { month: "2026-08", label: "2026年8月", count: 5 },
  ],
  asOf: "2026-08-15T00:00:00.000Z",
};

test("renders the lifetime total and all 12 months", async () => {
  const { AdoptionImpactReportPage } = await import("./adoption");
  const html = renderToString(<AdoptionImpactReportPage report={report} />);

  expect(html).toContain("342");
  expect(html).toContain("2025年9月");
  expect(html).toContain("2026年8月");
  expect(html).not.toContain("暫未發佈");
  expect(html.match(/<h1/g) ?? []).toHaveLength(1);
});

test("renders a real verified zero without suppressing it", async () => {
  const { AdoptionImpactReportPage } = await import("./adoption");
  const zeroReport: AdoptionImpactReport = { ...report, total: 0 };
  const html = renderToString(<AdoptionImpactReportPage report={zeroReport} />);

  expect(html).toContain(">0<");
});

test("shows a distinct temporarily-unavailable state on load failure", async () => {
  const { AdoptionImpactReportLoadError } = await import("./adoption");
  const html = renderToString(<AdoptionImpactReportLoadError />);

  expect(html).toContain("暫時未能載入");
  expect(html).not.toContain("暫未發佈");
  expect(html).toContain('role="alert"');
});
