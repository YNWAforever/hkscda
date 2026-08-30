import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { brand } from "../../lib/brand/brand";
import { getTnrPageContent } from "../../lib/aboutPages/publicPage.functions";
import type { TnrPageContent } from "../../lib/aboutPages/types";

export const Route = createFileRoute("/about/tnr")({
  head: () => ({
    meta: [
      { title: "TNR 捕捉絕育放回 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "TNR 是管理社區流浪貓的人道方法：誘捕、絕育、原地放回，並配合持續照顧逐步減少繁殖壓力。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/tnr") }],
  }),
  loader: () => getTnrPageContent(),
  component: TNRPage,
});

const STAGE_KICKERS = ["01", "02", "03"] as const;

const DEFAULT_TNR_CONTENT: TnrPageContent = {
  hero: {
    eyebrow: "我們的工作",
    title: "TNR 捕捉絕育放回",
    description:
      "誘捕、絕育、放回（Trap-Neuter-Return）是管理社區流浪貓的其中一種人道方法，透過捕捉、絕育和原地放回，配合持續照顧，逐步減少繁殖壓力。",
  },
  stages: [
    { title: "誘捕 Trap", description: "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。" },
    { title: "絕育 Neuter", description: "送往合作獸醫診所進行絕育手術，同時安排基本健康檢查。" },
    { title: "放回 Return", description: "手術後在原地放回，繼續由 CCCP 義工照顧和觀察。" },
  ],
  chapter: {
    title: "社區參與",
    description:
      "如果你發現社區有需要協助的流浪貓，請先記錄地點、數量和狀況，再聯絡協會了解合適的支援方法。正確的資訊和持續觀察，有助義工安排後續工作。",
    bullets: ["記錄地點與數量", "留意受傷或疾病徵狀", "聯絡協會安排跟進"],
  },
  cta: {
    eyebrow: "一起參與",
    title: "TNR 需要社區的眼睛和雙手。",
    descriptionPrefix: "義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵",
  },
};

// Two fallback layers, both needed: the default parameter covers an omitted
// `content` prop (e.g. a test calling <TNRContent content={undefined} />),
// while the `??` below covers the loader explicitly resolving to `null`.
export function TNRPage() {
  const content = Route.useLoaderData();
  return <TNRContent content={content} />;
}

export function TNRContent({ content }: { content?: TnrPageContent | null }) {
  const page = content ?? DEFAULT_TNR_CONTENT;
  return (
    <PublicPageFrame
      eyebrow={page.hero.eyebrow}
      title={page.hero.title}
      description={page.hero.description}
      highlights={page.stages.map((stage, index) => ({
        kicker: STAGE_KICKERS[index],
        title: stage.title,
        description: stage.description,
      }))}
      chapters={[
        {
          title: page.chapter.title,
          description: page.chapter.description,
          bullets: [...page.chapter.bullets],
        },
      ]}
      cta={{
        eyebrow: page.cta.eyebrow,
        title: page.cta.title,
        description: page.cta.descriptionPrefix + " " + brand.org.email + "。",
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    />
  );
}
