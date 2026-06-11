import heroImg from "@/assets/hero.jpg";
import { PawPrint, Heart } from "lucide-react";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden px-6 py-16 lg:py-24"
      style={{
        background:
          "linear-gradient(135deg,var(--color-hero-gradient-start) 0%,var(--color-hero-gradient-mid) 50%,var(--color-hero-gradient-end) 100%)",
      }}
      aria-label="主頁橫幅"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 70% 50%,rgba(192,74,42,0.30) 0%,transparent 60%)",
        }}
      />
      <div className="container-wide relative grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="text-white">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-white/20 bg-white/10 backdrop-blur text-xs font-medium text-white/85">
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-accent-warm)]"
              style={{ animation: "pulse-dot 2s infinite" }}
            />
            本會為「不殺」(No Kill) 政府認可慈善機構
          </div>
          <h1 className="font-display font-bold text-[clamp(2.5rem,1rem+4vw,4.5rem)] leading-tight mb-6">
            領養代替購買
            <br />
            <span className="text-[var(--color-accent-warm)]">拯救一個生命</span>
          </h1>
          <p className="text-base lg:text-lg text-white/80 max-w-[48ch] mb-8">
            香港拯救貓狗協會自2007年成立，致力為流浪貓狗提供糧食、醫療、絕育及領養服務，每年救助超過600隻毛孩。
          </p>
          <div className="flex flex-wrap gap-8 mb-8">
            {[
              ["5,000+", "貓咪成功領養"],
              ["1,800+", "狗狗成功領養"],
              ["2007", "年創立"],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-2xl font-bold">{n}</div>
                <div className="text-xs text-white/60 mt-1">{l}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              href="#adoption"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] hover:-translate-y-0.5 transition-all shadow-lg"
            >
              <PawPrint className="h-4 w-4" /> 瀏覽待領養動物
            </a>
            <a
              href="#donate"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border-2 border-white/50 text-white font-bold text-sm hover:bg-white/10 hover:border-white transition-all"
            >
              <Heart className="h-4 w-4" /> 支持我們
            </a>
          </div>
        </div>
        <div className="relative">
          <img
            src={heroImg}
            alt="義工懷抱獲救小動物"
            width={1280}
            height={1024}
            className="rounded-3xl shadow-2xl w-full h-auto aspect-[5/4] object-cover"
          />
          <div className="absolute -bottom-6 -left-4 right-4 lg:right-auto lg:w-[280px] bg-white/95 backdrop-blur rounded-2xl p-4 shadow-xl">
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
