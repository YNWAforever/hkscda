import { helpCategoryLabels, type HelpCategory, type HelpFaq, type HelpLanguage } from "./faq";

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

// `]` and `\` still need their backslashes; `/`, `[` and a trailing `-` are
// literal inside a character class.
const punctuationPattern = /[!"#$%&'()*+,./:;<=>@[\]\\^_`{|}~-]/g;
const staffContactPatterns = [
  /\b(?:my|mine|case|status|progress|update|reference|receipt\s*(?:number|no|id)|payment\s*status|application\s*status|donation\s*id|order\s*id)\b/i,
  /(?:我的|本人|我想查|查詢|跟進).*(?:申請|進度|狀態|狀況|付款|捐款|收據|個案|編號|號碼)/u,
  /(?:申請|付款|捐款|收據|參考|交易|個案).*(?:編號|號碼|進度|狀態|狀況)/u,
  /(?:編號|號碼|參考號|流水號)\s*[a-z0-9][a-z0-9\s-]{4,}/i,
];

export function normalizeHelpQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .replace(punctuationPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function requiresStaffContact(query: string): boolean {
  const normalizedQuery = normalizeHelpQuery(query);
  if (!normalizedQuery) return false;

  return staffContactPatterns.some((pattern) => pattern.test(normalizedQuery));
}

function tokenize(normalizedQuery: string): string[] {
  if (!normalizedQuery) return [];
  const whitespaceTokens = normalizedQuery.split(" ").filter(Boolean);
  const compact = normalizedQuery.replace(/\s+/g, "");
  return Array.from(new Set([normalizedQuery, compact, ...whitespaceTokens]));
}

function isSignificantToken(token: string): boolean {
  if (!token) return false;
  if (/[a-z0-9]/i.test(token)) {
    return token.length >= 2;
  }
  return token.length >= 1;
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
    if (isSignificantToken(token) && normalizedHaystack.includes(token)) {
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
      if (!normalizedKeyword) return total;

      if (query.includes(normalizedKeyword)) return total + 45;
      if (includesNormalized(query, normalizedKeyword)) return total + 25;
      return tokens.some((token) => isSignificantToken(token) && normalizedKeyword.includes(token))
        ? total + 14
        : total;
    },
    0,
  );
  if (keywordScore > 0) {
    matchedFields.push("keywords");
    score += keywordScore;
  }

  const categoryLabel = `${helpCategoryLabels[faq.category][language]} ${helpCategoryLabels[faq.category][alternateLanguage]}`;
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
  faqs: HelpFaq[],
  { language = "zh-HK", limit = 3, category }: HelpSearchOptions = {},
): HelpSearchResponse {
  const normalizedQuery = normalizeHelpQuery(query);
  const tokens = tokenize(normalizedQuery);

  if (!normalizedQuery) {
    return {
      query,
      normalizedQuery,
      confidence: "none",
      results: [],
    };
  }

  const candidates = category ? faqs.filter((faq) => faq.category === category) : faqs;

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
