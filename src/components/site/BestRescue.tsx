import { PawPrint } from "lucide-react";
import cat2 from "@/assets/cat2.jpg";
import dog2 from "@/assets/dog2.jpg";
import { Reveal } from "@/lib/reveal";
import { useCountUp } from "@/lib/useCountUp";

const checklist = [
  "不殺（No Kill）承諾 — 絕不放棄任何一息尚存的生命",
  "政府認可慈善機構，捐款可申請 IRD §88 退稅",
  "嚴格家訪審核，確保每隻毛孩找到真正合適的家",
  "每月公開領養及核數報告，全面透明",
];

const stats = [
  { n: "18+", l: "年救援經驗" },
  { n: "600+", l: "每年救助毛孩" },
  { n: "6,800+", l: "成功領養個案" },
  { n: "78K+", l: "社群支持者" },
];

// Rose stat number that counts up once on scroll-into-view ("6,800+" keeps its
// thousands separator and suffix).
function StatNum({ n }: { n: string }) {
  const m = n.match(/^([\d,]+)(.*)$/);
  const target = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  const hasComma = m ? m[1].includes(",") : false;
  const { ref, value } = useCountUp(target);
  if (!m) return <>{n}</>;
  return (
    <span ref={ref}>
      {hasComma ? value.toLocaleString("en-US") : value}
      {m[2]}
    </span>
  );
}

export function BestRescue() {
  return (
    <section className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]" aria-labelledby="best-rescue-h">
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-14">
          {/* Image cluster */}
          <Reveal className="relative">
            <div className="grid grid-cols-2 gap-4">
              <img
                src={dog2}
                alt="獲救的唐狗"
                loading="lazy"
                className="rounded-[2rem] aspect-[3/4] object-cover w-full shadow-lg"
              />
              <img
                src={cat2}
                alt="獲救的貓咪"
                loading="lazy"
                className="rounded-[2rem] aspect-[3/4] object-cover w-full shadow-lg mt-10"
              />
            </div>
            <div className="absolute left-4 top-4 bg-white rounded-full px-4 py-1.5 shadow-soft flex items-center gap-1.5 text-[var(--color-accent-warm)] text-sm font-bold tracking-wider">
              ★★★★★ <span className="text-[var(--color-panel)] text-xs tracking-normal">(5/5)</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 bg-[var(--color-accent-warm)] text-white rounded-full px-6 py-3 shadow-xl flex items-center gap-2 whitespace-nowrap">
              <PawPrint className="h-4 w-4" />
              <span className="font-display font-bold text-sm">自 2007 年服務香港</span>
            </div>
          </Reveal>

          {/* Copy + checklist */}
          <Reveal>
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
              我們的承諾
            </div>
            <h2
              id="best-rescue-h"
              className="font-display text-3xl lg:text-5xl font-bold text-[var(--color-panel)] mb-5 leading-tight"
            >
              日夜堅守前線的
              <br />
              動物救援義工團隊
            </h2>
            <p className="text-[var(--color-text-muted)] mb-7 max-w-[48ch]">
              一支紮根香港十八年的義工團隊，從深夜街頭救援到康復照護，每一步都以毛孩福祉為先。
            </p>
            <ul className="card-dashed bg-[var(--color-surface-2)] p-6 space-y-3.5 mb-8">
              {checklist.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <PawPrint
                    className="h-4 w-4 text-[var(--color-primary)] shrink-0 mt-1"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <span className="text-sm text-[var(--color-text)]">{c}</span>
                </li>
              ))}
            </ul>
            <a href="#about" className="btn-navy">
              認識協會
            </a>
          </Reveal>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 border-t-2 border-dashed border-[var(--color-divider)] pt-10">
          {stats.map((s, i) => (
            <div
              key={s.l}
              className={`text-center ${i > 0 ? "lg:border-l-2 lg:border-dashed lg:border-[var(--color-divider)]" : ""}`}
            >
              <div className="font-display text-4xl lg:text-5xl font-bold text-[var(--color-accent-warm)]">
                <StatNum n={s.n} />
              </div>
              <div className="text-xs lg:text-sm text-[var(--color-text-muted)] mt-1.5">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
