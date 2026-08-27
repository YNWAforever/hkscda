import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { brand } from "../../lib/brand/brand";

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
  component: TNRPage,
});

const STAGES = [
  ["01", "誘捕 Trap", "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。"],
  ["02", "絕育 Neuter", "送往合作獸醫診所進行絕育手術，同時安排基本健康檢查。"],
  ["03", "放回 Return", "手術後在原地放回，繼續由 CCCP 義工照顧和觀察。"],
];

function TNRPage() {
  return (
    <PublicPageFrame
      eyebrow="我們的工作"
      title="TNR 捕捉絕育放回"
      description="誘捕、絕育、放回（Trap-Neuter-Return）是管理社區流浪貓的其中一種人道方法，透過捕捉、絕育和原地放回，配合持續照顧，逐步減少繁殖壓力。"
      highlights={STAGES.map(([kicker, title, description]) => ({ kicker, title, description }))}
      chapters={[
        {
          title: "社區參與",
          description:
            "如果你發現社區有需要協助的流浪貓，請先記錄地點、數量和狀況，再聯絡協會了解合適的支援方法。正確的資訊和持續觀察，有助義工安排後續工作。",
          bullets: ["記錄地點與數量", "留意受傷或疾病徵狀", "聯絡協會安排跟進"],
        },
      ]}
      cta={{
        eyebrow: "一起參與",
        title: "TNR 需要社區的眼睛和雙手。",
        description: "義工訓練、誘捕安排與術後照顧都需要人手。查詢可電郵 " + brand.org.email + "。",
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    />
  );
}
