import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import * as Tabs from "@radix-ui/react-tabs";
import { SectionHeading } from "../../components/site/SectionHeading";
import { getPublicAdoptionPage } from "../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../lib/adoptionInformation/publicPage.server";
import { createAdoptionInstructionsLoader } from "../../lib/adoptionInformation/publicPage.loader";
import type { AdoptionFee } from "../../lib/adoptionInformation/types";

const loadAdoptionInstructions = createAdoptionInstructionsLoader(() => getPublicAdoptionPage());
export const Route = createFileRoute("/adoption/instructions")({
  loader: resilientPublicLoader(loadAdoptionInstructions),
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/adoption/instructions") }],
  }),
  component: InstructionsPage,
});

const adoptionRules = [
  "申請人須年滿18歲，並持有香港居留權或工作證。",
  "申請人須提供真實個人資料及住址，以便協會進行家訪。",
  "領養前須按本頁最新領養費用表繳付相關費用。",
  "領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。",
  "須確保動物生活在安全、舒適的室內環境。",
  "須定期帶動物進行健康檢查及接種疫苗。",
  "如住所為租住單位，須提供業主同意飼養寵物的書面証明。",
  "申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。",
  "每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。",
  "申請人須了解並接受動物的生理及行為特性，有耐心照顧。",
  "領養後如動物出現健康問題，須立即尋求獸醫協助。",
  "協會保留拒絕不合適申請的權利，並無需解釋原因。",
];

const catCareTopics = [
  {
    value: "home",
    label: "家居",
    content:
      "為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。",
  },
  {
    value: "collection",
    label: "領取",
    content:
      "領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。",
  },
  {
    value: "food",
    label: "糧食",
    content:
      "提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。",
  },
  {
    value: "cleaning",
    label: "清潔",
    content: "每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。",
  },
  {
    value: "health",
    label: "保健",
    content:
      "半歲或以上為成貓。每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。",
  },
  {
    value: "supplies",
    label: "用品",
    content: "必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。",
  },
  {
    value: "window",
    label: "安窗",
    content:
      "必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。",
  },
];

const dogCareTopics = [
  {
    value: "home",
    label: "家居",
    content: "為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。",
  },
  {
    value: "collection",
    label: "領取",
    content: "領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。",
  },
  {
    value: "food",
    label: "食物",
    content:
      "提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。",
  },
  {
    value: "rest",
    label: "休息",
    content: "為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。",
  },
  {
    value: "cleaning",
    label: "清潔",
    content: "定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。",
  },
  {
    value: "health",
    label: "保健",
    content: "每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。",
  },
  {
    value: "walk",
    label: "溜狗",
    content:
      "每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。",
  },
  {
    value: "training",
    label: "教育",
    content:
      "盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。",
  },
];

function InstructionsPage() {
  const result = Route.useLoaderData();
  if (result.status === "error") {
    return (
      <PublicStateShell
        role="alert"
        title="暫時未能載入領養資訊"
        description="系統未能取得最新的領養流程與費用資料，請稍後再試。"
        action={
          <a href="/adoption/instructions" className="btn-primary min-h-11 px-5">
            重新載入
          </a>
        }
      />
    );
  }
  return <AdoptionInstructionsContent data={result.data} />;
}

export function AdoptionInstructionsContent({ data }: { data: PublicAdoptionPageData }) {
  return (
    <main className="container-wide space-y-12 px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading
        as="h1"
        eyebrow="領養準備"
        title="領養需知"
        description="了解申請、家訪和日常照護，為你和動物做好長期準備。"
      />

      <AdoptionInformationSections data={data} />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">領養規則</h2>
        <ol className="space-y-3">
          {adoptionRules.map((rule, i) => (
            <li key={i} className="flex gap-3 text-[var(--color-text-muted)]">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <span className="leading-relaxed">{rule}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">養貓需知</h2>
        <Tabs.Root defaultValue="home">
          <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
            {catCareTopics.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-[var(--color-primary)] text-[var(--color-text-muted)]"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {catCareTopics.map((t) => (
            <Tabs.Content
              key={t.value}
              value={t.value}
              className="text-[var(--color-text-muted)] leading-relaxed"
            >
              {t.content}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">養狗需知</h2>
        <Tabs.Root defaultValue="home">
          <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
            {dogCareTopics.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-secondary)] data-[state=active]:text-[var(--color-secondary)] text-[var(--color-text-muted)]"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {dogCareTopics.map((t) => (
            <Tabs.Content
              key={t.value}
              value={t.value}
              className="text-[var(--color-text-muted)] leading-relaxed"
            >
              {t.content}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>
    </main>
  );
}
function AdoptionInformationSections({ data }: { data: PublicAdoptionPageData }) {
  return (
    <>
      <section className="space-y-5" aria-labelledby="adoption-fees-title">
        <h2 id="adoption-fees-title" className="font-display text-2xl font-bold">
          領養費用
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <FeeTable title="狗隻領養費用" fees={data.feesBySpecies.dog} />
          <FeeTable title="貓隻領養費用" fees={data.feesBySpecies.cat} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          All prices subject to adjustment; HKSCDA reserves the right to amend.
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="dog-estates-title">
        <h2 id="dog-estates-title" className="font-display text-2xl font-bold">
          可養狗屋苑參考名單
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          以下名單僅供參考，請向屋苑管理處查詢最新規定。
        </p>
        {data.estates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-3 py-3 font-bold">
                    屋苑
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    地區
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    備註
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.estates.map((estate) => (
                  <tr key={estate.id} className="border-b border-[var(--color-border)]">
                    <th scope="row" className="px-3 py-3 font-semibold">
                      {estate.estateName}
                    </th>
                    <td className="px-3 py-3">{estate.district}</td>
                    <td className="px-3 py-3">{estate.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            暫時未有屋苑資料。如需最新資訊，請
            <a href="/help#contact" className="font-bold text-[var(--color-primary)] underline">
              聯絡我們
            </a>
            。
          </p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="post-adoption-guides-title">
        <h2 id="post-adoption-guides-title" className="font-display text-2xl font-bold">
          領養後指南
        </h2>
        <div className="space-y-4">
          {data.guideGroups.map((group) => (
            <article key={group.species} className="space-y-2">
              <h3 className="font-display text-xl font-bold">
                {group.species === "cat"
                  ? "貓隻領養後指南"
                  : group.species === "dog"
                    ? "狗隻領養後指南"
                    : "領養後指南"}
              </h3>
              <div className="flex flex-wrap gap-3">
                <a
                  key={group.zhHk.id}
                  href={group.zhHk.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  中文版
                </a>
                <a
                  key={group.en.id}
                  href={group.en.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  English
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function FeeTable({ title, fees }: { title: string; fees: AdoptionFee[] }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={title} className="w-full border-collapse text-left text-sm">
        <caption className="pb-3 text-left font-display text-xl font-bold">{title}</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th scope="col" className="px-3 py-3 font-bold">
              項目
            </th>
            <th scope="col" className="px-3 py-3 font-bold">
              費用（HK$）
            </th>
          </tr>
        </thead>
        <tbody>
          {fees.map((fee) => (
            <tr key={fee.id} className="border-b border-[var(--color-border)]">
              <th scope="row" className="px-3 py-3 font-medium">
                {fee.itemName}
              </th>
              <td className="px-3 py-3 tabular-nums">{fee.priceHkd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
