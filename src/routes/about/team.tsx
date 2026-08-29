import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { getPublicBoardRoster } from "../../lib/governance/publicPage.functions";
import type { PublicBoardRoster } from "../../lib/governance/publicPage.server";
import { brand } from "../../lib/brand/brand";

export const Route = createFileRoute("/about/team")({
  loader: resilientPublicLoader(() => getPublicBoardRoster()),
  errorComponent: TeamLoadError,
  head: () => ({
    meta: [
      { title: "團隊與管治 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "香港拯救貓狗協會的管治架構、義工團隊，以及聯絡團隊的方法。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/team") }],
  }),
  component: TeamRoute,
});

function TeamRoute() {
  const result = Route.useLoaderData();
  if (result.status === "error") return <TeamLoadError />;
  return <TeamPage roster={result.data} />;
}

function formatLastUpdated(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function TeamPage({ roster }: { roster: PublicBoardRoster }) {
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
          {roster.members.length > 0 ? (
            <>
              <ul className="divide-y divide-[var(--color-border)]">
                {roster.members.map((member) => (
                  <li
                    key={`${member.name}-${member.roleTitle}`}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="font-bold text-[var(--color-text)]">{member.name}</span>
                    <span className="text-[var(--color-text-muted)]">{member.roleTitle}</span>
                  </li>
                ))}
              </ul>
              {roster.lastUpdated ? (
                <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                  資料最後更新 {formatLastUpdated(roster.lastUpdated)}
                </p>
              ) : null}
            </>
          ) : (
            <PublicStateShell
              headingLevel={2}
              title="尚未有公開資料"
              description={`管治名單會連同生效日期一併公開，核實前不會在此刊載。如需查詢協會管治安排，可電郵 ${brand.org.email}。`}
            />
          )}
        </div>
      </section>
    </PublicPageFrame>
  );
}

export function TeamLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div
        role="alert"
        className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6"
      >
        <h1 className="text-lg font-bold">暫時未能載入團隊與管治資料</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          請稍後再試，或電郵至{" "}
          <a className="underline" href={`mailto:${brand.org.email}`}>
            {brand.org.email}
          </a>
          。
        </p>
        <a href="/about/team" className="btn-secondary mt-5 min-h-11">
          重新載入 / Retry
        </a>
      </div>
    </main>
  );
}
