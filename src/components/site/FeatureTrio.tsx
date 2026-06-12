import { Siren, Stethoscope, House, ArrowRight } from "lucide-react";

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
    <div className="px-6 -mt-2 relative z-10">
      <div className="container-wide">
        <div className="rounded-[2.5rem] bg-[var(--color-panel)] px-6 py-10 lg:px-12 lg:py-12 shadow-[0_24px_60px_rgba(29,35,83,0.25)]">
          <div className="grid md:grid-cols-3 gap-8 lg:gap-10">
            {features.map((f) => (
              <a
                key={f.title}
                href={f.href}
                className="group text-center md:text-left flex flex-col items-center md:items-start"
              >
                <div className="h-16 w-16 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-105">
                  <f.Icon className="h-7 w-7 text-[var(--color-primary)]" strokeWidth={1.8} />
                </div>
                <h3 className="font-display text-lg font-bold text-white mb-2 flex items-center gap-1.5">
                  {f.title}
                  <ArrowRight className="h-4 w-4 text-[var(--color-accent-warm)] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">{f.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
