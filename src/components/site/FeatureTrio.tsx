import { Siren, Stethoscope, House, ArrowRight } from "lucide-react";
import dog1 from "@/assets/dog1.jpg";
import cat1 from "@/assets/cat1.jpg";
import heroImg from "@/assets/hero.jpg";

const features = [
  {
    Icon: Siren,
    img: dog1,
    alt: "獲救的狗狗",
    title: "緊急救援",
    desc: "接報後迅速行動，拯救受傷、被棄養或來自繁殖場的貓狗。",
    href: "#programs",
  },
  {
    Icon: Stethoscope,
    img: cat1,
    alt: "接受醫療的貓咪",
    title: "醫療康復",
    desc: "提供全面醫療護理，包括絕育、疫苗、治療及日常保健。",
    href: "#about",
  },
  {
    Icon: House,
    img: heroImg,
    alt: "義工與毛孩",
    title: "領養服務",
    desc: "透過嚴格家訪審核，為每隻毛孩配對永久的幸福家庭。",
    href: "#adoption",
  },
];

export function FeatureTrio() {
  return (
    <div className="px-6 -mt-2 relative z-10">
      <div className="container-wide">
        <div className="rounded-[2.5rem] bg-[var(--color-panel)] px-6 py-10 lg:px-12 lg:py-12 shadow-panel">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {features.map((f) => (
              <a
                key={f.title}
                href={f.href}
                className="group rounded-[1.5rem] bg-[var(--color-panel-2)] overflow-hidden hover:-translate-y-1 transition-transform duration-200"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={f.img}
                    alt={f.alt}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute -bottom-5 left-5 h-12 w-12 rounded-full bg-[var(--color-cta)] flex items-center justify-center shadow-md">
                    <f.Icon className="h-5 w-5 text-[var(--color-panel)]" strokeWidth={2} />
                  </div>
                </div>
                <div className="p-5 pt-8">
                  <h3 className="font-display text-lg font-bold text-white mb-1.5 flex items-center gap-1.5">
                    {f.title}
                    <ArrowRight className="h-4 w-4 text-[var(--color-accent-warm)] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
                  </h3>
                  <p className="text-sm text-white/70 leading-relaxed">{f.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
