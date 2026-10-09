import { z } from "zod";

import type { AdminLanguage } from "../admin/language";
import type { FaqCta } from "./types";

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const FAQ_CTA_OPTIONS: Array<{ key: string } & FaqCta> = [
  {
    key: "view_sponsor_animals",
    href: "/sponsors",
    label: { "zh-HK": "查看可助養動物", en: "View sponsor animals" },
    analyticsAction: "view_sponsor_animals",
  },
  {
    key: "start_sponsorship_pledge",
    href: "/sponsors/pledge",
    label: { "zh-HK": "前往助養申請", en: "Go to sponsorship form" },
    analyticsAction: "start_sponsorship_pledge",
  },
  {
    key: "start_adoption_application",
    href: "/adoption/apply",
    label: { "zh-HK": "前往領養申請", en: "Go to adoption application" },
    analyticsAction: "start_adoption_application",
  },
  {
    key: "browse_adoption_animals",
    href: "/animals/cat",
    label: { "zh-HK": "瀏覽可領養動物", en: "Browse adoptable animals" },
    analyticsAction: "browse_adoption_animals",
  },
  {
    key: "open_donation_for_receipt",
    href: "/donate",
    label: { "zh-HK": "查看捐款收據", en: "Get donation receipt info" },
    analyticsAction: "open_donation_for_receipt",
  },
  {
    key: "contact_for_receipt",
    href: "#contact",
    label: { "zh-HK": "聯絡職員", en: "Contact staff" },
    analyticsAction: "contact_for_receipt",
  },
  {
    key: "view_donation_methods",
    href: "/donate",
    label: { "zh-HK": "查看捐款安排", en: "View donation arrangements" },
    analyticsAction: "view_donation_methods",
  },
  {
    key: "donation_purpose_cta",
    href: "/donate",
    label: { "zh-HK": "支持 HKSCDA", en: "Support HKSCDA" },
    analyticsAction: "donation_purpose_cta",
  },
  {
    key: "open_contact_section",
    href: "#contact",
    label: { "zh-HK": "查看聯絡資料", en: "View contact details" },
    analyticsAction: "open_contact_section",
  },
  {
    key: "contact_for_private_case",
    href: "#contact",
    label: { "zh-HK": "聯絡職員", en: "Contact staff" },
    analyticsAction: "contact_for_private_case",
  },
];

/**
 * The label of an action button option as the admin FAQ form lists it, in the admin's language: the
 * zh-HK text visitors see on the button, or the English text they see in English. The default is
 * zh-HK, the label the form has always shown. The public FAQ reads the whole label through
 * `resolveFaqCta`, which this does not change.
 */
export function faqCtaOptionLabel(
  option: { label: FaqCta["label"] },
  language: AdminLanguage = "zh",
): string {
  if (language === "en" && option.label.en.trim()) return option.label.en;
  return option.label["zh-HK"];
}

const FAQ_CTA_KEYS = FAQ_CTA_OPTIONS.map((option) => option.key) as [string, ...string[]];

export const faqCategorySchema = z.enum([
  "sponsorship",
  "adoption",
  "tax_receipt",
  "donation",
  "contact",
]);

export const faqEntryIdSchema = z.string().uuid();

export const upsertFaqEntrySchema = z.object({
  id: z.string().uuid().optional(),
  category: faqCategorySchema,
  questionZh: requiredText(300),
  questionEn: requiredText(300),
  answerZh: requiredText(4000),
  answerEn: requiredText(4000),
  keywordsZh: z.array(z.string().trim().min(1)).default([]),
  keywordsEn: z.array(z.string().trim().min(1)).default([]),
  ctaKey: z.enum(FAQ_CTA_KEYS).nullable(),
  sensitive: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const deactivateFaqEntrySchema = z.object({ id: faqEntryIdSchema });

// The public search-gap beacon body. Strict: the browser sends exactly these
// three fields, so anything else is not from our page.
export const searchGapBeaconSchema = z
  .object({
    topic: z.string().min(1).max(80),
    language: z.enum(["zh-HK", "en"]),
    confidence: z.enum(["none", "low"]),
  })
  .strict();

export type UpsertFaqEntryInput = z.infer<typeof upsertFaqEntrySchema>;

export function resolveFaqCta(ctaKey: string | null): FaqCta | undefined {
  if (!ctaKey) return undefined;
  const option = FAQ_CTA_OPTIONS.find((candidate) => candidate.key === ctaKey);
  if (!option) return undefined;
  const { key: _key, ...cta } = option;
  return cta;
}
