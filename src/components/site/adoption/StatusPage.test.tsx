import { afterAll, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const realQuery = await import("@tanstack/react-query");
const realRouter = await import("@tanstack/react-router");
let progress = "received";
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      status: {
        reference: "APP-SYNTHETIC",
        submittedAt: "2026-10-28T00:00:00Z",
        applicantName: "Synthetic applicant",
        contactSummary: "00000000",
        rankedAnimals: [],
        visitPreference: null,
        expiresAt: "2099-01-01T00:00:00Z",
        progress,
      },
    },
  }),
}));
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { StatusPage } = await import("./StatusPage");
afterAll(() => {
  mock.module("@tanstack/react-query", () => realQuery);
  mock.module("@tanstack/react-router", () => realRouter);
});

test("the applicant sees current public progress and no intake instructions after closure", () => {
  for (const [value, title] of [
    ["received", "領養申請已收到"],
    ["in_progress", "領養申請跟進中"],
    ["closed", "領養申請已結案"],
    ["completed", "領養手續已完成"],
  ]) {
    progress = value;
    const markup = renderToStaticMarkup(<StatusPage token={"A".repeat(43)} />);
    expect(markup).toContain(title);
    if (value === "closed" || value === "completed") {
      expect(markup).not.toContain("義工核對申請資料");
      expect(markup).not.toContain("聯絡你確認探訪");
      expect(markup).not.toContain("義工聯絡時會再確認合適時間");
    }
  }
});
