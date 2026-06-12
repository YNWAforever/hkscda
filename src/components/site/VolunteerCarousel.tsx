import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Users, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";

const stories = [
  {
    initials: "Linda",
    color: "#d44d66",
    name: "Linda Tse",
    role: "創辦人 · 服務18年",
    quote:
      "2007年成立協會時，從沒想過會走到今天。每隻被救助的毛孩都教會我堅持的意義。",
  },
  {
    initials: "Ka",
    color: "#232a5e",
    name: "Ka Yan",
    role: "家訪義工 · 5年",
    quote:
      "家訪不是審查，是為毛孩找一個真的能住一輩子的家。看到適合的家庭眼神發光，所有努力都值得。",
  },
  {
    initials: "Wing",
    color: "#3a7a45",
    name: "Wing",
    role: "TNR 隊長 · 7年",
    quote:
      "凌晨四點蹲在後巷等貓進籠，這份工作很冷。但想到牠們不會再生育受苦，心就暖了。",
  },
  {
    initials: "Sam",
    color: "#c07820",
    name: "Sam Chan",
    role: "醫療助理 · 3年",
    quote:
      "我曾經害怕看到傷殘的動物。現在我親手照料牠們康復，發現自己也被治癒。",
  },
  {
    initials: "May",
    color: "#ee8295",
    name: "May Lam",
    role: "暫托家庭 · 4年",
    quote:
      "短短幾個月把牠們從怕人養到撒嬌，然後送去新家庭。每次都不捨，但這就是我們的使命。",
  },
  {
    initials: "Eric",
    color: "#2f3875",
    name: "Eric Wong",
    role: "活動義工 · 2年",
    quote:
      "我太忙不能領養，但每月領養日來幫手、搬糧食，就是我能做的事。每個人都可以出一份力。",
  },
];

export function VolunteerCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: true,
    slidesToScroll: 1,
  });
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    setCount(emblaApi.scrollSnapList().length);
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi]);

  return (
    <section
      id="stories"
      className="px-6 py-16 lg:py-24 bg-[var(--color-surface)]"
    >
      <div className="container-wide">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> 義工故事
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">
              他們，是毛孩的第一個家人
            </h2>
            <p className="text-[var(--color-text-muted)] max-w-[52ch]">
              從家訪、暫托、醫療到 TNR，每一隻被救助的生命，背後都有一群默默付出的義工。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={scrollPrev}
              aria-label="上一個故事"
              className="h-11 w-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-offset)] hover:bg-[var(--color-primary-highlight)] hover:border-[var(--color-primary)] flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={scrollNext}
              aria-label="下一個故事"
              className="h-11 w-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-offset)] hover:bg-[var(--color-primary-highlight)] hover:border-[var(--color-primary)] flex items-center justify-center transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden -mx-2" ref={emblaRef}>
          <div className="flex">
            {stories.map((s) => (
              <article
                key={s.name}
                className="flex-[0_0_85%] sm:flex-[0_0_60%] md:flex-[0_0_42%] lg:flex-[0_0_33.333%] px-2"
              >
                <div className="h-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col">
                  <div
                    className="h-16 w-16 rounded-full flex items-center justify-center text-white font-display font-bold text-lg mb-4"
                    style={{ background: s.color }}
                  >
                    {s.initials.slice(0, 2)}
                  </div>
                  <h3 className="font-display text-lg font-bold mb-1">
                    {s.name}
                  </h3>
                  <p className="text-xs font-medium text-[var(--color-primary)] mb-4">
                    {s.role}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                    “{s.quote}”
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === selected
                  ? "w-8 bg-[var(--color-primary)]"
                  : "w-2 bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>

        <div className="text-center mt-10">
          <a
            href="#volunteer-apply"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            <UserPlus className="h-4 w-4" /> 加入義工團隊
          </a>
        </div>
      </div>
    </section>
  );
}
