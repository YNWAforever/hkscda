import { createFileRoute } from "@tanstack/react-router";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { PublicStateShell } from "../../components/site/PublicStateShell";

export const Route = createFileRoute("/report/adoption")({
  head: () => ({
    meta: [
      { title: "領養工作成效 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會領養成效報告的統計口徑、資料截止日期與發佈安排。數據核實後於此公開。",
      },
      { property: "og:title", content: "領養工作成效 · HKSCDA" },
      { property: "og:description", content: "領養成效報告的統計口徑與發佈安排" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/report/adoption" }],
  }),
  component: AdoptionReportPage,
});

/**
 * Defect G-04 / blocker P0-05. This page read animals where status = adopted
 * directly from the browser, but the anonymous policy exposes only available
 * animals, so the query could only ever come back empty. The page then published
 * a total of 0 adoptions as though it were a measured figure - on the one page
 * whose purpose is transparency.
 *
 * Until BP-1 supplies a privacy-safe aggregate over successful_adoption, the page
 * states that the figures are not published yet and explains the methodology it
 * will publish them under. It does not show a zero, and it does not estimate.
 * The dataset JSON-LD is withheld for the same reason: there is no dataset yet.
 */
function AdoptionReportPage() {
  return (
    <PublicPageFrame
      eyebrow="透明與問責"
      title="領養工作成效"
      description="我們公開領養成效的統計方式與資料來源。數據經核實後會連同截止日期一併發佈。"
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
          <PublicStateShell
            headingLevel={2}
            title="暫未發佈"
            description="領養成效數據仍在核實，因此本頁暫不顯示數字。我們不會以零值、舊數字或估算數字代替尚未核實的資料。"
          />
        </div>
      </section>
    </PublicPageFrame>
  );
}
