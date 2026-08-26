import { createFileRoute } from "@tanstack/react-router";
import { Heart, House, Globe, Stethoscope, Handshake, type LucideIcon } from "lucide-react";
import { Hero } from "@/components/site/Hero";
import { FeatureTrio } from "@/components/site/FeatureTrio";
import { FundraisingCard } from "@/components/site/FundraisingCard";
import { AdoptionSteps } from "@/components/site/AdoptionSteps";
import { FAQ } from "@/components/site/FAQ";
import { PhotoMarquee } from "@/components/site/PhotoMarquee";
import { SectionHeading } from "@/components/site/SectionHeading";
import heroImg from "@/assets/dog-smiling.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "香港拯救貓狗協會 HKSCDA · 領養代替購買" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會（HKSCDA）成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務。支持領養等於拯救生命。",
      },
      { property: "og:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        property: "og:description",
        content: "支持領養 · 拯救生命 · 不殺機構",
      },
      { property: "og:image", content: heroImg },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/" }],
  }),
  component: Index,
});

const programs = [
  {
    title: "緊急救援",
    desc: "接報後迅速行動，拯救受傷、被棄養或來自繁殖場的貓狗，提供即時醫療護理。",
  },
  { title: "貓隻領域護理 CCCP", desc: "為社區貓隻提供持續餵食、健康監察及環境管理。" },
  { title: "TNR 捕捉絕育放回", desc: "透過絕育有效控制流浪動物數量，減少苦難循環。" },
  { title: "暫托安置", desc: "由義工家庭提供臨時安置，讓動物在溫暖環境中等待領養。" },
  { title: "助養計劃", desc: "前往助養頁面了解現時安排，支援動物的日常照顧需要。" },
  { title: "公開報告入口", desc: "前往報告頁面查看目前公開的領養及審計資料。" },
];

const verifiedPublicRoutes = [
  {
    href: "/stories",
    title: "救援故事",
    desc: "閱讀協會目前公開的故事內容。",
  },
  {
    href: "/report/adoption",
    title: "領養報告",
    desc: "查看頁面現時可核實的公開資料。",
  },
  {
    href: "/report/audit",
    title: "年報及審計資料",
    desc: "查看協會已公開的正式文件。",
  },
  {
    href: "/volunteer",
    title: "加入義工",
    desc: "查看現時義工方式與活動資料。",
  },
];

const rescueCommitments: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: Stethoscope,
    title: "醫療救援",
    desc: "為拯救的貓狗提供全面醫療護理，包括絕育、疫苗及日常保健。",
  },
  { Icon: House, title: "領養媒合", desc: "透過嚴格家訪審核，為每隻動物配對最適合的永久家庭。" },
  { Icon: Globe, title: "社區教育", desc: "推廣領養代替購買、愛護動物及生育控制理念。" },
  {
    Icon: Handshake,
    title: "跨機構合作",
    desc: "與其他動物組織保持開放合作，共同改善流浪動物福祉。",
  },
];

function Index() {
  return (
    <div>
      <main>
        <Hero />

        {/* Feature trio on navy panel — NEW */}
        <FeatureTrio />

        {/* Community photo conveyor (reference: slow gallery marquee) */}
        <PhotoMarquee />

        {/* Adoption */}
        <section id="adoption" className="bg-[var(--color-surface)] px-6 py-16 lg:py-24">
          <div className="container-wide">
            <SectionHeading
              eyebrow="領養動物"
              title="牠們在等待一個家"
              description="查看目前可申請領養的貓狗，了解牠們的個性與照顧需要。"
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <a href="/animals/cat" className="public-route-card">
                <h3 className="text-xl font-bold text-[var(--color-text)]">待領養貓貓</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  查看目前公開的貓貓資料和領養申請流程。
                </p>
                <span className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary)]">
                  查看貓貓
                </span>
              </a>
              <a href="/animals/dog" className="public-route-card">
                <h3 className="text-xl font-bold text-[var(--color-text)]">待領養狗狗</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  查看目前公開的狗狗資料和領養申請流程。
                </p>
                <span className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary)]">
                  查看狗狗
                </span>
              </a>
            </div>
          </div>
        </section>
        {/* Fundraising progress — NEW */}
        <FundraisingCard />

        {/* Adoption steps — NEW */}
        <AdoptionSteps />

        {/* About */}
        <section id="about" className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]">
          <div className="container-wide grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
                <House className="h-3.5 w-3.5" /> 關於協會
              </div>
              <h2 className="font-display text-3xl lg:text-5xl font-bold mb-6 leading-tight">
                拯救生命的使命
                <br />從 2007 年延續至今
              </h2>
              <div className="space-y-4 text-[var(--color-text)]">
                <p>
                  香港拯救貓狗協會（HKSCDA）於 <strong>2007 年 4 月 1 日</strong> 成立，以「
                  <strong>支持領養等於拯救生命</strong>」為宗旨，為本地非牟利慈善機構（檔案
                  91/14493）。
                </p>
                <p>
                  本會致力為流浪貓狗提供糧食、醫療、絕育及領養服務，同時積極援救街頭受傷或被遺棄的小動物，為牠們尋找
                  <strong>永久的家</strong>。
                </p>{" "}
                <p>
                  我們是一個「<strong>不殺（No Kill）</strong>
                  」機構，重視每個生命的照護、康復和負責任領養。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-6">
                {["慈善牌照 91/14493", "漁農署 ORG-00041", "IRD §88 免稅", "No Kill 機構"].map(
                  (b) => (
                    <span
                      key={b}
                      className="text-xs px-3 py-1 rounded-full bg-[var(--color-surface-offset)] border border-[var(--color-border)] font-medium"
                    >
                      {b}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="grid gap-4">
              {rescueCommitments.map(({ Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold mb-1">{title}</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Programs */}
        <section id="programs" className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]">
          <div className="container-wide">
            <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">全面照顧流浪動物</h2>
            <p className="text-[var(--color-text-muted)] max-w-[52ch] mb-10">
              從緊急拯救到永久領養，我們提供全方位的動物福利服務。
            </p>
            <div className="divide-y divide-[var(--color-border)]">
              {programs.map((p, i) => (
                <div
                  key={p.title}
                  className="grid grid-cols-[3.5rem_1fr] lg:grid-cols-[4rem_18ch_1fr] gap-x-6 py-5 items-start"
                >
                  <span className="font-display text-2xl font-bold text-[var(--color-primary)] tabular-nums leading-none pt-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="lg:contents">
                    <h3 className="font-display font-bold text-[var(--color-panel)] mb-1 lg:mb-0 lg:pt-1">
                      {p.title}
                    </h3>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                      {p.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--color-bg)] px-6 py-16 lg:py-24">
          <div className="container-wide">
            <SectionHeading
              eyebrow="公開資料"
              title="按目前公開內容了解協會工作"
              description="故事、報告和參與方式均由相應頁面提供，請以頁面現時公開內容為準。"
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {verifiedPublicRoutes.map((item) => (
                <a key={item.href} href={item.href} className="public-route-card">
                  <h3 className="text-lg font-extrabold text-[var(--color-text)]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                    {item.desc}
                  </p>
                  <span className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary)]">
                    前往頁面{" "}
                    <span className="ml-1" aria-hidden="true">
                      →
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ accordion — NEW */}
        <FAQ />

        {/* Donate */}
        <section id="donate" className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]">
          <div className="container-wide">
            <div className="grid min-w-0 items-center gap-10 rounded-[2.5rem] bg-[var(--color-panel)] p-8 shadow-panel lg:grid-cols-5 lg:p-12">
              <div className="min-w-0 lg:col-span-3">
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)] mb-3 flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" /> 捐助我們
                </div>
                <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                  您的每一份善意
                  <br />
                  都是生命的希望
                </h2>
                <p className="mb-6 max-w-2xl text-white/70">
                  捐助方式、付款步驟及收據安排會在捐助頁面顯示。請以該頁現時資料為準。
                </p>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[var(--color-secondary-highlight)]">
                  慈善檔案 91/14493 · IRD §88 免稅機構
                </div>
              </div>
              <div className="grid min-w-0 gap-3 lg:col-span-2">
                <a
                  href="/donate"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 font-extrabold text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
                >
                  查看捐助頁面
                </a>
                <a
                  href="/report/audit"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 px-6 py-3 font-extrabold text-white hover:bg-white/10"
                >
                  查看年報及審計資料
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
