import { createFileRoute } from "@tanstack/react-router";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { brand } from "../../lib/brand/brand";

export const Route = createFileRoute("/about/team")({
  head: () => ({
    meta: [
      { title: "團隊與管治 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "香港拯救貓狗協會的管治架構、義工團隊，以及聯絡團隊的方法。",
      },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/about/team" }],
  }),
  component: TeamPage,
});

/**
 * Defect G-09. The board section named two individuals and their offices in
 * hardcoded page source. Those are real people and an accountability claim, and
 * nothing in the repository establishes who approved the list or when it was last
 * correct, so it is not published from source. BP-3 supplies governance records
 * through the CMS with a review trail; until then the page states the structure
 * without asserting unverified names.
 */
function TeamPage() {
  return (
    <PublicPageFrame
      eyebrow="關於協會"
      title="團隊與管治"
      description="協會由董事會監督，日常救援、照護與領養工作由職員及義工團隊執行。"
      chapters={[
        {
          eyebrow: "義工團隊",
          title: "日常救援與照護由義工支撐",
          description:
            "協會有一群熱心義工，定期參與餵飼、清潔貓舍狗舍、協助領養配對及活動籌辦等工作。",
          bullets: ["餵飼與日常照護", "貓舍狗舍清潔", "領養配對協助", "活動籌辦與社區教育"],
        },
      ]}
      cta={{
        eyebrow: "加入我們",
        title: "義工團隊長期歡迎新成員。",
        description: "如有興趣參與，可先了解目前的義工崗位與安排。",
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    >
      <section className="section">
        <div className="public-container">
          <PublicStateShell
            headingLevel={2}
            title="董事會名單暫未發佈"
            description={
              "管治名單會連同生效日期一併公開，核實前不會在此刊載。如需查詢協會管治安排，可電郵 " +
              brand.org.email +
              "。"
            }
          />
        </div>
      </section>
    </PublicPageFrame>
  );
}
