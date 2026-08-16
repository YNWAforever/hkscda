import catPortrait from "@/assets/cat-portrait.jpg";
import catsTabbyPair from "@/assets/cats-tabby-pair.jpg";
import kittensCream from "@/assets/kittens-cream.jpg";
import puppiesPlaying from "@/assets/puppies-playing.jpg";
import volunteerPuppies from "@/assets/volunteer-puppies.jpg";
import { Reveal } from "@/lib/reveal";

const photos = [
  { img: volunteerPuppies, alt: "義工懷抱兩隻獲救的黑色幼犬" },
  { img: catsTabbyPair, alt: "一對等待領養的虎斑貓" },
  { img: puppiesPlaying, alt: "兩隻幼犬在收容所裡玩耍" },
  { img: kittensCream, alt: "四隻獲救的小貓擠在一起張望" },
  { img: catPortrait, alt: "康復中的白胸虎斑貓" },
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
