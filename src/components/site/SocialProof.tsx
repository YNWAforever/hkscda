import { Star } from "lucide-react";
import { Reveal } from "@/lib/reveal";
import { StatCard } from "@/components/site/StatCard";

const stats = [
  { n: "5,000+", l: "貓咪成功領養" },
  { n: "1,800+", l: "狗狗成功領養" },
  { n: "600+", l: "每年救助毛孩" },
  { n: "18+", l: "年服務年資" },
];

const press = ["Apple Daily", "SCMP", "HK01", "Stand News", "TVB News", "Ming Pao"];

const partners = [
  "City University",
  "SPCA HK",
  "Pet Pet Park",
  "HK Vet Hospital",
  "Whiskas",
  "Royal Canin",
];

const testimonials = [
  {
    quote: "從協會領養了Mochi後，整個家都有了陽光。義工的耐心指導讓我們順利度過了適應期。",
    name: "Cathy 陳小姐",
    pet: "領養 Mochi（橘貓）· 2023",
    initials: "陳",
  },
  {
    quote: "領養唐狗Brownie三年了，他從怕人到現在每天笑著迎接我。謝謝HKSCDA讓我們相遇。",
    name: "Marcus 黃先生",
    pet: "領養 Brownie（唐狗）· 2022",
    initials: "黃",
  },
  {
    quote: "整個申請流程很嚴謹，家訪義工很專業。看得出他們真的把動物的福祉放第一。",
    name: "Joanne 李太",
    pet: "領養 Coco & Latte（貓BB一對）· 2024",
    initials: "李",
  },
];

export function SocialProof() {
  return (
    <section id="impact" className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]">
      <div className="container-wide">
        <Reveal className="text-center mb-12">
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center justify-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> 信譽與成就
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">18 年來，與香港同行</h2>
          <p className="text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
            來自香港社會各界、傳媒及合作夥伴的信任，是我們繼續救助每一個生命的力量。
          </p>
        </Reveal>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {stats.map((s) => (
            <StatCard key={s.l} value={s.n} label={s.l} color="var(--color-primary)" />
          ))}
        </div>

        {/* Press */}
        <div className="mb-12">
          <p className="text-center text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-6 font-bold">
            傳媒報導
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {press.map((p) => (
              <span
                key={p}
                className="font-display text-lg lg:text-xl font-bold text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Partners */}
        <div className="mb-16">
          <p className="text-center text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-6 font-bold">
            合作夥伴及贊助機構
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
            {partners.map((p) => (
              <span
                key={p}
                className="px-4 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)] font-medium"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col"
            >
              <div className="text-[var(--color-primary)] text-3xl leading-none mb-3">“</div>
              <blockquote className="text-sm text-[var(--color-text)] leading-relaxed flex-1">
                {t.quote}
              </blockquote>
              <figcaption className="flex items-center gap-3 mt-5 pt-5 border-t border-[var(--color-border)]">
                <div className="h-10 w-10 rounded-full bg-[var(--color-primary-highlight)] text-[var(--color-primary)] flex items-center justify-center font-display font-bold">
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{t.pet}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
