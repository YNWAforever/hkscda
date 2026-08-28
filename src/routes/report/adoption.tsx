import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { getAdoptionImpactReport } from "../../lib/adoptions/publicImpact.functions";
import type { AdoptionImpactReport } from "../../lib/adoptions/publicImpact";

export const Route = createFileRoute("/report/adoption")({
  loader: resilientPublicLoader(() => getAdoptionImpactReport()),
  errorComponent: AdoptionImpactReportLoadError,
  head: () => ({
    meta: [
      { title: "領養工作成效 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會累計成功領養總數及過去12個月數字，每月更新，統計口徑與資料截止日期於本頁公開。",
      },
      { property: "og:title", content: "領養工作成效 · HKSCDA" },
      { property: "og:description", content: "累計成功領養總數及過去12個月數字，每月更新。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/report/adoption") }],
  }),
  component: AdoptionReportRoute,
});

function AdoptionReportRoute() {
  const result = Route.useLoaderData();
  if (result.status === "error") return <AdoptionImpactReportLoadError />;
  return <AdoptionImpactReportPage report={result.data} />;
}

function formatAsOf(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function AdoptionImpactReportPage({ report }: { report: AdoptionImpactReport }) {
  return (
    <PublicPageFrame
      eyebrow="透明與問責"
      title="領養工作成效"
      description="我們公開領養成效的統計方式與資料來源。數字來自已完成的領養記錄，並以核准日期歸入相應月份。"
      chapters={[
        {
          eyebrow: "統計口徑",
          title: "怎樣計算一次成功領養",
          description:
            "成效數據以已完成的領養記錄為準，並以核准日期歸入相應月份；未完成、已取消或仍在跟進的個案不會計入。",
          bullets: [
            "以核准日期歸入月份，不以資料更新時間計算",
            "同一動物的重複記錄只計算一次",
            "不公開任何可識別領養者身分的資料",
          ],
        },
        {
          eyebrow: "發佈安排",
          title: "資料截止日期與更新頻率",
          description:
            "每次發佈都會標示資料截止日期與發佈日期，讓讀者知道數字對應的時間範圍；在未有核實數據前，本頁不會顯示零值或估算數字。",
        },
      ]}
      cta={{
        eyebrow: "查看其他公開資料",
        title: "年報及審計報告已經公開。",
        description: "如需了解協會的財務與工作紀錄，可先查閱已發佈的年報及審計報告。",
        action: { label: "查看年報及審計", to: "/report/audit" },
      }}
    >
      <section className="section">
        <div className="public-container">
          <div className="impact-data">
            <div>
              <strong>{report.total}</strong>
              <span>累計成功領養宗數</span>
            </div>
          </div>

          <ul className="mt-8 divide-y divide-[var(--color-border)]">
            {report.monthly.map((m) => (
              <li key={m.month} className="flex items-center justify-between py-3">
                <span className="text-[var(--color-text-muted)]">{m.label}</span>
                <span className="font-bold text-[var(--color-text)]">{m.count}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            資料截至 {formatAsOf(report.asOf)}
          </p>
        </div>
      </section>
    </PublicPageFrame>
  );
}

export function AdoptionImpactReportLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div
        role="alert"
        className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6"
      >
        <h1 className="text-lg font-bold">暫時未能載入領養成效數據</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          請稍後再試，或電郵至{" "}
          <a className="underline" href="mailto:info@hkscda.com">
            info@hkscda.com
          </a>
          。
        </p>
        <a href="/report/adoption" className="btn-secondary mt-5 min-h-11">
          重新載入 / Retry
        </a>
      </div>
    </main>
  );
}
