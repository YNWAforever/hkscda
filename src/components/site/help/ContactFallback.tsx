import { Mail, Smartphone } from "lucide-react";

import { trackHelpEvent } from "../../../lib/help/analytics";
import type { HelpLanguage } from "../../../lib/help/faq";

export function ContactFallback({
  language,
  query,
}: {
  language: HelpLanguage;
  query?: string;
}) {
  function trackFallback() {
    trackHelpEvent("help_contact_fallback", {
      language,
      query,
    });
  }

  return (
    <section className="rounded-lg border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-highlight)] p-4">
      <h3 className="font-display text-base font-bold text-[var(--color-panel)]">
        {language === "zh-HK" ? "仍然找不到答案？" : "Still need help?"}
      </h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
        {language === "zh-HK"
          ? "如問題涉及個人資料、付款、收據或申請狀態，請直接聯絡職員處理。"
          : "For personal data, payment, receipt, or application-status questions, please contact staff directly."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="tel:+85298641089"
          onClick={trackFallback}
          className="inline-flex whitespace-nowrap items-center gap-2 rounded-full bg-[var(--color-panel)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-panel)]/90"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          9864 1089
        </a>
        <a
          href="mailto:info@hkscda.com"
          onClick={trackFallback}
          className="inline-flex whitespace-nowrap items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-bold text-[var(--color-panel)] transition-colors hover:bg-[var(--color-surface-offset)]"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          info@hkscda.com
        </a>
      </div>
    </section>
  );
}

