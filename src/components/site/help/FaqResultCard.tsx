import { ArrowRight, BadgeInfo } from "lucide-react";

import { getFaqText, type HelpFaq, type HelpLanguage } from "../../../lib/help/faq";
import { trackHelpEvent } from "../../../lib/help/analytics";

export function FaqResultCard({
  faq,
  language,
  compact = false,
}: {
  faq: HelpFaq;
  language: HelpLanguage;
  compact?: boolean;
}) {
  const text = getFaqText(faq, language);
  const cta = text.cta;
  const shouldClampAnswer = compact && !faq.sensitive;

  const ctaClassName = "btn-primary min-h-11 whitespace-nowrap text-xs";

  function handleCtaClick() {
    trackHelpEvent("help_cta_click", {
      faqId: faq.id,
      category: faq.category,
      language,
    });
  }

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--color-primary-highlight)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-primary)]">
          {text.categoryLabel}
        </span>
        {faq.sensitive && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">
            <BadgeInfo className="h-3 w-3" aria-hidden="true" />
            {language === "zh-HK" ? "固定審批答案" : "Approved answer"}
          </span>
        )}
      </div>

      <h3 className="font-display text-base font-bold leading-tight text-[var(--color-panel)]">
        {text.question}
      </h3>

      <p
        className={`mt-2 text-sm leading-6 text-[var(--color-text-muted)] ${
          shouldClampAnswer ? "line-clamp-4" : ""
        }`}
      >
        {text.answer}
      </p>

      {cta && (
        <div className="mt-4">
          <a
            href={cta.href}
            onClick={handleCtaClick}
            className={ctaClassName}
            target={cta.external ? "_blank" : undefined}
            rel={cta.external ? "noreferrer" : undefined}
          >
            {cta.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </article>
  );
}
