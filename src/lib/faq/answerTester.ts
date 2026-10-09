import { toHelpFaq } from "./toHelpFaq";
import type { FaqEntry, FaqEntryInput, HelpFaq } from "./types";

// A draft that has never been saved has no id. This one stands in for it inside
// the tester only; it is never sent anywhere.
const UNSAVED_DRAFT_ID = "draft";

// The open draft shaped like a stored entry, so it goes through the same
// `toHelpFaq` as every published FAQ. The timestamps never reach the search.
function draftAsEntry(draft: FaqEntryInput): FaqEntry {
  return {
    id: draft.id ?? UNSAVED_DRAFT_ID,
    category: draft.category,
    question: { "zh-HK": draft.questionZh, en: draft.questionEn },
    answer: { "zh-HK": draft.answerZh, en: draft.answerEn },
    keywords: { "zh-HK": draft.keywordsZh, en: draft.keywordsEn },
    ctaKey: draft.ctaKey,
    sensitive: draft.sensitive,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * The FAQs the answer tester searches: the active entries, as the public help
 * search sees them, with the open draft applied as though it were saved. A draft
 * that edits an existing entry replaces it; a new draft is added.
 *
 * A draft set to hidden is still included so staff can see how it would match,
 * and `draftHidden` tells the tester to warn that visitors will not see it yet.
 */
export function buildTesterFaqs(
  entries: FaqEntry[],
  draft: FaqEntryInput | null,
): { faqs: HelpFaq[]; draftHidden: boolean } {
  const published = entries.filter((entry) => entry.isActive).map(toHelpFaq);
  if (!draft) return { faqs: published, draftHidden: false };

  const draftFaq = toHelpFaq(draftAsEntry(draft));
  const replacesPublished = published.some((faq) => faq.id === draftFaq.id);
  const faqs = replacesPublished
    ? published.map((faq) => (faq.id === draftFaq.id ? draftFaq : faq))
    : [...published, draftFaq];

  return { faqs, draftHidden: !draft.isActive };
}
