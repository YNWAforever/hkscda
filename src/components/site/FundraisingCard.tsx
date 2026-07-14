import { Heart, ReceiptText, ShieldCheck } from "lucide-react";
import cat1 from "@/assets/cat1.jpg";
import { Reveal } from "@/lib/reveal";

export function FundraisingCard() {
  return (
    <section className="bg-[var(--color-surface)] px-6 py-16 lg:py-20" aria-labelledby="fundraising-h">
      <div className="container-wide">
        <div className="grid items-center gap-8 border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6 lg:grid-cols-2 lg:gap-14 lg:p-12">
          <Reveal className="relative">
            <img src={cat1} alt="正在接受醫療照顧的貓咪" loading="lazy" className="aspect-[4/3] w-full object-cover shadow-xl" />
            <div className="absolute bottom-4 left-4 bg-[var(--color-panel)] px-4 py-2 text-xs font-bold text-white shadow-lg">
              醫療照護需要社區支持
            </div>
          </Reveal>

          <Reveal>
            <p className="text-sm font-bold tracking-wide text-[var(--color-secondary)]">支持救援</p>
            <h2 id="fundraising-h" className="mt-2 text-3xl font-bold leading-tight text-[var(--color-text)] lg:text-4xl">
              讓醫療和康復可以繼續
            </h2>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-[var(--color-text-muted)]">
              你的捐助會支持受傷及重病動物的醫療、照護和康復需要。協會保留正式報告和收據資訊，方便支持者了解捐助安排。
            </p>
            <div className="mt-6 grid gap-3 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
              <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" /> 政府認可慈善機構</div>
              <div className="flex items-start gap-2"><ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" /> 可按需要申請收條</div>
            </div>
            <a href="/donate" className="btn-secondary mt-7 min-h-11 px-5">
              <Heart className="h-4 w-4" fill="currentColor" aria-hidden="true" /> 立即捐助
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}