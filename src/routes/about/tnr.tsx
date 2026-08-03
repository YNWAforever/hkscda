import { createFileRoute } from "@tanstack/react-router";
import { Box, House, Stethoscope } from "lucide-react";
import { SectionHeading } from "../../components/site/SectionHeading";

export const Route = createFileRoute("/about/tnr")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/about/tnr" }],
  }),
  component: TNRPage,
});

const stages = [
  {
    step: "01",
    title: "誘捕 Trap",
    Icon: Box,
    desc: "義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。",
  },
  {
    step: "02",
    title: "絕育 Neuter",
    Icon: Stethoscope,
    desc: "送往合作獸醫診所進行絕育手術，同時安排基本健康檢查。",
  },
  {
    step: "03",
    title: "放回 Return",
    Icon: House,
    desc: "手術後在原地放回，繼續由 CCCP 義工照顧和觀察。",
  },
];

function TNRPage() {
  return (
    <main className="container-wide px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="社區合作"
        title="TNR 計劃"
        as="h1"
        description="誘捕、絕育、放回（Trap-Neuter-Return）"
      />

      <div className="mt-12 space-y-12">
        <section>
          <SectionHeading title="什麼是 TNR？" />
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
            TNR
            是管理社區流浪貓的其中一種人道方法，透過捕捉、絕育和原地放回，配合持續照顧，逐步減少繁殖壓力。
          </p>
        </section>

        <section>
          <SectionHeading title="TNR 三個階段" />
          <ol className="mt-6 grid gap-5 md:grid-cols-3">
            {stages.map(({ step, title, Icon, desc }) => (
              <li
                key={step}
                className="border-t-4 border-[var(--color-primary)] bg-[var(--color-surface-offset)] p-5"
              >
                <div className="flex items-center gap-3 text-[var(--color-primary)]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="text-sm font-bold">{step}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-[var(--color-text)]">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-[var(--color-divider)] pt-8">
          <SectionHeading title="社區參與" />
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
            如果你發現社區有需要協助的流浪貓，請先記錄地點、數量和狀況，再聯絡協會了解合適的支援方法。正確的資訊和持續觀察，有助義工安排後續工作。
          </p>
          <a href="mailto:info@hkscda.com" className="btn-secondary mt-6 min-h-11 px-5">
            聯絡協會
          </a>
        </section>
      </div>
    </main>
  );
}
