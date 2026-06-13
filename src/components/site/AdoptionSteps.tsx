import { Search, FileText, House, PawPrint } from "lucide-react";
import { Reveal } from "@/lib/reveal";

const steps = [
  {
    n: "01",
    Icon: Search,
    title: "瀏覽待領養動物",
    desc: "在網站或領養日活動認識等待家園的貓狗，找到心動的毛孩。",
  },
  {
    n: "02",
    Icon: FileText,
    title: "提交領養申請",
    desc: "填寫領養申請表，義工會與您聯絡了解家庭環境及飼養經驗。",
  },
  {
    n: "03",
    Icon: House,
    title: "義工家訪審核",
    desc: "義工上門家訪，確保居住環境安全合適，並提供飼養建議。",
  },
  {
    n: "04",
    Icon: PawPrint,
    title: "簽約接毛孩回家",
    desc: "簽署領養協議後正式迎接新家庭成員，協會持續跟進支援。",
  },
];

export function AdoptionSteps() {
  return (
    <section className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]" aria-labelledby="steps-h">
      <div className="container-wide">
        <Reveal className="text-center mb-12">
          <h2
            id="steps-h"
            className="font-display text-3xl lg:text-5xl font-bold text-[var(--color-panel)] mb-4"
          >
            四步找到你的命定毛孩
          </h2>
          <p className="text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
            由認識到接回家，全程有義工陪伴指導。貓咪領養費 HK$500 · 唐狗免費。
          </p>
        </Reveal>

        <ol className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div
            className="hidden lg:block absolute top-0 left-[12%] right-[12%] border-t-2 border-dashed border-[var(--color-accent-warm)]/60"
            aria-hidden="true"
          />
          {steps.map((s, i) => (
            <Reveal
              as="li"
              key={s.n}
              className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[1.75rem] p-6 pt-8 hover:shadow-lg hover:border-[var(--color-accent-warm)]/60 transition-[box-shadow,border-color] duration-300"
            >
              <span
                className={`absolute -top-5 left-6 h-10 w-10 rounded-full flex items-center justify-center font-display font-bold text-sm shadow-md ${
                  i % 2 === 0
                    ? "bg-[var(--color-panel)] text-white"
                    : "bg-[var(--color-accent-warm)] text-white"
                }`}
              >
                {s.n}
              </span>
              <div className="h-12 w-12 rounded-2xl bg-[var(--color-primary-highlight)] flex items-center justify-center mb-4">
                <s.Icon className="h-5.5 w-5.5 text-[var(--color-primary)]" strokeWidth={1.8} />
              </div>
              <h3 className="font-display font-bold text-[var(--color-panel)] mb-2">{s.title}</h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{s.desc}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
