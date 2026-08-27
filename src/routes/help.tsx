import { createFileRoute } from "@tanstack/react-router";
import { PublicPageFrame } from "../components/site/PublicPageFrame";
import { publicUrl } from "@/lib/publicOrigin";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";

import { FaqResultCard } from "../components/site/help/FaqResultCard";
import { HelpSearch } from "../components/site/help/HelpSearch";
import {
  getFaqsByCategory,
  helpCategoryLabels,
  helpFaqs,
  type HelpCategory,
  type HelpLanguage,
} from "../lib/help/faq";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "常見問題與客服 | HKSCDA" },
      {
        name: "description",
        content: "HKSCDA 常見問題中心，解答助養、領養、捐款、報稅收據及聯絡職員問題。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/help") }],
  }),
  component: HelpPage,
});

const categories: HelpCategory[] = [
  "sponsorship",
  "adoption",
  "tax_receipt",
  "donation",
  "contact",
];

const pageCopy = {
  "zh-HK": {
    eyebrow: "常見問題",
    title: "有問題？先在這裡找答案",
    intro:
      "搜尋助養、領養、捐款、報稅收據和聯絡方法。涉及個人資料、付款或申請狀態時，請直接聯絡職員。",
    summary: (count: number) => `${count} 條已審批答案`,
    searchTitle: "搜尋答案",
    searchBody: "輸入關鍵字尋找固定答案。涉及個人資料、付款、收據或申請狀態時，請直接聯絡職員。",
    categoriesTitle: "常見主題",
    categoriesBody: "這些主題整理了訪客最常問的問題，方便你快速找到正確方向。",
    contactTitle: "需要職員協助？",
    contactBody: "如問題涉及個人個案、付款狀態、收據、申請進度或需要人手處理，請直接聯絡職員。",
    whatsappLabel: "WhatsApp",
    emailLabel: "電郵",
    whatsappNote: "9864 1089",
    emailNote: "info@hkscda.com",
    topicButton: "瀏覽全部",
    categoryNotes: {
      sponsorship: "查看助養流程、費用、合約與後續追蹤方式。",
      adoption: "查看領養申請流程、審批條件、等候及安排方式。",
      tax_receipt: "查看報稅收據申領資格、用途與開立流程。",
      donation: "查看捐款渠道、用途透明報告與收據處理方式。",
      contact: "查看聯絡職員服務項目、工作時間與回覆流程。",
    } satisfies Record<HelpCategory, string>,
  },
  en: {
    eyebrow: "Help center",
    title: "Search first, then take the next step",
    intro:
      "This page brings together HKSCDA's approved fixed answers. Search for sponsorship, adoption, tax receipts, donations, or contact details, then open a topic card for a quick overview.",
    summary: (count: number) => `${count} approved answers`,
    searchTitle: "Search answers",
    searchBody:
      "Enter a keyword to find the matching fixed answer. For personal data, payments, receipts, or application status, please contact staff directly.",
    categoriesTitle: "Common topics",
    categoriesBody:
      "These cards group the questions people ask most often, so you can jump to the right topic faster.",
    contactTitle: "Contact staff",
    contactBody:
      "For individual cases, payment status, receipts, application progress, or anything that needs manual handling, please contact staff directly.",
    whatsappLabel: "WhatsApp",
    emailLabel: "Email",
    whatsappNote: "9864 1089",
    emailNote: "info@hkscda.com",
    topicButton: "Browse all",
    categoryNotes: {
      sponsorship: "See sponsorship flow, monthly amounts, and next steps.",
      adoption: "See adoption applications, requirements, and preparation.",
      tax_receipt: "See receipt eligibility and request steps.",
      donation: "See payment methods and donation purposes.",
      contact: "See staff contact options and what they can handle.",
    } satisfies Record<HelpCategory, string>,
  },
} satisfies Record<
  HelpLanguage,
  {
    eyebrow: string;
    title: string;
    intro: string;
    summary: (count: number) => string;
    searchTitle: string;
    searchBody: string;
    categoriesTitle: string;
    categoriesBody: string;
    contactTitle: string;
    contactBody: string;
    whatsappLabel: string;
    emailLabel: string;
    whatsappNote: string;
    emailNote: string;
    topicButton: string;
    categoryNotes: Record<HelpCategory, string>;
  }
>;

export function HelpFaqDirectory({ language }: { language: HelpLanguage }) {
  const copy = pageCopy[language];

  return (
    <div className="min-w-0 space-y-8">
      {categories.map((category) => {
        const faqs = getFaqsByCategory(category);
        const label = helpCategoryLabels[category][language];

        return (
          <section key={category} className="space-y-4" aria-labelledby={`help-topic-${category}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {label}
                </p>
                <h3
                  id={`help-topic-${category}`}
                  className="font-display text-xl font-bold text-[var(--color-panel)]"
                >
                  {label}
                </h3>
                <p className="max-w-[60ch] text-sm leading-6 text-[var(--color-text-muted)]">
                  {copy.categoryNotes[category]}
                </p>
              </div>
              <span className="rounded-full bg-[var(--color-primary-highlight)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                {language === "zh-HK" ? `${faqs.length} 條` : `${faqs.length} FAQs`}
              </span>
            </div>

            <div className="grid gap-3">
              {faqs.map((faq) => (
                <FaqResultCard key={faq.id} faq={faq} language={language} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function HelpPage() {
  const [language, setLanguage] = useState<HelpLanguage>("zh-HK");
  const copy = pageCopy[language];

  return (
    <PublicPageFrame
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.intro}
      lang={language === "en" ? "en" : "zh-Hant-HK"}
    >
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface-offset)]">
        <div className="container-wide py-10 lg:py-14">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                {copy.summary(helpFaqs.length)}
              </p>
            </div>

            <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs font-bold">
              {(["zh-HK", "en"] as const).map((nextLanguage) => (
                <button
                  key={nextLanguage}
                  type="button"
                  aria-pressed={language === nextLanguage}
                  onClick={() => setLanguage(nextLanguage)}
                  className={`rounded-full px-4 py-2 transition-colors ${
                    language === nextLanguage
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {nextLanguage === "zh-HK" ? "繁體中文" : "English"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="container-wide grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-8">
            <section
              id="search"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm lg:p-6"
              aria-labelledby="help-search-heading"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2
                    id="help-search-heading"
                    className="font-display text-xl font-bold text-[var(--color-panel)]"
                  >
                    {copy.searchTitle}
                  </h2>
                  <p className="max-w-[56ch] text-sm leading-6 text-[var(--color-text-muted)]">
                    {copy.searchBody}
                  </p>
                </div>
                <a
                  href="#topics"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-bold text-[var(--color-panel)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  {copy.topicButton}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
              <HelpSearch language={language} surface="page" />
            </section>

            <section id="topics" className="space-y-4" aria-labelledby="help-topics-heading">
              <div className="space-y-1">
                <h2
                  id="help-topics-heading"
                  className="font-display text-2xl font-bold text-[var(--color-panel)]"
                >
                  {copy.categoriesTitle}
                </h2>
                <p className="max-w-[60ch] text-sm leading-6 text-[var(--color-text-muted)]">
                  {copy.categoriesBody}
                </p>
              </div>

              <HelpFaqDirectory language={language} />
            </section>
          </div>

          <aside
            id="contact"
            className="self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5 text-white shadow-sm lg:sticky lg:top-6"
            aria-labelledby="help-contact-heading"
          >
            <div className="space-y-3">
              <h2 id="help-contact-heading" className="font-display text-xl font-bold">
                {copy.contactTitle}
              </h2>
              <p className="text-sm leading-6 text-white/75">{copy.contactBody}</p>
            </div>

            <div className="mt-5 space-y-3">
              <a
                href="https://wa.me/85298641089"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold transition-colors hover:bg-white/15"
              >
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block">{copy.whatsappLabel}</span>
                  <span className="block text-xs font-medium text-white/70">
                    {copy.whatsappNote}
                  </span>
                </span>
              </a>

              <a
                href="mailto:info@hkscda.com"
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold transition-colors hover:bg-white/15"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block">{copy.emailLabel}</span>
                  <span className="block break-all text-xs font-medium text-white/70">
                    {copy.emailNote}
                  </span>
                </span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </PublicPageFrame>
  );
}
