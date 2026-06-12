import heroImg from "@/assets/hero.jpg";
import cat1 from "@/assets/cat1.jpg";
import dog1 from "@/assets/dog1.jpg";
import { PawPrint, Heart, Star } from "lucide-react";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden px-6 pt-12 pb-20 lg:pt-20 lg:pb-28 bg-[var(--color-accent-soft)] bg-topo"
      aria-label="主頁橫幅"
    >
      {/* Decorative blobs */}
      <div
        className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,rgba(255,255,255,0.8) 0%,transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 -left-32 h-[480px] w-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,var(--color-primary-highlight) 0%,transparent 70%)" }}
      />
      <svg
        className="absolute top-16 left-[46%] h-10 w-10 text-[var(--color-accent-warm)] opacity-60 pointer-events-none hidden lg:block"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 21s-6.7-4.3-9.3-8.5C.8 9.2 2.4 5.5 5.9 5.1c2-.2 3.9.9 4.8 2.6.2.4.4.4.6 0 .9-1.7 2.8-2.8 4.8-2.6 3.5.4 5.1 4.1 3.2 7.4C16.7 16.7 12 21 12 21z" />
      </svg>

      <div className="container-wide relative grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-[var(--color-primary-highlight)] text-xs font-bold text-[var(--color-primary)]">
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-accent-warm)]"
              style={{ animation: "pulse-dot 2s infinite" }}
            />
            本會為「不殺」(No Kill) 政府認可慈善機構
          </div>
          <h1 className="font-display font-bold text-[var(--color-panel)] text-[clamp(2.5rem,1rem+4vw,4.25rem)] leading-tight mb-6">
            領養代替購買
            <br />
            <span className="relative inline-block text-[var(--color-primary)]">
              拯救一個生命
              <svg
                className="absolute -bottom-2 left-0 w-full h-3 text-[var(--color-accent-warm)]"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M2 9 Q 50 2 100 7 T 198 5" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="text-base lg:text-lg text-[var(--color-text-muted)] max-w-[46ch] mb-8">
            香港拯救貓狗協會自2007年成立，致力為流浪貓狗提供糧食、醫療、絕育及領養服務，每年救助超過600隻毛孩。
          </p>
          <div className="flex flex-wrap gap-4 mb-10">
            <a
              href="#adoption"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] hover:-translate-y-0.5 transition-all shadow-[0_8px_24px_rgba(212,77,102,0.35)]"
            >
              <PawPrint className="h-4 w-4" /> 瀏覽待領養動物
            </a>
            <a
              href="#donate"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-bold text-sm hover:bg-[var(--color-primary)] hover:text-white transition-all"
            >
              <Heart className="h-4 w-4" /> 支持我們
            </a>
          </div>

          {/* Members pill */}
          <div className="inline-flex items-center gap-4 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] py-2.5 pl-3 pr-6 shadow-[0_6px_24px_rgba(29,35,83,0.08)]">
            <div className="flex -space-x-3">
              {[heroImg, cat1, dog1].map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt=""
                  aria-hidden="true"
                  className="h-10 w-10 rounded-full border-2 border-[var(--color-surface)] object-cover"
                />
              ))}
              <span className="h-10 w-10 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-accent-warm)] text-white text-[11px] font-bold flex items-center justify-center">
                +3K
              </span>
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold text-[var(--color-panel)]">3.5K+</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">義工及支持者社群</div>
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Photo blob backdrop */}
          <div
            className="absolute inset-4 rounded-[3rem] rotate-3 bg-white/70"
            aria-hidden="true"
          />
          <img
            src={heroImg}
            alt="義工懷抱獲救小動物"
            width={1280}
            height={1024}
            className="relative rounded-[3rem] shadow-2xl w-full h-auto aspect-[5/4] object-cover"
          />

          {/* Floating rating badge */}
          <div className="absolute top-6 -right-2 lg:-right-6 bg-[var(--color-panel)] text-white rounded-2xl px-5 py-3.5 shadow-xl flex items-center gap-3">
            <div className="font-display text-2xl font-bold">4.9</div>
            <div className="leading-tight">
              <div className="flex gap-0.5 text-[var(--color-accent-warm)]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3 w-3" fill="currentColor" />
                ))}
              </div>
              <div className="text-[10px] text-white/70 mt-0.5">領養者好評</div>
            </div>
          </div>

          {/* Licenses card */}
          <div className="absolute -bottom-6 -left-4 right-4 lg:right-auto lg:w-[280px] bg-[var(--color-surface)]/95 backdrop-blur rounded-2xl p-4 shadow-xl border border-[var(--color-border)]">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-2 font-medium">
              鳴謝認可機構及牌照
            </p>
            <div className="flex flex-wrap gap-2">
              {["慈善牌照 91/14493", "漁農署 ORG-00041", "IRD §88"].map((b) => (
                <span
                  key={b}
                  className="text-[11px] bg-[var(--color-surface-offset)] text-[var(--color-text)] px-2 py-1 rounded-full font-medium"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
