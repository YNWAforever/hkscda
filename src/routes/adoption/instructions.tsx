import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import * as Tabs from "@radix-ui/react-tabs";
import { SectionHeading } from "../../components/site/SectionHeading";
import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { getPublicAdoptionPage } from "../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../lib/adoptionInformation/publicPage.server";
import { createAdoptionInstructionsLoader } from "../../lib/adoptionInformation/publicPage.loader";
import type { AdoptionFee, AdoptionLanguage } from "../../lib/adoptionInformation/types";

const loadAdoptionInstructions = createAdoptionInstructionsLoader(() => getPublicAdoptionPage());
export const Route = createFileRoute("/adoption/instructions")({
  loader: resilientPublicLoader(loadAdoptionInstructions),
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/adoption/instructions") }],
  }),
  component: InstructionsPage,
});

const pageCopy: Record<
  AdoptionLanguage,
  {
    rulesHeading: string;
    catCareHeading: string;
    dogCareHeading: string;
    feesHeading: string;
    feesNote: string;
    dogFeeTitle: string;
    catFeeTitle: string;
    estatesHeading: string;
    estatesNote: string;
    estateNameHeader: string;
    districtHeader: string;
    notesHeader: string;
    estatesEmpty: string;
    contactLink: string;
    guidesHeading: string;
    catGuideTitle: string;
    dogGuideTitle: string;
    generalGuideTitle: string;
    zhVersion: string;
    enVersion: string;
    languageToggleLabel: string;
  }
> = {
  "zh-HK": {
    rulesHeading: "領養規則",
    catCareHeading: "養貓需知",
    dogCareHeading: "養狗需知",
    feesHeading: "領養費用",
    feesNote: "以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。",
    dogFeeTitle: "狗隻領養費用",
    catFeeTitle: "貓隻領養費用",
    estatesHeading: "可養狗屋苑參考名單",
    estatesNote: "以下名單僅供參考，請向屋苑管理處查詢最新規定。",
    estateNameHeader: "屋苑",
    districtHeader: "地區",
    notesHeader: "備註",
    estatesEmpty: "暫時未有屋苑資料。如需最新資訊，請",
    contactLink: "聯絡我們",
    guidesHeading: "領養後指南",
    catGuideTitle: "貓隻領養後指南",
    dogGuideTitle: "狗隻領養後指南",
    generalGuideTitle: "領養後指南",
    zhVersion: "中文版",
    enVersion: "English",
    languageToggleLabel: "語言",
  },
  en: {
    rulesHeading: "Adoption Rules",
    catCareHeading: "Caring for Your Cat",
    dogCareHeading: "Caring for Your Dog",
    feesHeading: "Adoption Fees",
    feesNote: "Fees may change without prior notice; HKSCDA reserves the final right of decision.",
    dogFeeTitle: "Dog Adoption Fees",
    catFeeTitle: "Cat Adoption Fees",
    estatesHeading: "Dog-Friendly Estates (Reference List)",
    estatesNote: "For reference only — please check with estate management for current rules.",
    estateNameHeader: "Estate",
    districtHeader: "District",
    notesHeader: "Notes",
    estatesEmpty: "No estate data available yet. For the latest information, please",
    contactLink: "contact us",
    guidesHeading: "Post-Adoption Guides",
    catGuideTitle: "Post-Adoption Guide (Cats)",
    dogGuideTitle: "Post-Adoption Guide (Dogs)",
    generalGuideTitle: "Post-Adoption Guide",
    zhVersion: "中文版",
    enVersion: "English",
    languageToggleLabel: "Language",
  },
};

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
  const [language, setLanguage] = useState<AdoptionLanguage>("zh-HK");
  const copy = pageCopy[language];

  return (
    <PublicPageFrame
      eyebrow="領養準備"
      title="領養需知"
      description="了解申請、家訪和日常照護，為你和動物做好長期準備。"
    >
      <div
        className="public-container space-y-12 py-4"
        lang={language === "en" ? "en" : "zh-Hant-HK"}
      >
        <div className="flex justify-end gap-2" role="group" aria-label={copy.languageToggleLabel}>
          {(["zh-HK", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={language === value}
              onClick={() => setLanguage(value)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm font-semibold aria-pressed:border-[var(--color-primary)] aria-pressed:text-[var(--color-primary)]"
            >
              {value === "zh-HK" ? "中文" : "English"}
            </button>
          ))}
        </div>

        <AdoptionInformationSections data={data} language={language} copy={copy} />

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.rulesHeading}</h2>
          <ol className="space-y-3">
            {data.rules.map((rule, i) => (
              <li key={rule.id} className="flex gap-3 text-[var(--color-text-muted)]">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rule.content[language]}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.catCareHeading}</h2>
          <Tabs.Root defaultValue={data.careTopics.cat[0]?.id}>
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {data.careTopics.cat.map((topic) => (
                <Tabs.Trigger
                  key={topic.id}
                  value={topic.id}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-[var(--color-primary)] text-[var(--color-text-muted)]"
                >
                  {topic.label[language]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {data.careTopics.cat.map((topic) => (
              <Tabs.Content
                key={topic.id}
                value={topic.id}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {topic.content[language]}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">{copy.dogCareHeading}</h2>
          <Tabs.Root defaultValue={data.careTopics.dog[0]?.id}>
            <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
              {data.careTopics.dog.map((topic) => (
                <Tabs.Trigger
                  key={topic.id}
                  value={topic.id}
                  className="min-h-11 px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-secondary)] data-[state=active]:text-[var(--color-secondary)] text-[var(--color-text-muted)]"
                >
                  {topic.label[language]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {data.careTopics.dog.map((topic) => (
              <Tabs.Content
                key={topic.id}
                value={topic.id}
                className="text-[var(--color-text-muted)] leading-relaxed"
              >
                {topic.content[language]}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>
      </div>
    </PublicPageFrame>
  );
}
function AdoptionInformationSections({
  data,
  language,
  copy,
}: {
  data: PublicAdoptionPageData;
  language: AdoptionLanguage;
  copy: (typeof pageCopy)[AdoptionLanguage];
}) {
  return (
    <>
      <section className="space-y-5" aria-labelledby="adoption-fees-title">
        <h2 id="adoption-fees-title" className="font-display text-2xl font-bold">
          {copy.feesHeading}
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <FeeTable title={copy.dogFeeTitle} fees={data.feesBySpecies.dog} />
          <FeeTable title={copy.catFeeTitle} fees={data.feesBySpecies.cat} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.feesNote}</p>
      </section>

      <section className="space-y-4" aria-labelledby="dog-estates-title">
        <h2 id="dog-estates-title" className="font-display text-2xl font-bold">
          {copy.estatesHeading}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.estatesNote}</p>
        {data.estates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.estateNameHeader}
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.districtHeader}
                  </th>
                  <th scope="col" className="px-3 py-3 font-bold">
                    {copy.notesHeader}
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
            {copy.estatesEmpty}
            <a href="/help#contact" className="font-bold text-[var(--color-primary)] underline">
              {copy.contactLink}
            </a>
            {language === "zh-HK" ? "。" : "."}
          </p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="post-adoption-guides-title">
        <h2 id="post-adoption-guides-title" className="font-display text-2xl font-bold">
          {copy.guidesHeading}
        </h2>
        <div className="space-y-4">
          {data.guideGroups.map((group) => (
            <article key={group.species} className="space-y-2">
              <h3 className="font-display text-xl font-bold">
                {group.species === "cat"
                  ? copy.catGuideTitle
                  : group.species === "dog"
                    ? copy.dogGuideTitle
                    : copy.generalGuideTitle}
              </h3>
              <div className="flex flex-wrap gap-3">
                <a
                  key={group.zhHk.id}
                  href={group.zhHk.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  {copy.zhVersion}
                </a>
                <a
                  key={group.en.id}
                  href={group.en.document.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary min-h-11"
                >
                  {copy.enVersion}
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
