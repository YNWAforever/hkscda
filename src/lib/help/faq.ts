export type HelpLanguage = "zh-HK" | "en";

export type HelpCategory = "sponsorship" | "adoption" | "tax_receipt" | "donation" | "contact";

export type BilingualText = Record<HelpLanguage, string>;

export type HelpCta = {
  href: string;
  label: BilingualText;
  analyticsAction: string;
  external?: boolean;
};

export type HelpFaq = {
  id: string;
  category: HelpCategory;
  question: BilingualText;
  answer: BilingualText;
  keywords: Record<HelpLanguage, string[]>;
  cta?: HelpCta;
  sensitive?: boolean;
};

export const helpCategoryLabels: Record<HelpCategory, BilingualText> = {
  sponsorship: { "zh-HK": "助養", en: "Sponsorship" },
  adoption: { "zh-HK": "領養", en: "Adoption" },
  tax_receipt: { "zh-HK": "報稅收據", en: "Tax receipts" },
  donation: { "zh-HK": "捐款", en: "Donations" },
  contact: { "zh-HK": "聯絡職員", en: "Contact staff" },
};

export function getFaqText(faq: HelpFaq, language: HelpLanguage) {
  return {
    question: faq.question[language],
    answer: faq.answer[language],
    keywords: faq.keywords[language],
    cta: faq.cta
      ? {
          ...faq.cta,
          label: faq.cta.label[language],
        }
      : undefined,
    categoryLabel: helpCategoryLabels[faq.category][language],
  };
}
