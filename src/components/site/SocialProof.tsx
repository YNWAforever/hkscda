import { SectionHeading } from "@/components/site/SectionHeading";
import { Reveal } from "@/lib/reveal";
import astkatta from "@/assets/partners/astkatta.jpg";
import brabanconne from "@/assets/partners/brabanconne.png";
import buddyBites from "@/assets/partners/buddy-bites.png";
import catPlus from "@/assets/partners/cat-plus.png";
import mapleVet from "@/assets/partners/maple-vet.png";
import primeview from "@/assets/partners/primeview.png";
import strayless from "@/assets/partners/strayless.jpg";

// Mirrors the 鳴謝及信賴伙伴 row on hkscda.com; only partners the association
// actually credits belong here.
const partners = [
  { name: "Maple Vet", logo: mapleVet, width: 106, height: 106 },
  {
    name: "景峰動物醫療中心 The Prime View Veterinary Centre",
    logo: primeview,
    width: 106,
    height: 106,
  },
  { name: "CAT PLUS", logo: catPlus, width: 106, height: 106 },
  { name: "Buddy Bites", logo: buddyBites, width: 106, height: 106 },
  { name: "Brabançonne", logo: brabanconne, width: 230, height: 153 },
  { name: "ástkatta", logo: astkatta, width: 230, height: 153 },
  { name: "浪浪 Strayless", logo: strayless, width: 230, height: 153 },
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
    <section id="impact" className="bg-[var(--color-surface-offset)] px-6 py-16 lg:py-24">
      <div className="container-wide">
        <Reveal className="mb-12">
          <SectionHeading
            eyebrow="社區支持"
            title="與香港同行，讓照護可以持續"
            description="領養家庭、義工、合作夥伴和支持者的參與，讓每一次救援都有延續的可能。"
          />
        </Reveal>

        <div className="mb-14 border-y border-[var(--color-border)] py-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
          公開影響資料只會在資料庫成功核實後顯示，請到協會簡介查看目前可核實的資料日期。
          <a href="/about" className="ml-2 font-bold text-[var(--color-primary)] underline">
            查看協會簡介
          </a>
        </div>

        <div className="mb-16">
          <h3 className="mb-6 text-center text-xs font-semibold text-[var(--color-text-muted)]">
            鳴謝及信賴伙伴
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-7">
            {partners.map((partner) => (
              <li
                key={partner.name}
                className="flex h-24 items-center justify-center border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <img
                  src={partner.logo}
                  alt={partner.name}
                  width={partner.width}
                  height={partner.height}
                  loading="lazy"
                  decoding="async"
                  className="max-h-full w-auto max-w-full object-contain"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((item) => (
            <figure
              key={item.name}
              className="flex flex-col border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <div className="mb-3 text-3xl leading-none text-[var(--color-primary)]">“</div>
              <blockquote className="flex-1 text-sm leading-relaxed text-[var(--color-text)]">
                {item.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--color-border)] pt-5">
                <div className="flex h-10 w-10 items-center justify-center bg-[var(--color-primary-highlight)] font-bold text-[var(--color-primary)]">
                  {item.initials}
                </div>
                <div>
                  <div className="text-sm font-bold">{item.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{item.pet}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
