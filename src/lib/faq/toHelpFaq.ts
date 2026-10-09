import { resolveFaqCta } from "./schemas";
import type { FaqEntry, HelpFaq } from "./types";

// The public-shaped FAQ the help search runs over. It lives apart from the
// server-only repository so the admin answer tester can build the same shape
// in the browser.
export function toHelpFaq(entry: FaqEntry): HelpFaq {
  return {
    id: entry.id,
    category: entry.category,
    question: entry.question,
    answer: entry.answer,
    keywords: entry.keywords,
    cta: resolveFaqCta(entry.ctaKey),
    sensitive: entry.sensitive,
  };
}
