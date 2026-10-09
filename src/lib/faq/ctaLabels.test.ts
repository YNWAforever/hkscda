import { describe, expect, test } from "bun:test";

import { getFaqText } from "../help/faq";
import { FAQ_CTA_OPTIONS, faqCtaOptionLabel, resolveFaqCta } from "./schemas";
import { toHelpFaq } from "./toHelpFaq";
import type { FaqEntry } from "./types";

/**
 * The public help page and the admin FAQ form read the same ten action buttons. The admin form now
 * asks `faqCtaOptionLabel` for its label in the admin's language; the public page keeps reading the
 * whole bilingual label through `resolveFaqCta`. This file pins what the public side shows, and the
 * data both sides share, so a change to the admin accessor cannot reach a visitor.
 */
const EXPECTED = [
  ["view_sponsor_animals", "/sponsors", "查看可助養動物", "View sponsor animals"],
  ["start_sponsorship_pledge", "/sponsors/pledge", "前往助養申請", "Go to sponsorship form"],
  ["start_adoption_application", "/adoption/apply", "前往領養申請", "Go to adoption application"],
  ["browse_adoption_animals", "/animals/cat", "瀏覽可領養動物", "Browse adoptable animals"],
  ["open_donation_for_receipt", "/donate", "查看捐款收據", "Get donation receipt info"],
  ["contact_for_receipt", "#contact", "聯絡職員", "Contact staff"],
  ["view_donation_methods", "/donate", "查看捐款安排", "View donation arrangements"],
  ["donation_purpose_cta", "/donate", "支持 HKSCDA", "Support HKSCDA"],
  ["open_contact_section", "#contact", "查看聯絡資料", "View contact details"],
  ["contact_for_private_case", "#contact", "聯絡職員", "Contact staff"],
] as const;

function entry(ctaKey: string | null): FaqEntry {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    category: "donation",
    question: { "zh-HK": "問", en: "Question" },
    answer: { "zh-HK": "答", en: "Answer" },
    keywords: { "zh-HK": [], en: [] },
    ctaKey,
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

describe("the FAQ action buttons", () => {
  test("keep every key, link and label in both languages", () => {
    expect(FAQ_CTA_OPTIONS.map((option) => option.key)).toEqual(EXPECTED.map(([key]) => key));
    for (const [key, href, zh, en] of EXPECTED) {
      const option = FAQ_CTA_OPTIONS.find((candidate) => candidate.key === key);
      expect(option).toEqual({
        key,
        href,
        label: { "zh-HK": zh, en },
        analyticsAction: key,
      });
    }
  });

  test("reach a visitor as the whole bilingual label, whatever the admin accessor does", () => {
    // Ask for the admin labels first, in both languages, as the admin form does.
    for (const option of FAQ_CTA_OPTIONS) {
      faqCtaOptionLabel(option, "en");
      faqCtaOptionLabel(option, "zh");
    }
    for (const [key, href, zh, en] of EXPECTED) {
      expect(resolveFaqCta(key)).toEqual({
        href,
        label: { "zh-HK": zh, en },
        analyticsAction: key,
      });
      // The public help search reads the entry through `toHelpFaq`, which the repository's
      // `listPublic` and the admin answer tester both use.
      const help = toHelpFaq(entry(key));
      expect(help.cta).toEqual(resolveFaqCta(key));
      // The public page picks the label of the visitor's language.
      expect(getFaqText(help, "zh-HK").cta?.label).toBe(zh);
      expect(getFaqText(help, "en").cta?.label).toBe(en);
    }
  });

  test("show no button for an entry without one, or with a key that no longer exists", () => {
    expect(toHelpFaq(entry(null)).cta).toBeUndefined();
    expect(toHelpFaq(entry("removed_key")).cta).toBeUndefined();
  });
});

describe("faqCtaOptionLabel", () => {
  test("is the zh-HK label unless the admin is in English", () => {
    for (const [key, , zh, en] of EXPECTED) {
      const option = FAQ_CTA_OPTIONS.find((candidate) => candidate.key === key)!;
      expect(faqCtaOptionLabel(option)).toBe(zh);
      expect(faqCtaOptionLabel(option, "zh")).toBe(zh);
      expect(faqCtaOptionLabel(option, "en")).toBe(en);
      // The English admin never shows Chinese in a button label.
      expect(faqCtaOptionLabel(option, "en")).not.toMatch(/\p{Script=Han}/u);
    }
  });

  test("falls back to the zh-HK label when the English one is blank", () => {
    expect(faqCtaOptionLabel({ label: { "zh-HK": "聯絡職員", en: "" } }, "en")).toBe("聯絡職員");
    expect(faqCtaOptionLabel({ label: { "zh-HK": "聯絡職員", en: "   " } }, "en")).toBe("聯絡職員");
  });
});
