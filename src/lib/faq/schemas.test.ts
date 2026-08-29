import { describe, expect, test } from "bun:test";

import {
  FAQ_CTA_OPTIONS,
  deactivateFaqEntrySchema,
  faqEntryIdSchema,
  resolveFaqCta,
  upsertFaqEntrySchema,
} from "./schemas";

describe("faq schemas", () => {
  test("accepts a full valid upsert input, with and without an id", () => {
    const base = {
      category: "sponsorship" as const,
      questionZh: "助養運作方式是什麼？",
      questionEn: "How does sponsorship work?",
      answerZh: "答案",
      answerEn: "answer",
      keywordsZh: ["助養"],
      keywordsEn: ["sponsor"],
      ctaKey: "view_sponsor_animals",
      sensitive: false,
      sortOrder: 0,
      isActive: true,
    };
    expect(() => upsertFaqEntrySchema.parse(base)).not.toThrow();
    expect(() =>
      upsertFaqEntrySchema.parse({ ...base, id: "11111111-1111-4111-8111-111111111111" }),
    ).not.toThrow();
  });

  test("defaults isActive to true when omitted (new entries are visible by default)", () => {
    const parsed = upsertFaqEntrySchema.parse({
      category: "sponsorship",
      questionZh: "q",
      questionEn: "q",
      answerZh: "a",
      answerEn: "a",
      keywordsZh: [],
      keywordsEn: [],
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
    });
    expect(parsed.isActive).toBe(true);
  });

  test("accepts isActive: false explicitly (reactivation/deactivation via the edit form)", () => {
    const parsed = upsertFaqEntrySchema.parse({
      category: "sponsorship",
      questionZh: "q",
      questionEn: "q",
      answerZh: "a",
      answerEn: "a",
      keywordsZh: [],
      keywordsEn: [],
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
      isActive: false,
    });
    expect(parsed.isActive).toBe(false);
  });

  test("rejects an invalid category", () => {
    expect(() =>
      upsertFaqEntrySchema.parse({
        category: "not-a-real-category",
        questionZh: "q",
        questionEn: "q",
        answerZh: "a",
        answerEn: "a",
        keywordsZh: [],
        keywordsEn: [],
        ctaKey: null,
        sensitive: false,
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects a cta_key not present in FAQ_CTA_OPTIONS", () => {
    expect(() =>
      upsertFaqEntrySchema.parse({
        category: "donation",
        questionZh: "q",
        questionEn: "q",
        answerZh: "a",
        answerEn: "a",
        keywordsZh: [],
        keywordsEn: [],
        ctaKey: "not_a_real_preset",
        sensitive: false,
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("accepts a null cta_key (no CTA)", () => {
    expect(() =>
      upsertFaqEntrySchema.parse({
        category: "donation",
        questionZh: "q",
        questionEn: "q",
        answerZh: "a",
        answerEn: "a",
        keywordsZh: [],
        keywordsEn: [],
        ctaKey: null,
        sensitive: false,
        sortOrder: 0,
      }),
    ).not.toThrow();
  });

  test("rejects an empty question or answer", () => {
    expect(() =>
      upsertFaqEntrySchema.parse({
        category: "donation",
        questionZh: "",
        questionEn: "q",
        answerZh: "a",
        answerEn: "a",
        keywordsZh: [],
        keywordsEn: [],
        ctaKey: null,
        sensitive: false,
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("faqEntryIdSchema requires a uuid", () => {
    expect(() => faqEntryIdSchema.parse("11111111-1111-4111-8111-111111111111")).not.toThrow();
    expect(() => faqEntryIdSchema.parse("not-a-uuid")).toThrow();
  });

  test("deactivateFaqEntrySchema requires an id", () => {
    expect(() =>
      deactivateFaqEntrySchema.parse({ id: "11111111-1111-4111-8111-111111111111" }),
    ).not.toThrow();
    expect(() => deactivateFaqEntrySchema.parse({})).toThrow();
  });

  test("FAQ_CTA_OPTIONS has exactly the 10 keys seeded in the migration, each with a bilingual label", () => {
    const keys = FAQ_CTA_OPTIONS.map((option) => option.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "view_sponsor_animals",
        "start_sponsorship_pledge",
        "start_adoption_application",
        "browse_adoption_animals",
        "open_donation_for_receipt",
        "contact_for_receipt",
        "view_donation_methods",
        "donation_purpose_cta",
        "open_contact_section",
        "contact_for_private_case",
      ]),
    );
    for (const option of FAQ_CTA_OPTIONS) {
      expect(option.href.length).toBeGreaterThan(0);
      expect(option.label["zh-HK"].length).toBeGreaterThan(0);
      expect(option.label.en.length).toBeGreaterThan(0);
      expect(option.analyticsAction.length).toBeGreaterThan(0);
    }
  });

  test("resolveFaqCta(null) returns undefined (no CTA configured)", () => {
    expect(resolveFaqCta(null)).toBeUndefined();
  });

  test("resolveFaqCta gracefully degrades to undefined for a stale/removed cta_key", () => {
    expect(resolveFaqCta("stale_removed_key")).toBeUndefined();
  });

  test("resolveFaqCta resolves a known key to its CTA, without leaking the internal key field", () => {
    const result = resolveFaqCta("view_sponsor_animals");
    expect(result).toEqual({
      href: "/sponsors",
      label: { "zh-HK": "查看可助養動物", en: "View sponsor animals" },
      analyticsAction: "view_sponsor_animals",
    });
    expect("key" in result!).toBe(false);
  });

  test("rejects keywordsZh containing an empty or whitespace-only string", () => {
    const base = {
      category: "sponsorship" as const,
      questionZh: "q",
      questionEn: "q",
      answerZh: "a",
      answerEn: "a",
      keywordsEn: [],
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
    };
    expect(() => upsertFaqEntrySchema.parse({ ...base, keywordsZh: [""] })).toThrow();
    expect(() => upsertFaqEntrySchema.parse({ ...base, keywordsZh: ["  "] })).toThrow();
  });

  test("accepts a questionZh of exactly 300 chars, rejects 301", () => {
    const base = {
      category: "sponsorship" as const,
      questionEn: "q",
      answerZh: "a",
      answerEn: "a",
      keywordsZh: [],
      keywordsEn: [],
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
    };
    expect(() =>
      upsertFaqEntrySchema.parse({ ...base, questionZh: "x".repeat(300) }),
    ).not.toThrow();
    expect(() => upsertFaqEntrySchema.parse({ ...base, questionZh: "x".repeat(301) })).toThrow();
  });

  test("accepts an answerZh of exactly 4000 chars, rejects 4001", () => {
    const base = {
      category: "sponsorship" as const,
      questionZh: "q",
      questionEn: "q",
      answerEn: "a",
      keywordsZh: [],
      keywordsEn: [],
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
    };
    expect(() => upsertFaqEntrySchema.parse({ ...base, answerZh: "x".repeat(4000) })).not.toThrow();
    expect(() => upsertFaqEntrySchema.parse({ ...base, answerZh: "x".repeat(4001) })).toThrow();
  });
});
