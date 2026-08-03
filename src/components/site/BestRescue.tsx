import { CheckCircle2 } from "lucide-react";
import cat2 from "@/assets/cat2.jpg";
import dog2 from "@/assets/dog2.jpg";
import { Reveal } from "@/lib/reveal";

const checklist = [
  "不殺（No Kill）承諾，絕不放棄任何一息尚存的生命",
  "政府認可慈善機構，捐款可申請 IRD §88 退稅",
  "嚴格家訪審核，確保每隻毛孩找到真正合適的家",
  "每月公開領養及核數報告，全面透明",
];

export function BestRescue() {
  return (
    <section className="bg-[var(--color-bg)] px-6 py-16 lg:py-24" aria-labelledby="best-rescue-h">
      <div className="container-wide">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal className="relative">
            <div className="grid grid-cols-2 gap-4">
              <img
                src={dog2}
                alt="獲救的唐狗"
                loading="lazy"
                className="aspect-[3/4] w-full object-cover shadow-lg"
              />
              <img
                src={cat2}
                alt="獲救的貓咪"
                loading="lazy"
                className="mt-10 aspect-[3/4] w-full object-cover shadow-lg"
              />
            </div>
            <div className="absolute bottom-4 left-4 bg-[var(--color-panel)] px-4 py-2 text-sm font-bold text-white shadow-soft">
              自 2007 年服務香港
            </div>
          </Reveal>

          <Reveal>
            <p className="text-sm font-bold tracking-wide text-[var(--color-secondary)]">
              我們的承諾
            </p>
            <h2
              id="best-rescue-h"
              className="mt-2 text-3xl font-bold leading-tight text-[var(--color-text)] lg:text-5xl"
            >
              日夜堅守前線的動物救援義工團隊
            </h2>
            <p className="mt-5 max-w-[48ch] text-[var(--color-text-muted)]">
              從街頭救援到康復照護，每一步都以動物福祉和負責任領養為先。
            </p>
            <ul className="mt-7 space-y-3.5 border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <span className="text-sm text-[var(--color-text)]">{item}</span>
                </li>
              ))}
            </ul>
            <a href="/about" className="btn-secondary mt-7 min-h-11 px-5">
              認識協會
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
