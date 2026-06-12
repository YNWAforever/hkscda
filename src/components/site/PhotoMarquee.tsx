import cat1 from "@/assets/cat1.jpg";
import cat2 from "@/assets/cat2.jpg";
import dog1 from "@/assets/dog1.jpg";
import dog2 from "@/assets/dog2.jpg";
import hero from "@/assets/hero.jpg";
import { Reveal } from "@/lib/reveal";

const photos = [
  { img: hero, alt: "義工懷抱獲救小動物" },
  { img: cat1, alt: "獲救貓咪 Mochi" },
  { img: dog1, alt: "獲救狗狗 Brownie" },
  { img: cat2, alt: "等待領養的BB貓" },
  { img: dog2, alt: "TNR 行動中的狗狗" },
];

// Slow photo conveyor — the track is rendered twice so the CSS keyframe can
// loop seamlessly (translate -100% - gap). Pauses on hover; static under
// prefers-reduced-motion (see styles.css).
export function PhotoMarquee() {
  return (
    <section aria-label="社區相片" className="py-16 lg:py-20 overflow-hidden">
      <Reveal className="container-wide mb-8 flex items-end justify-between gap-6">
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-[var(--color-panel)]">
          與社區一起，守護毛孩
        </h2>
        <p className="hidden md:block text-sm text-[var(--color-text-muted)] max-w-[36ch]">
          救援現場、領養日與義工活動的點滴。
        </p>
      </Reveal>
      <div className="marquee">
        {[0, 1].map((dup) => (
          <div key={dup} className="marquee-track pl-5" aria-hidden={dup === 1 || undefined}>
            {photos.map((p, i) => (
              <img
                key={i}
                src={p.img}
                alt={dup === 0 ? p.alt : ""}
                loading="lazy"
                className="h-56 lg:h-72 w-auto rounded-[25px] object-cover shadow-soft"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
