import { Heart } from "lucide-react";
import cat1 from "@/assets/cat1.jpg";
import { Reveal } from "@/lib/reveal";

const raised = 17900;
const goal = 30000;
const pct = Math.min(100, Math.round((raised / goal) * 100));

export function FundraisingCard() {
  return (
    <section
      className="px-6 py-16 lg:py-20 bg-[var(--color-surface)]"
      aria-labelledby="fundraising-h"
    >
      <div className="container-wide">
        <div className="rounded-[2.5rem] bg-[var(--color-accent-soft)] p-6 lg:p-12 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center overflow-hidden relative">
          <div
            className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/40 pointer-events-none"
            aria-hidden="true"
          />
          <Reveal className="relative">
            <img
              src={cat1}
              alt="正在接受醫療照顧的貓咪 Mochi"
              loading="lazy"
              className="rounded-[2rem] w-full aspect-[4/3] object-cover shadow-xl"
            />
            <div className="absolute -bottom-4 left-6 bg-[var(--color-panel)] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
              本月醫療籌款個案
            </div>
          </Reveal>

          <Reveal className="relative">
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
              緊急醫療籌款
            </div>
            <h2
              id="fundraising-h"
              className="font-display text-3xl lg:text-4xl font-bold text-[var(--color-panel)] mb-4 leading-tight"
            >
              幫助街頭傷病毛孩
              <br />
              完成手術與康復
            </h2>
            <p className="text-sm lg:text-base text-[var(--color-text-muted)] mb-7 max-w-[46ch]">
              每月平均有十多隻受傷或重病的貓狗需要緊急手術。您的捐助直接用於醫療費用，協會帳目每年公開核數。
            </p>

            {/* Progress */}
            <div className="mb-7">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="text-[11px] text-[var(--color-text-muted)] font-medium">
                    已籌得
                  </div>
                  <div className="font-display text-xl font-bold text-[var(--color-primary)]">
                    HK${raised.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[var(--color-text-muted)] font-medium">目標</div>
                  <div className="font-display text-xl font-bold text-[var(--color-panel)]">
                    HK${goal.toLocaleString()}
                  </div>
                </div>
              </div>
              <div
                className="h-3 rounded-full bg-white/70 overflow-hidden"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`籌款進度 ${pct}%`}
              >
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-[11px] text-[var(--color-text-muted)] mt-1.5 font-medium">
                {pct}% 達成
              </div>
            </div>

            <a href="#donate" className="btn-cta px-8! py-4!">
              <Heart className="h-4 w-4" fill="currentColor" /> 立即捐助
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
