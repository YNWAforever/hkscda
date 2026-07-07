# AI Customer Service FAQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public HKSCDA intelligent customer service slice as a bilingual fixed-answer FAQ search experience with a bottom-right widget, `/help` page, shared knowledge source, and anonymous privacy-redacted analytics.

**Architecture:** Keep first-release logic client-side and repo-owned. A small `src/lib/help/` module owns FAQ data, search scoring, confidence buckets, and analytics redaction; shared React components render the same results in the floating widget, `/help`, and homepage FAQ.

**Tech Stack:** TypeScript 5.x, React 19, TanStack Start/Router, Tailwind CSS v4, lucide-react, Bun test runner, existing GA4 helper. Spec: `docs/superpowers/specs/2026-07-08-ai-customer-service-design.md`.

## Global Constraints

- No generative AI or model provider setup in this phase.
- FAQ content is version-controlled in the repo, not stored in Supabase.
- Answers are fixed approved copy in `zh-HK` and `en`.
- Chinese copy uses Traditional Chinese for Hong Kong, conversational but professional.
- Tax and receipt answers use careful fixed wording and do not provide personal tax advice.
- Widget and `/help` share the same FAQ data and search logic.
- The widget renders only on public pages, not `/admin`.
- Analytics records anonymous search/click events only.
- Analytics must not send names, phone numbers, emails, postal addresses, payment references, donation IDs, application answers, uploaded file names, uploaded file contents, or full conversation transcripts.
- If a query contains personal data, analytics sends `redacted: true` and omits the raw query.

---

## File Structure

- `src/lib/help/faq.ts` - create. Shared FAQ types, category labels, approved FAQ entries, and lookup helpers.
- `src/lib/help/faq.test.ts` - create. Schema completeness and content safety tests.
- `src/lib/help/search.ts` - create. Query normalization, scoring, result ranking, confidence buckets.
- `src/lib/help/search.test.ts` - create. Search behavior tests for sponsorship, adoption, receipts, donations, contact, and fallback.
- `src/lib/help/analytics.ts` - create. Query privacy redaction and GA4 event wrappers.
- `src/lib/help/analytics.test.ts` - create. Redaction tests for email, phone, references, and ordinary topic queries.
- `src/components/site/help/FaqResultCard.tsx` - create. Shared answer/result card with CTA tracking.
- `src/components/site/help/ContactFallback.tsx` - create. Shared staff contact fallback.
- `src/components/site/help/HelpSearch.tsx` - create. Shared search UI for widget and `/help`.
- `src/components/site/help/HelpWidget.tsx` - create. Floating public widget.
- `src/routes/__root.tsx` - modify. Render `HelpWidget` inside public shell only.
- `src/routes/help.tsx` - create. Full help center route using shared FAQ/search components.
- `src/components/site/FAQ.tsx` - modify. Replace local FAQ array with shared FAQ data.

---

## Task 1: Shared FAQ Data

**Files:**
- Create: `src/lib/help/faq.ts`
- Test: `src/lib/help/faq.test.ts`

**Interfaces:**
- Produces: `HelpLanguage`, `HelpCategory`, `HelpCta`, `HelpFaq`, `helpFaqs`, `helpCategoryLabels`, `getFaqById(id: string): HelpFaq | undefined`, `getFaqsByCategory(category: HelpCategory): HelpFaq[]`, `getFaqText(faq: HelpFaq, language: HelpLanguage)`.
- Consumes: none.

- [ ] **Step 1: Write the failing FAQ schema tests**

Create `src/lib/help/faq.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { getFaqById, getFaqsByCategory, helpCategoryLabels, helpFaqs } from "./faq";

describe("help FAQ data", () => {
  test("has stable unique ids", () => {
    const ids = helpFaqs.map((faq) => faq.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });

  test("has complete bilingual content and keywords", () => {
    for (const faq of helpFaqs) {
      expect(faq.question["zh-HK"].trim().length).toBeGreaterThan(0);
      expect(faq.question.en.trim().length).toBeGreaterThan(0);
      expect(faq.answer["zh-HK"].trim().length).toBeGreaterThan(0);
      expect(faq.answer.en.trim().length).toBeGreaterThan(0);
      expect(faq.keywords["zh-HK"].length).toBeGreaterThanOrEqual(2);
      expect(faq.keywords.en.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("defines labels for every category used by FAQs", () => {
    const categories = new Set(helpFaqs.map((faq) => faq.category));
    for (const category of categories) {
      expect(helpCategoryLabels[category]["zh-HK"]).toBeTruthy();
      expect(helpCategoryLabels[category].en).toBeTruthy();
    }
  });

  test("marks tax and receipt content as sensitive", () => {
    const receiptFaqs = getFaqsByCategory("tax_receipt");
    expect(receiptFaqs.length).toBeGreaterThanOrEqual(2);
    expect(receiptFaqs.every((faq) => faq.sensitive)).toBe(true);
  });

  test("provides useful CTA routes for public next steps", () => {
    expect(getFaqById("sponsorship-start")?.cta?.href).toBe("/sponsors/pledge");
    expect(getFaqById("adoption-apply")?.cta?.href).toBe("/adoption/apply");
    expect(getFaqById("donation-methods")?.cta?.href).toBe("/donate");
    expect(getFaqById("contact-staff")?.cta?.href).toBe("#contact");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/help/faq.test.ts`

Expected: FAIL with module resolution error because `src/lib/help/faq.ts` does not exist.

- [ ] **Step 3: Implement the FAQ module**

Create `src/lib/help/faq.ts`:

```ts
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

export const helpCategoryLabels = {
  sponsorship: { "zh-HK": "助養", en: "Sponsorship" },
  adoption: { "zh-HK": "領養", en: "Adoption" },
  tax_receipt: { "zh-HK": "報稅收據", en: "Tax receipts" },
  donation: { "zh-HK": "捐款", en: "Donations" },
  contact: { "zh-HK": "聯絡職員", en: "Contact staff" },
} satisfies Record<HelpCategory, BilingualText>;

export const helpFaqs = [
  {
    id: "sponsorship-how-it-works",
    category: "sponsorship",
    question: {
      "zh-HK": "助養是怎樣運作？",
      en: "How does sponsorship work?",
    },
    answer: {
      "zh-HK":
        "助養是以每月定額支持動物的食物、醫療和日常照顧。你可以選擇心儀的助養動物和金額，提交資料後，職員會跟進付款及確認安排。",
      en: "Sponsorship is monthly support for an animal's food, medical care, and daily needs. You can choose preferred sponsor animals and a monthly amount, then staff will follow up on payment and confirmation.",
    },
    keywords: {
      "zh-HK": ["助養", "每月", "月捐", "動物", "支持", "費用"],
      en: ["sponsor", "sponsorship", "monthly", "support", "animal", "pledge"],
    },
    cta: {
      href: "/sponsors",
      label: { "zh-HK": "查看可助養動物", en: "View sponsor animals" },
      analyticsAction: "view_sponsor_animals",
    },
  },
  {
    id: "sponsorship-start",
    category: "sponsorship",
    question: {
      "zh-HK": "我想開始助養，下一步怎樣做？",
      en: "I want to start sponsoring. What should I do next?",
    },
    answer: {
      "zh-HK":
        "請先在助養動物頁選擇心儀動物，然後前往助養表格。你可以選擇每月 HK$100、HK$300、HK$500 或自訂金額，提交後會收到參考編號和付款指引。",
      en: "Choose your preferred sponsor animals first, then continue to the sponsorship form. You can select HK$100, HK$300, HK$500, or a custom monthly amount. After submission, you will receive a reference and payment instructions.",
    },
    keywords: {
      "zh-HK": ["開始助養", "助養表格", "付款證明", "參考編號", "HK$100", "HK$300", "HK$500"],
      en: ["start sponsorship", "pledge form", "payment proof", "reference", "HK$100", "HK$300", "HK$500"],
    },
    cta: {
      href: "/sponsors/pledge",
      label: { "zh-HK": "前往助養表格", en: "Go to sponsorship form" },
      analyticsAction: "start_sponsorship_pledge",
    },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: {
      "zh-HK": "我想領養貓狗，應該怎樣申請？",
      en: "How do I apply to adopt a cat or dog?",
    },
    answer: {
      "zh-HK":
        "你可以先瀏覽可領養動物，加入領養清單，再提交領養申請。申請表會詢問住屋、家庭、照顧經驗、探訪時間和相片資料，方便義工了解是否適合配對。",
      en: "Browse adoptable animals, add them to your adoption shortlist, then submit an adoption application. The form asks about your home, household, care experience, visit preferences, and photos so volunteers can assess a suitable match.",
    },
    keywords: {
      "zh-HK": ["領養", "申請", "貓", "狗", "領養清單", "表格"],
      en: ["adopt", "adoption", "apply", "cat", "dog", "shortlist", "application"],
    },
    cta: {
      href: "/adoption/apply",
      label: { "zh-HK": "前往領養申請", en: "Go to adoption application" },
      analyticsAction: "start_adoption_application",
    },
  },
  {
    id: "adoption-preparation",
    category: "adoption",
    question: {
      "zh-HK": "領養前需要準備甚麼？",
      en: "What should I prepare before adopting?",
    },
    answer: {
      "zh-HK":
        "請準備家居安全資料，例如窗戶和門口安全、居住環境相片、現有寵物情況、家庭成員共識、日常照顧安排和預算。職員會按動物需要與你跟進。",
      en: "Prepare information about home safety, such as windows and doors, photos of the living environment, current pets, household agreement, daily care arrangements, and care budget. Staff will follow up based on each animal's needs.",
    },
    keywords: {
      "zh-HK": ["準備", "家居安全", "窗網", "相片", "探訪", "照顧"],
      en: ["prepare", "home safety", "windows", "photos", "visit", "care"],
    },
    cta: {
      href: "/animals/cat",
      label: { "zh-HK": "瀏覽可領養動物", en: "Browse adoptable animals" },
      analyticsAction: "browse_adoption_animals",
    },
  },
  {
    id: "tax-receipt-eligibility",
    category: "tax_receipt",
    question: {
      "zh-HK": "捐款可以申請報稅收據嗎？",
      en: "Can I request a tax receipt for my donation?",
    },
    answer: {
      "zh-HK":
        "HKSCDA 為認可慈善機構。一般而言，HK$100 或以上捐款可按流程申請 IRD 第 88 條慈善捐款收據。此客服只提供收據流程資料，不能提供個人稅務建議。",
      en: "HKSCDA is an approved charitable institution. In general, donations of HK$100 or above can request an IRD Section 88 charitable donation receipt through the receipt process. This help assistant only explains the receipt process and cannot provide personal tax advice.",
    },
    keywords: {
      "zh-HK": ["報稅", "收據", "IRD", "第88條", "慈善", "HK$100", "免稅"],
      en: ["tax", "receipt", "IRD", "Section 88", "charity", "HK$100", "deduction"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "前往捐款頁", en: "Go to donation page" },
      analyticsAction: "open_donation_for_receipt",
    },
    sensitive: true,
  },
  {
    id: "tax-receipt-request",
    category: "tax_receipt",
    question: {
      "zh-HK": "我已經捐款，怎樣補領收據？",
      en: "I already donated. How can I request a receipt?",
    },
    answer: {
      "zh-HK":
        "如你已完成捐款並需要收據，請透過捐款頁或聯絡職員提供所需資料。請勿在客服輸入付款參考、電話、地址或個人資料；請改用正式表格或職員指定渠道提交。",
      en: "If you have completed a donation and need a receipt, use the donation page or contact staff with the required details. Please do not enter payment references, phone numbers, addresses, or personal details into this help assistant; use the official form or staff-provided channel instead.",
    },
    keywords: {
      "zh-HK": ["補領", "收據", "已捐款", "付款", "參考編號", "職員"],
      en: ["request receipt", "already donated", "payment", "reference", "staff", "receipt"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "聯絡職員跟進", en: "Contact staff" },
      analyticsAction: "contact_for_receipt",
    },
    sensitive: true,
  },
  {
    id: "donation-methods",
    category: "donation",
    question: {
      "zh-HK": "可以用甚麼方法捐款？",
      en: "What donation methods are available?",
    },
    answer: {
      "zh-HK":
        "網站捐款頁會列出可用方法，例如信用卡或電子付款，以及手動付款方式如 FPS、PayMe、PayPal 或其他指定方法。請以捐款頁顯示的最新資料為準。",
      en: "The donation page lists available options such as card or online payment, plus manual methods like FPS, PayMe, PayPal, or other listed methods. Please follow the latest details shown on the donation page.",
    },
    keywords: {
      "zh-HK": ["捐款", "FPS", "PayMe", "PayPal", "信用卡", "Alipay", "方法"],
      en: ["donate", "FPS", "PayMe", "PayPal", "card", "Alipay", "method"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "查看捐款方法", en: "View donation methods" },
      analyticsAction: "view_donation_methods",
    },
  },
  {
    id: "donation-purpose",
    category: "donation",
    question: {
      "zh-HK": "捐款會用於甚麼用途？",
      en: "What will my donation support?",
    },
    answer: {
      "zh-HK":
        "捐款會支援動物糧食、醫療、絕育、救援、領養配對和日常照顧等工作。你可在捐款時選擇一般用途、醫療或助養相關用途。",
      en: "Donations support food, medical care, desexing, rescue, adoption matching, and daily care. You can choose a purpose such as general support, medical care, or sponsorship-related support when donating.",
    },
    keywords: {
      "zh-HK": ["用途", "醫療", "糧食", "絕育", "救援", "助養"],
      en: ["purpose", "medical", "food", "desexing", "rescue", "sponsor"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "支持 HKSCDA", en: "Support HKSCDA" },
      analyticsAction: "donation_purpose_cta",
    },
  },
  {
    id: "contact-staff",
    category: "contact",
    question: {
      "zh-HK": "我想聯絡職員，應該怎樣做？",
      en: "How can I contact staff?",
    },
    answer: {
      "zh-HK":
        "你可以透過 WhatsApp / 電話 9864 1089 或電郵 info@hkscda.com 聯絡 HKSCDA。若問題涉及個人資料、付款、收據或申請狀態，請直接聯絡職員處理。",
      en: "You can contact HKSCDA by WhatsApp / phone at 9864 1089 or email info@hkscda.com. For personal data, payment, receipt, or application-status questions, please contact staff directly.",
    },
    keywords: {
      "zh-HK": ["聯絡", "WhatsApp", "電話", "電郵", "職員", "查詢"],
      en: ["contact", "WhatsApp", "phone", "email", "staff", "enquiry"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "查看聯絡方法", en: "View contact details" },
      analyticsAction: "open_contact_section",
    },
  },
  {
    id: "privacy-do-not-enter-personal-data",
    category: "contact",
    question: {
      "zh-HK": "我可以在客服輸入個人資料嗎？",
      en: "Can I enter personal details in the help assistant?",
    },
    answer: {
      "zh-HK":
        "請不要在客服輸入姓名、電話、地址、付款參考、申請答案或上載檔案內容。這個客服只用來找 FAQ 和下一步連結；涉及個人個案請使用正式表格或直接聯絡職員。",
      en: "Please do not enter names, phone numbers, addresses, payment references, application answers, or uploaded-file details into this help assistant. It is only for finding FAQs and next-step links; use official forms or contact staff for personal cases.",
    },
    keywords: {
      "zh-HK": ["私隱", "個人資料", "電話", "地址", "付款參考", "申請"],
      en: ["privacy", "personal data", "phone", "address", "payment reference", "application"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "聯絡職員", en: "Contact staff" },
      analyticsAction: "contact_for_private_case",
    },
    sensitive: true,
  },
] satisfies HelpFaq[];

export function getFaqById(id: string): HelpFaq | undefined {
  return helpFaqs.find((faq) => faq.id === id);
}

export function getFaqsByCategory(category: HelpCategory): HelpFaq[] {
  return helpFaqs.filter((faq) => faq.category === category);
}

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
```

- [ ] **Step 4: Run the FAQ tests**

Run: `bun test src/lib/help/faq.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/faq.ts src/lib/help/faq.test.ts
git commit -m "feat: add shared help FAQ content"
```

---

## Task 2: Search Scoring And Confidence Buckets

**Files:**
- Create: `src/lib/help/search.ts`
- Test: `src/lib/help/search.test.ts`

**Interfaces:**
- Consumes: `helpFaqs`, `HelpLanguage`, `HelpCategory`, `HelpFaq`.
- Produces: `HelpSearchConfidence`, `HelpSearchResult`, `HelpSearchResponse`, `normalizeHelpQuery(query: string): string`, `searchHelpFaqs(query: string, options?: HelpSearchOptions): HelpSearchResponse`.

- [ ] **Step 1: Write the failing search tests**

Create `src/lib/help/search.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { normalizeHelpQuery, searchHelpFaqs } from "./search";

describe("help FAQ search", () => {
  test("normalizes English and whitespace without stripping Chinese", () => {
    expect(normalizeHelpQuery("  TAX   Receipt!!  ")).toBe("tax receipt");
    expect(normalizeHelpQuery("  報稅 收據  ")).toBe("報稅 收據");
  });

  test("finds sponsorship questions in Chinese", () => {
    const result = searchHelpFaqs("我想助養一隻貓", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("sponsorship");
  });

  test("finds adoption questions in English", () => {
    const result = searchHelpFaqs("how do I apply to adopt a dog", { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("adoption-apply");
  });

  test("finds tax receipt questions and keeps them sensitive", () => {
    const result = searchHelpFaqs("報稅收據 IRD 88", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.category).toBe("tax_receipt");
    expect(result.results[0]?.faq.sensitive).toBe(true);
  });

  test("finds donation method questions", () => {
    const result = searchHelpFaqs("FPS PayMe 捐款", { language: "zh-HK" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("donation-methods");
  });

  test("finds contact fallback questions", () => {
    const result = searchHelpFaqs("WhatsApp phone staff", { language: "en" });
    expect(result.confidence).toBe("high");
    expect(result.results[0]?.faq.id).toBe("contact-staff");
  });

  test("returns none for unrelated queries", () => {
    const result = searchHelpFaqs("parking discount coupon", { language: "en" });
    expect(result.confidence).toBe("none");
    expect(result.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/help/search.test.ts`

Expected: FAIL with module resolution error because `src/lib/help/search.ts` does not exist.

- [ ] **Step 3: Implement search logic**

Create `src/lib/help/search.ts`:

```ts
import {
  helpCategoryLabels,
  helpFaqs,
  type HelpCategory,
  type HelpFaq,
  type HelpLanguage,
} from "./faq";

export type HelpSearchConfidence = "high" | "medium" | "low" | "none";

export type HelpSearchResult = {
  faq: HelpFaq;
  score: number;
  matchedFields: string[];
};

export type HelpSearchResponse = {
  query: string;
  normalizedQuery: string;
  confidence: HelpSearchConfidence;
  results: HelpSearchResult[];
};

export type HelpSearchOptions = {
  language?: HelpLanguage;
  limit?: number;
  category?: HelpCategory;
};

const punctuationPattern = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~，。！？、；：「」『』（）【】《》]/g;

export function normalizeHelpQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .replace(punctuationPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalizedQuery: string): string[] {
  if (!normalizedQuery) return [];
  const whitespaceTokens = normalizedQuery.split(" ").filter(Boolean);
  const compact = normalizedQuery.replace(/\s+/g, "");
  return Array.from(new Set([normalizedQuery, compact, ...whitespaceTokens].filter(Boolean)));
}

function includesNormalized(haystack: string, needle: string): boolean {
  return normalizeHelpQuery(haystack).includes(needle);
}

function scoreText(
  haystack: string,
  query: string,
  tokens: string[],
  exactWeight: number,
  tokenWeight: number,
): number {
  const normalizedHaystack = normalizeHelpQuery(haystack);
  let score = 0;

  if (query && normalizedHaystack.includes(query)) {
    score += exactWeight;
  }

  for (const token of tokens) {
    if (token.length >= 2 && normalizedHaystack.includes(token)) {
      score += tokenWeight;
    }
  }

  return score;
}

function scoreFaq(faq: HelpFaq, query: string, tokens: string[], language: HelpLanguage) {
  let score = 0;
  const matchedFields: string[] = [];
  const alternateLanguage: HelpLanguage = language === "zh-HK" ? "en" : "zh-HK";

  const questionScore =
    scoreText(faq.question[language], query, tokens, 55, 12) +
    scoreText(faq.question[alternateLanguage], query, tokens, 30, 6);
  if (questionScore > 0) {
    matchedFields.push("question");
    score += questionScore;
  }

  const keywordScore = [...faq.keywords[language], ...faq.keywords[alternateLanguage]].reduce(
    (total, keyword) => {
      const normalizedKeyword = normalizeHelpQuery(keyword);
      if (normalizedKeyword && query.includes(normalizedKeyword)) return total + 45;
      if (normalizedKeyword && includesNormalized(query, normalizedKeyword)) return total + 25;
      return tokens.some((token) => token.length >= 2 && normalizedKeyword.includes(token))
        ? total + 14
        : total;
    },
    0,
  );
  if (keywordScore > 0) {
    matchedFields.push("keywords");
    score += keywordScore;
  }

  const categoryLabel = `${helpCategoryLabels[faq.category][language]} ${
    helpCategoryLabels[faq.category][alternateLanguage]
  }`;
  const categoryScore = scoreText(categoryLabel, query, tokens, 35, 10);
  if (categoryScore > 0) {
    matchedFields.push("category");
    score += categoryScore;
  }

  const answerScore = scoreText(faq.answer[language], query, tokens, 12, 2);
  if (answerScore > 0) {
    matchedFields.push("answer");
    score += answerScore;
  }

  return { score, matchedFields };
}

function confidenceFor(score: number): HelpSearchConfidence {
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  if (score > 0) return "low";
  return "none";
}

export function searchHelpFaqs(
  query: string,
  { language = "zh-HK", limit = 3, category }: HelpSearchOptions = {},
): HelpSearchResponse {
  const normalizedQuery = normalizeHelpQuery(query);
  const tokens = tokenize(normalizedQuery);

  if (!normalizedQuery) {
    return { query, normalizedQuery, confidence: "none", results: [] };
  }

  const candidates = category ? helpFaqs.filter((faq) => faq.category === category) : helpFaqs;
  const results = candidates
    .map((faq) => {
      const scored = scoreFaq(faq, normalizedQuery, tokens, language);
      return { faq, score: scored.score, matchedFields: scored.matchedFields };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.faq.id.localeCompare(right.faq.id))
    .slice(0, limit);

  const topScore = results[0]?.score ?? 0;

  return {
    query,
    normalizedQuery,
    confidence: confidenceFor(topScore),
    results,
  };
}
```

- [ ] **Step 4: Run the search tests**

Run: `bun test src/lib/help/search.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/search.ts src/lib/help/search.test.ts
git commit -m "feat: add help FAQ search scoring"
```

---

## Task 3: Analytics Redaction

**Files:**
- Create: `src/lib/help/analytics.ts`
- Test: `src/lib/help/analytics.test.ts`

**Interfaces:**
- Consumes: `gtagEvent` from `src/lib/analytics.ts`.
- Produces: `sanitizeHelpQuery(query: string): SanitizedHelpQuery`, `trackHelpEvent(action: HelpAnalyticsAction, params?: HelpAnalyticsParams): void`.

- [ ] **Step 1: Write failing redaction tests**

Create `src/lib/help/analytics.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { sanitizeHelpQuery } from "./analytics";

describe("help analytics privacy redaction", () => {
  test("redacts email addresses", () => {
    expect(sanitizeHelpQuery("my email is donor@example.com")).toEqual({ redacted: true });
  });

  test("redacts Hong Kong phone-like numbers", () => {
    expect(sanitizeHelpQuery("please call 9864 1089")).toEqual({ redacted: true });
    expect(sanitizeHelpQuery("+852 9123 4567 receipt")).toEqual({ redacted: true });
  });

  test("redacts long payment or reference-like numbers", () => {
    expect(sanitizeHelpQuery("payment reference 123456789012")).toEqual({ redacted: true });
  });

  test("allows ordinary short topic queries", () => {
    expect(sanitizeHelpQuery("助養 收據")).toEqual({
      redacted: false,
      queryTopic: "助養 收據",
    });
    expect(sanitizeHelpQuery("How to adopt a dog?")).toEqual({
      redacted: false,
      queryTopic: "how to adopt a dog",
    });
  });

  test("caps long non-personal topic queries at 80 characters", () => {
    const result = sanitizeHelpQuery(
      "adoption preparation window safety home visit photos landlord approval and daily care budget",
    );
    expect(result.redacted).toBe(false);
    expect(result.queryTopic?.length).toBeLessThanOrEqual(80);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/help/analytics.test.ts`

Expected: FAIL with module resolution error because `src/lib/help/analytics.ts` does not exist.

- [ ] **Step 3: Implement redaction and event wrapper**

Create `src/lib/help/analytics.ts`:

```ts
import { gtagEvent } from "../analytics";
import { normalizeHelpQuery } from "./search";
import type { HelpCategory, HelpLanguage } from "./faq";
import type { HelpSearchConfidence } from "./search";

export type HelpAnalyticsAction =
  | "help_widget_open"
  | "help_search"
  | "help_result_click"
  | "help_cta_click"
  | "help_contact_fallback";

export type SanitizedHelpQuery =
  | { redacted: true; queryTopic?: never }
  | { redacted: false; queryTopic: string };

export type HelpAnalyticsParams = {
  faqId?: string;
  category?: HelpCategory;
  language?: HelpLanguage;
  resultCount?: number;
  confidenceBucket?: HelpSearchConfidence;
  pagePath?: string;
  query?: string;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const hkPhonePattern = /(?:\+?852[\s-]?)?[569]\d{3}[\s-]?\d{4}/;
const longNumberPattern = /\d(?:[\s-]?\d){7,}/;
const addressMarkerPattern = /(address|地址|住址|flat|floor|room|座|樓|室)/i;

export function sanitizeHelpQuery(query: string): SanitizedHelpQuery {
  if (
    emailPattern.test(query) ||
    hkPhonePattern.test(query) ||
    longNumberPattern.test(query) ||
    addressMarkerPattern.test(query)
  ) {
    return { redacted: true };
  }

  const queryTopic = normalizeHelpQuery(query).slice(0, 80);
  if (!queryTopic) {
    return { redacted: true };
  }

  return { redacted: false, queryTopic };
}

export function trackHelpEvent(action: HelpAnalyticsAction, params: HelpAnalyticsParams = {}) {
  const sanitized = params.query ? sanitizeHelpQuery(params.query) : undefined;
  const pagePath =
    params.pagePath ??
    (typeof window !== "undefined" ? window.location.pathname : undefined);

  gtagEvent(action, {
    faq_id: params.faqId,
    category: params.category,
    language: params.language,
    result_count: params.resultCount,
    confidence_bucket: params.confidenceBucket,
    page_path: pagePath,
    redacted: sanitized?.redacted ?? false,
    query_topic: sanitized && !sanitized.redacted ? sanitized.queryTopic : undefined,
  });
}
```

- [ ] **Step 4: Run analytics tests**

Run: `bun test src/lib/help/analytics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/analytics.ts src/lib/help/analytics.test.ts
git commit -m "feat: add privacy-safe help analytics"
```

---

## Task 4: Shared Help UI Components

**Files:**
- Create: `src/components/site/help/FaqResultCard.tsx`
- Create: `src/components/site/help/ContactFallback.tsx`
- Create: `src/components/site/help/HelpSearch.tsx`

**Interfaces:**
- Consumes: `HelpFaq`, `HelpLanguage`, `HelpCategory`, `helpFaqs`, `helpCategoryLabels`, `getFaqText`, `searchHelpFaqs`, `trackHelpEvent`.
- Produces: `FaqResultCard`, `ContactFallback`, `HelpSearch`.

- [ ] **Step 1: Create `FaqResultCard`**

Create `src/components/site/help/FaqResultCard.tsx`:

```tsx
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

  const ctaClassName =
    "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]";

  function handleCtaClick() {
    trackHelpEvent("help_cta_click", {
      faqId: faq.id,
      category: faq.category,
      language,
    });
  }

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
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
          compact ? "line-clamp-4" : ""
        }`}
      >
        {text.answer}
      </p>
      {cta && (
        <div className="mt-4">
          <a href={cta.href} onClick={handleCtaClick} className={ctaClassName}>
            {cta.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Create `ContactFallback`**

Create `src/components/site/help/ContactFallback.tsx`:

```tsx
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
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-panel)] px-4 py-2 text-xs font-bold text-white"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          WhatsApp 9864 1089
        </a>
        <a
          href="mailto:info@hkscda.com"
          onClick={trackFallback}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-bold text-[var(--color-panel)]"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          info@hkscda.com
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `HelpSearch`**

Create `src/components/site/help/HelpSearch.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  helpCategoryLabels,
  helpFaqs,
  type HelpCategory,
  type HelpLanguage,
} from "../../../lib/help/faq";
import { searchHelpFaqs } from "../../../lib/help/search";
import { trackHelpEvent } from "../../../lib/help/analytics";
import { ContactFallback } from "./ContactFallback";
import { FaqResultCard } from "./FaqResultCard";

const quickTopics: HelpCategory[] = ["sponsorship", "adoption", "tax_receipt", "donation", "contact"];

const popularFaqIds = [
  "sponsorship-start",
  "adoption-apply",
  "tax-receipt-eligibility",
  "donation-methods",
];

const topicPrompts: Record<HelpCategory, Record<HelpLanguage, string>> = {
  sponsorship: { "zh-HK": "助養", en: "sponsorship" },
  adoption: { "zh-HK": "領養", en: "adoption" },
  tax_receipt: { "zh-HK": "報稅收據", en: "tax receipt" },
  donation: { "zh-HK": "捐款方法", en: "donation methods" },
  contact: { "zh-HK": "聯絡職員", en: "contact staff" },
};

export function HelpSearch({
  language,
  compact = false,
  surface,
}: {
  language: HelpLanguage;
  compact?: boolean;
  surface: "widget" | "page";
}) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const resultLimit = compact ? 3 : 8;

  const response = useMemo(
    () => searchHelpFaqs(submittedQuery, { language, limit: resultLimit }),
    [language, resultLimit, submittedQuery],
  );

  const popularFaqs = popularFaqIds
    .map((id) => helpFaqs.find((faq) => faq.id === id))
    .filter((faq): faq is (typeof helpFaqs)[number] => Boolean(faq));

  function runSearch(nextQuery = query) {
    setSubmittedQuery(nextQuery);
    const nextResponse = searchHelpFaqs(nextQuery, { language, limit: resultLimit });
    trackHelpEvent("help_search", {
      language,
      resultCount: nextResponse.results.length,
      confidenceBucket: nextResponse.confidence,
      query: nextQuery,
    });
  }

  function handleTopicClick(category: HelpCategory) {
    const nextQuery = topicPrompts[category][language];
    setQuery(nextQuery);
    runSearch(nextQuery);
  }

  const hasQuery = submittedQuery.trim().length > 0;
  const directResult = response.confidence === "high" ? response.results[0] : undefined;
  const showRelated = hasQuery && !directResult && response.results.length > 0;
  const showFallback = hasQuery && (response.confidence === "low" || response.confidence === "none");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {quickTopics.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => handleTopicClick(category)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-panel)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {helpCategoryLabels[category][language]}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <label className="sr-only" htmlFor={`${surface}-help-query`}>
          {language === "zh-HK" ? "輸入問題" : "Enter your question"}
        </label>
        <input
          id={`${surface}-help-query`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={language === "zh-HK" ? "輸入助養、領養或收據問題" : "Ask about sponsorship, adoption, or receipts"}
          className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        />
        <button
          type="submit"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          aria-label={language === "zh-HK" ? "搜尋" : "Search"}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {!hasQuery && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
              {language === "zh-HK" ? "常見問題" : "Popular questions"}
            </p>
            {popularFaqs.map((faq) => (
              <FaqResultCard key={faq.id} faq={faq} language={language} compact={compact} />
            ))}
          </div>
        )}

        {directResult && (
          <FaqResultCard faq={directResult.faq} language={language} compact={compact} />
        )}

        {showRelated && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-[var(--color-panel)]">
              {language === "zh-HK" ? "可能相關的答案" : "Related answers"}
            </p>
            {response.results.map((result) => (
              <FaqResultCard key={result.faq.id} faq={result.faq} language={language} compact={compact} />
            ))}
          </div>
        )}

        {showFallback && <ContactFallback language={language} query={submittedQuery} />}
      </div>

      <p className="rounded-lg bg-[var(--color-surface-offset)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
        {language === "zh-HK"
          ? "請不要在客服輸入姓名、電話、地址、付款參考、申請答案或上載檔案內容。"
          : "Please do not enter names, phone numbers, addresses, payment references, application answers, or uploaded-file details."}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Lint the new UI files**

Run: `bunx eslint src/components/site/help/FaqResultCard.tsx src/components/site/help/ContactFallback.tsx src/components/site/help/HelpSearch.tsx`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/help/FaqResultCard.tsx src/components/site/help/ContactFallback.tsx src/components/site/help/HelpSearch.tsx
git commit -m "feat: add shared help search UI"
```

---

## Task 5: Floating Public Help Widget

**Files:**
- Create: `src/components/site/help/HelpWidget.tsx`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `HelpSearch`, `trackHelpEvent`, `useShortlist`.
- Produces: public floating widget rendered only in `publicContent`.

- [ ] **Step 1: Create the widget**

Create `src/components/site/help/HelpWidget.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { HelpCircle, MessageCircleQuestion, X } from "lucide-react";

import { trackHelpEvent } from "../../../lib/help/analytics";
import type { HelpLanguage } from "../../../lib/help/faq";
import { useShortlist } from "../ShortlistContext";
import { HelpSearch } from "./HelpSearch";

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<HelpLanguage>("zh-HK");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { items } = useShortlist();
  const raised = items.length > 0;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        trackHelpEvent("help_widget_open", { language });
      }
      return next;
    });
  }

  return (
    <div
      className={`fixed right-3 z-50 sm:right-5 ${
        raised ? "bottom-28" : "bottom-5"
      } transition-[bottom] duration-300`}
    >
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={language === "zh-HK" ? "HKSCDA 小幫手" : "HKSCDA help assistant"}
          className="mb-3 flex max-h-[calc(100vh-8rem)] w-[calc(100vw-1.5rem)] max-w-[390px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-panel"
        >
          <div className="flex items-center justify-between gap-3 bg-[var(--color-panel)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[var(--color-accent-warm)]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-base font-bold">
                  {language === "zh-HK" ? "HKSCDA 小幫手" : "HKSCDA help"}
                </h2>
                <p className="text-xs text-white/70">
                  {language === "zh-HK" ? "助養、領養、捐款及收據" : "Sponsorship, adoption, donations, receipts"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              aria-label={language === "zh-HK" ? "關閉客服" : "Close help"}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex justify-end border-b border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 py-2">
            <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs font-bold">
              {(["zh-HK", "en"] as const).map((nextLanguage) => (
                <button
                  key={nextLanguage}
                  type="button"
                  aria-pressed={language === nextLanguage}
                  onClick={() => setLanguage(nextLanguage)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    language === nextLanguage
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {nextLanguage === "zh-HK" ? "繁" : "EN"}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto p-4">
            <HelpSearch language={language} compact surface="widget" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-panel transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-panel)]"
        aria-label={language === "zh-HK" ? "開啟 HKSCDA 小幫手" : "Open HKSCDA help assistant"}
        aria-expanded={open}
      >
        <MessageCircleQuestion className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Render the widget in the public root shell**

In `src/routes/__root.tsx`, add the import near the other site component imports:

```ts
import { HelpWidget } from "../components/site/help/HelpWidget";
```

Then, in `RootComponent`, update `publicContent` to render the widget after `ShortlistTray`:

```tsx
  const publicContent = (
    <>
      <Header />
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <Footer />
      <ShortlistTray />
      <HelpWidget />
    </>
  );
```

This keeps the widget inside `ShortlistProvider` and out of `/admin`.

- [ ] **Step 3: Lint the widget and root route**

Run: `bunx eslint src/components/site/help/HelpWidget.tsx src/routes/__root.tsx`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/help/HelpWidget.tsx src/routes/__root.tsx
git commit -m "feat: add public help widget"
```

---

## Task 6: `/help` Route

**Files:**
- Create: `src/routes/help.tsx`

**Interfaces:**
- Consumes: `HelpSearch`, `helpCategoryLabels`, `helpFaqs`, `getFaqsByCategory`, `HelpLanguage`.
- Produces: public `/help` route.

- [ ] **Step 1: Create the help page route**

Create `src/routes/help.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HelpCircle, Mail, Smartphone } from "lucide-react";

import { HelpSearch } from "../components/site/help/HelpSearch";
import {
  getFaqsByCategory,
  helpCategoryLabels,
  type HelpCategory,
  type HelpLanguage,
} from "../lib/help/faq";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "常見問題與客服 | HKSCDA" },
      {
        name: "description",
        content:
          "HKSCDA 常見問題中心，解答助養、領養、捐款、報稅收據及聯絡職員問題。",
      },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/help" }],
  }),
  component: HelpPage,
});

const categories: HelpCategory[] = ["sponsorship", "adoption", "tax_receipt", "donation", "contact"];

function HelpPage() {
  const [language, setLanguage] = useState<HelpLanguage>("zh-HK");

  return (
    <main className="bg-[var(--color-background)]">
      <section className="bg-[var(--color-surface-offset)] bg-topo px-6 py-12 lg:py-16">
        <div className="container-wide">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-highlight)] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {language === "zh-HK" ? "常見問題" : "Help center"}
              </div>
              <h1 className="font-display text-4xl font-extrabold leading-tight text-[var(--color-panel)] lg:text-6xl">
                {language === "zh-HK" ? "有問題？先在這裡找答案" : "Find quick answers"}
              </h1>
              <p className="mt-4 max-w-[60ch] text-sm leading-7 text-[var(--color-text-muted)] lg:text-base">
                {language === "zh-HK"
                  ? "搜尋助養、領養、捐款、報稅收據和聯絡方法。涉及個人資料、付款或申請狀態時，請直接聯絡職員。"
                  : "Search sponsorship, adoption, donations, tax receipts, and contact options. For personal data, payment, or application-status questions, contact staff directly."}
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

      <section className="px-6 py-10 lg:py-14">
        <div className="container-wide grid gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-8">
            <div className="card-dashed bg-[var(--color-surface)] p-5 lg:p-6">
              <HelpSearch language={language} surface="page" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {categories.map((category) => (
                <section
                  key={category}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                >
                  <h2 className="font-display text-xl font-bold text-[var(--color-panel)]">
                    {helpCategoryLabels[category][language]}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {language === "zh-HK"
                      ? `${getFaqsByCategory(category).length} 條已審批答案`
                      : `${getFaqsByCategory(category).length} approved answers`}
                  </p>
                </section>
              ))}
            </div>
          </div>

          <aside className="self-start rounded-lg bg-[var(--color-panel)] p-5 text-white">
            <h2 className="font-display text-xl font-bold">
              {language === "zh-HK" ? "需要職員協助？" : "Need staff help?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {language === "zh-HK"
                ? "如問題涉及收據、付款、申請狀態或個人資料，請直接聯絡職員。"
                : "For receipts, payments, application status, or personal data, please contact staff directly."}
            </p>
            <div className="mt-4 space-y-2">
              <a
                href="tel:+85298641089"
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                WhatsApp 9864 1089
              </a>
              <a
                href="mailto:info@hkscda.com"
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                info@hkscda.com
              </a>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Lint the route**

Run: `bunx eslint src/routes/help.tsx`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/help.tsx
git commit -m "feat: add help center route"
```

---

## Task 7: Migrate Homepage FAQ To Shared Data

**Files:**
- Modify: `src/components/site/FAQ.tsx`

**Interfaces:**
- Consumes: `helpFaqs`, `getFaqText`, `FaqResultCard` is not used here because the homepage keeps its existing accordion layout.
- Produces: homepage FAQ section backed by shared approved content.

- [ ] **Step 1: Replace the hardcoded FAQ array and rendering**

Replace the entire contents of `src/components/site/FAQ.tsx` with:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircleQuestion } from "lucide-react";
import dog1 from "@/assets/dog1.jpg";
import { Reveal } from "@/lib/reveal";
import { getFaqText, helpFaqs } from "@/lib/help/faq";

const homepageFaqs = helpFaqs.slice(0, 5);
const language = "zh-HK" as const;

export function FAQ() {
  return (
    <section
      className="bg-[var(--color-surface-offset)] px-6 py-16 lg:py-24"
      aria-labelledby="faq-h"
    >
      <div className="container-wide grid items-start gap-10 lg:grid-cols-5 lg:gap-14">
        <Reveal className="lg:col-span-2">
          <h2
            id="faq-h"
            className="font-display mb-4 text-3xl font-bold leading-tight text-[var(--color-panel)] lg:text-4xl"
          >
            常見問題
            <br />
            助養、領養與收據
          </h2>
          <p className="mb-8 max-w-[40ch] text-[var(--color-text-muted)]">
            如果找不到合適答案，可 WhatsApp 9864 1089 或電郵 info@hkscda.com 聯絡職員。
          </p>
          <div className="relative hidden lg:block">
            <div
              className="arch-mask absolute inset-3 -rotate-3 bg-[var(--color-accent-soft)]"
              aria-hidden="true"
            />
            <img
              src={dog1}
              alt="等待領養的狗狗"
              loading="lazy"
              className="arch-mask relative aspect-[4/3] w-full object-cover shadow-soft"
            />
          </div>
        </Reveal>

        <Reveal className="lg:col-span-3">
          <div className="font-display mb-4 flex items-center gap-2 rounded-[2rem] bg-[var(--color-panel)] px-6 py-4 font-bold text-white">
            <MessageCircleQuestion className="h-5 w-5 text-[var(--color-accent-warm)]" />
            Frequently Asked Questions
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {homepageFaqs.map((faq) => {
              const text = getFaqText(faq, language);
              return (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 transition-shadow data-[state=open]:shadow-md"
                >
                  <AccordionTrigger className="py-4.5 font-bold text-[var(--color-panel)] hover:no-underline">
                    {text.question}
                  </AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-[var(--color-text-muted)]">
                    {text.answer}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Lint the FAQ component**

Run: `bunx eslint src/components/site/FAQ.tsx`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/FAQ.tsx
git commit -m "refactor: share approved FAQ content on homepage"
```

---

## Task 8: Full Verification

**Files:** none.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: verified build and manual acceptance notes.

- [ ] **Step 1: Run all help tests**

Run: `bun test src/lib/help/faq.test.ts src/lib/help/search.test.ts src/lib/help/analytics.test.ts`

Expected: all help tests pass.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`

Expected: all existing and new tests pass.

- [ ] **Step 3: Lint changed files**

Run:

```bash
bunx eslint \
  src/lib/help/faq.ts \
  src/lib/help/faq.test.ts \
  src/lib/help/search.ts \
  src/lib/help/search.test.ts \
  src/lib/help/analytics.ts \
  src/lib/help/analytics.test.ts \
  src/components/site/help/FaqResultCard.tsx \
  src/components/site/help/ContactFallback.tsx \
  src/components/site/help/HelpSearch.tsx \
  src/components/site/help/HelpWidget.tsx \
  src/routes/__root.tsx \
  src/routes/help.tsx \
  src/components/site/FAQ.tsx
```

Expected: clean.

- [ ] **Step 4: Typecheck and build**

Run: `bunx tsc --noEmit`

Expected: no TypeScript errors.

Run: `bun run build`

Expected: production build succeeds and route tree generation includes `/help`.

- [ ] **Step 5: Manual browser verification**

Start the dev server with `bun run dev`, then verify:

- On `/`, the bottom-right help button appears and opens a panel.
- On `/admin`, the help button does not appear.
- On mobile width, add a shortlist item and confirm the help button rises above the shortlist tray.
- In the widget, switching `繁` / `EN` changes questions, answers, and buttons.
- Query `助養` returns a sponsorship answer with a sponsorship CTA.
- Query `領養` returns an adoption answer with an adoption CTA.
- Query `報稅收據` returns a sensitive receipt answer and does not claim to provide personal tax advice.
- Query `FPS PayMe` returns donation methods.
- Query `donor@example.com 9864 1089` can still search locally, but analytics redaction sends `redacted: true` and no `query_topic`.
- `/help` renders search, category cards, and contact staff links.
- Homepage FAQ displays clean Traditional Chinese from shared approved FAQ content.

- [ ] **Step 6: Commit verification fixes**

If verification required code changes, commit them:

```bash
git add src docs
git commit -m "fix: address help FAQ verification findings"
```

If no code changes were needed, no commit is required for this step.

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers repo-owned bilingual fixed FAQ content. Task 2 covers smart search and confidence buckets. Task 3 covers anonymous privacy-redacted analytics. Tasks 4 and 5 cover the public widget. Task 6 covers `/help`. Task 7 prevents homepage FAQ divergence. Task 8 covers tests, build, and manual verification.
- **Out of scope preserved:** No generative AI, no model provider, no Supabase FAQ tables, no admin editing, no internal staff assistant, no conversation logging, and no personal-data collection are included.
- **Type consistency:** `HelpLanguage`, `HelpCategory`, `HelpFaq`, `HelpSearchConfidence`, `searchHelpFaqs`, `sanitizeHelpQuery`, and `trackHelpEvent` are defined once and consumed with identical names in later tasks.
- **Risk checks:** Tax and receipt content is marked `sensitive`; analytics redaction removes phone, email, long number/reference, and address-like queries; widget is public-only because it is rendered only in the public branch of `RootComponent`.
