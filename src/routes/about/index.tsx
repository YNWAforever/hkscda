import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  Home,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import { type PublicImpactItem } from "../../lib/animals/publicImpact";
import { getPublicImpactItems } from "../../lib/animals/publicImpact.functions";
import { PublicPageHero } from "../../components/site/PublicPageHero";
import { PublicStatusBadge } from "../../components/site/PublicStatusBadge";
import { SectionHeading } from "../../components/site/SectionHeading";
import heroImg from "@/assets/dog-smiling.jpg";

export const Route = createFileRoute("/about/")({
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/about") }],
  }),
  // Server rendered: the figures arrive with the first response rather than after
  // a browser round trip, and the counting rules live in one projection shared
  // with the home page instead of being restated here.
  loader: () => getPublicImpactItems(),
  component: AboutPage,
});

const journey = [
  {
    title: "救援",
    description: "接收需要即時協助的流浪、受傷或被遺棄貓狗。",
    icon: Heart,
  },
  {
    title: "醫療照護",
    description: "安排檢查、治療、疫苗和日常照護，讓動物恢復健康。",
    icon: Stethoscope,
  },
  {
    title: "絕育",
    description: "透過絕育及社區合作，減少繁殖和流浪動物數目。",
    icon: Syringe,
  },
  {
    title: "配對領養",
    description: "了解家庭需要，為動物配對負責任而長久的家。",
    icon: Home,
  },
];

const helpPaths = [
  {
    title: "領養動物",
    description: "看看正在等待家庭的貓貓和狗狗。",
    href: "/animals/cat",
    label: "查看待領養動物",
  },
  {
    title: "助養生命",
    description: "以每月支持幫助動物獲得持續照護。",
    href: "/sponsors",
    label: "了解助養",
  },
  {
    title: "加入義工",
    description: "用時間和專長支援救援及社區工作。",
    href: "/volunteer",
    label: "加入義工",
  },
  {
    title: "立即捐助",
    description: "支持醫療、絕育和日常救援所需。",
    href: "/donate",
    label: "支持協會",
  },
];

export function AboutPage() {
  const { items } = Route.useLoaderData();
  return <AboutContent impact={items} />;
}

export function AboutContent({ impact }: { impact: PublicImpactItem[] }) {
  return (
    <main>
      <PublicPageHero
        eyebrow="香港本地動物救援慈善機構"
        title="領養代替購買"
        description="救援、醫療、絕育與負責任領養，以社區力量守護香港流浪貓狗。"
        imageSrc={heroImg}
        imageAlt="在協會犬舍外開心迎接訪客的獲救唐狗"
        imageClassName="object-[50%_30%]"
        actions={
          <>
            <a href="/animals/cat" className="btn-primary min-h-11 px-5">
              查看待領養動物
            </a>
            <a href="/donate" className="btn-secondary min-h-11 px-5">
              立即捐助
            </a>
          </>
        }
      />

      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <SectionHeading eyebrow="我們的使命" title="讓每一個生命都有重新開始的機會" />
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)]">
              香港拯救貓狗協會自2007年起，透過救援、醫療、絕育和領養工作，為被遺棄及流浪動物提供實際支援。我們相信負責任的領養需要透明資訊、耐心配對和社區共同參與。
            </p>
          </div>
          <div className="border-l-4 border-[var(--color-secondary)] pl-6">
            <PublicStatusBadge tone="info" icon={ShieldCheck}>
              以動物福祉為先
            </PublicStatusBadge>
            <p className="mt-4 text-base leading-relaxed text-[var(--color-text-muted)]">
              我們與義工、領養家庭及社區夥伴一起，讓照護和善意可以持續發生。
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--color-divider)] bg-[var(--color-surface-offset)]">
        <div className="container-wide px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="可核實的公開資料"
            title="目前照護中的動物"
            description="數字只在資料庫成功回傳並大於零時顯示，並標示資料日期。"
          />
          {impact.length > 0 ? (
            <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {impact.map((item) => (
                <div key={item.label} className="border-t-4 border-[var(--color-primary)] pt-4">
                  <dt className="text-sm font-bold text-[var(--color-text-muted)]">{item.label}</dt>
                  <dd className="mt-2 text-4xl font-bold text-[var(--color-primary)]">
                    {item.value.toLocaleString("zh-HK")}
                  </dd>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    資料截至 {item.asOf}
                  </p>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mt-8">
              <PublicStatusBadge tone="neutral" icon={CheckCircle2}>
                暫無可核實數據
              </PublicStatusBadge>
            </div>
          )}
        </div>
      </section>

      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="我們如何工作" title="從救援到找到家，四個重要步驟" />
        <div className="mt-10 grid gap-8 md:grid-cols-4">
          {journey.map(({ title, description, icon: Icon }, index) => (
            <div key={title} className="border-t border-[var(--color-border)] pt-5">
              <div className="flex items-center gap-3 text-[var(--color-primary)]">
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="text-xs font-bold tracking-wide">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-[var(--color-text)]">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--color-divider)] bg-[var(--color-panel)] text-white">
        <div className="container-wide grid gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-sm font-bold tracking-wide text-white/80">社區合作</p>
            <h2 className="mt-2 max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl">
              CCCP 與 TNR，從源頭改善動物處境
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-white/80">
              社區貓隻照顧計劃和捕捉、絕育、放回工作，讓動物福利不只發生在收容和領養，也能在社區中長久改善。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <a href="/about/cccp" className="border border-white/25 p-5 hover:border-white">
              <Users className="h-6 w-6" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-bold">CCCP 計劃</h3>
              <p className="mt-2 text-sm text-white/75">了解社區貓隻照顧的合作方法。</p>
              <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold">
                了解更多 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
            <a href="/about/tnr" className="border border-white/25 p-5 hover:border-white">
              <Syringe className="h-6 w-6" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-bold">TNR 計劃</h3>
              <p className="mt-2 text-sm text-white/75">了解捕捉、絕育、放回的社區行動。</p>
              <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold">
                了解更多 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </a>
          </div>
        </div>
      </section>

      <section className="container-wide px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="負責任領養" title="領養是一段需要準備的長期承諾" />
            <p className="mt-5 leading-relaxed text-[var(--color-text-muted)]">
              了解家庭環境、時間安排和照護能力，讓你和動物都能安心開始。領養費用及流程等操作指引，請參閱領養需知。
            </p>
            <a href="/adoption/instructions" className="btn-secondary mt-6 min-h-11 px-5">
              閱讀領養需知
            </a>
          </div>
          <div className="border-t-4 border-[var(--color-secondary)] pt-5">
            <h3 className="text-xl font-bold text-[var(--color-text)]">我們重視的配對原則</h3>
            <ul className="mt-5 space-y-4 text-[var(--color-text-muted)]">
              {[
                "先了解動物需要，再評估家庭是否合適",
                "把醫療、絕育和日常照護納入長期規劃",
                "以耐心和責任建立穩定而安全的關係",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--color-divider)] bg-[var(--color-surface-offset)]">
        <div className="container-wide px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="一起幫助" title="你可以用四種方式加入" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {helpPaths.map((path) => (
              <a
                key={path.href}
                href={path.href}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-primary)]"
              >
                <h3 className="text-lg font-bold text-[var(--color-text)]">{path.title}</h3>
                <p className="mt-3 min-h-12 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {path.description}
                </p>
                <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--color-primary)]">
                  {path.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="container-wide px-4 py-16 text-center sm:px-6 lg:px-8">
        <SectionHeading
          align="center"
          title="讓下一個家，從今天開始"
          description="看看正在等待領養的動物，或者用你的支持讓更多救援可以繼續。"
        />
        <a href="/animals/cat" className="btn-primary mt-7 min-h-12 px-6 text-base">
          查看待領養動物
        </a>
      </section>
    </main>
  );
}
