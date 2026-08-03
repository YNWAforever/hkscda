import { createFileRoute } from "@tanstack/react-router";
import { SectionHeading } from "../../components/site/SectionHeading";

export const Route = createFileRoute("/about/cccp")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/about/cccp" }],
  }),
  component: CCCPPage,
});

function CCCPPage() {
  return (
    <main className="container-wide px-4 py-14 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="社區合作"
        title="CCCP 計劃"
        as="h1"
        description="社區貓照顧計劃（Community Cat Care Program）"
      />

      <div className="mt-12 space-y-12">
        <section>
          <SectionHeading title="什麼是 CCCP？" />
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
            CCCP
            是香港拯救貓狗協會推行的社區流浪貓管理計劃。計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合
            TNR 絕育工作，逐步改善貓隻和社區的生活質素。
          </p>
        </section>

        <section>
          <SectionHeading title="為何需要 CCCP？" />
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
            有系統的照顧能讓社區居民與流浪貓和諧共存，並及早發現受傷、疾病和未絕育的貓隻，連接合適的義工和獸醫支援。
          </p>
        </section>

        <section>
          <SectionHeading
            title="CCCP 的工作方式"
            description="以社區參與、日常觀察和絕育合作，建立可持續的照顧網絡。"
          />
          <div className="mt-6 overflow-x-auto border border-[var(--color-border)]">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-surface-offset)]">
                <tr>
                  <th className="border-b border-[var(--color-border)] p-4">工作範圍</th>
                  <th className="border-b border-[var(--color-border)] p-4">社區做法</th>
                  <th className="border-b border-[var(--color-border)] p-4">動物福利結果</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["日常照顧", "定點餵食、清潔和觀察", "及早發現需要協助的動物"],
                  ["絕育合作", "配合 TNR 安排手術", "減少繁殖和流浪壓力"],
                  ["社區溝通", "由義工連接居民和協會", "降低衝突，分享正確照顧方法"],
                ].map(([scope, method, result]) => (
                  <tr key={scope} className="border-b border-[var(--color-border)] last:border-b-0">
                    <th className="p-4 font-bold text-[var(--color-text)]">{scope}</th>
                    <td className="p-4 text-[var(--color-text-muted)]">{method}</td>
                    <td className="p-4 text-[var(--color-text-muted)]">{result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-[var(--color-divider)] pt-8">
          <SectionHeading title="如何支持 CCCP？" />
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
            你可以擔任義工、捐款或捐贈物資。如有興趣參與，請電郵至{" "}
            <a
              href="mailto:info@hkscda.com"
              className="font-bold text-[var(--color-primary)] underline"
            >
              info@hkscda.com
            </a>{" "}
            或 WhatsApp 9864 1089 聯絡我們。
          </p>
          <a href="mailto:info@hkscda.com" className="btn-primary mt-6 min-h-11 px-5">
            電郵聯絡我們
          </a>
        </section>
      </div>
    </main>
  );
}
