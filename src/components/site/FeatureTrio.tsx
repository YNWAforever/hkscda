import { Siren, Stethoscope, House, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero.jpg";

const features = [
  {
    Icon: Siren,
    title: "緊急救援",
    desc: "接報後迅速行動，拯救受傷、被棄養或來自繁殖場的貓狗。",
    href: "#programs",
  },
  {
    Icon: Stethoscope,
    title: "醫療康復",
    desc: "提供全面醫療護理，包括絕育、疫苗、治療及日常保健。",
    href: "#about",
  },
  {
    Icon: House,
    title: "領養服務",
    desc: "透過嚴格家訪審核，為每隻毛孩配對永久的幸福家庭。",
    href: "#adoption",
  },
];

export function FeatureTrio() {
  return (
    <section className="bg-[var(--color-panel)] px-6 py-12 lg:py-16">
      <div className="container-wide grid lg:grid-cols-[300px_1fr] gap-10 items-center">
        {/* Photo card with coral arrow badge */}
        <div className="relative max-w-[320px]">
          <img
            src={heroImg}
            alt="義工與獲救的毛孩"
            loading="lazy"
            className="rounded-2xl aspect-[4/3] object-cover w-full shadow-panel"
          />
          <a
            href="#adoption"
            aria-label="瀏覽待領養動物"
            className="absolute -right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-[var(--color-cta)] text-[var(--color-panel)] flex items-center justify-center shadow-md hover:bg-[var(--color-cta-hover)] hover:scale-105 transition-all"
          >
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>

        {/* Three pillars separated by dashed dividers */}
        <div className="grid md:grid-cols-3">
          {features.map((f, i) => (
            <a
              key={f.title}
              href={f.href}
              className={`group py-6 md:py-2 md:px-8 ${
                i > 0
                  ? "border-t-2 md:border-t-0 md:border-l-2 border-dashed border-white/20"
                  : "md:pl-0"
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center mb-4 group-hover:bg-[var(--color-cta)] transition-colors">
                <f.Icon
                  className="h-5 w-5 text-[var(--color-accent-warm)] group-hover:text-[var(--color-panel)] transition-colors"
                  strokeWidth={2}
                />
              </div>
              <h3 className="font-display text-lg font-bold text-[var(--color-accent-warm)] mb-1.5 flex items-center gap-1.5">
                {f.title}
                <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
              </h3>
              <p className="text-sm text-white/70 leading-relaxed">{f.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
