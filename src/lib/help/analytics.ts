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
const hkPhonePattern = /(?:\+?852[\s-]?)?[569]\d{3}[\s-]?\d{4}\b/;
const longNumberPattern = /\b\d[\d\s-]{7,}\d\b/;
const addressPattern =
  /\b(?:address|addr|street|road|rd|avenue|ave|building|unit|flat|floor|estate|district|house|lane|room|block|hk|hong kong|hongkong)\b/i;
const chineseAddressPattern =
  /(?:地址|住址|住處|大廈|屋苑|屋邨|街|道|路|巷|座|樓|室|號|香港|九龍|新界|旺角|中環|灣仔|銅鑼灣|觀塘|深水埗|荃灣|沙田|屯門|元朗|將軍澳|彌敦道)/u;
const referencePattern =
  /\b(?:ref(?:erence)?|txn|transaction|receipt|donation|payment|invoice|order|application)\s*(?:no\.?|num(?:ber)?|id)?\s*[:#]?\s*[A-Za-z0-9-]{6,}\b/i;
const chineseReferencePattern =
  /(?:付款|捐款|收據|申請|領養|助養|交易|參考|單據|個案)\s*(?:編號|號碼|號|id|ref|reference)?\s*[:：#]?\s*[A-Za-z0-9][A-Za-z0-9-]{4,}/iu;
const donationIdPattern = /\bdonation\s*id\s*[:#]?\s*[A-Za-z0-9-]+\b/i;
const uploadedFilePattern =
  /\b[\w,\-. ]+\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|xml|yml|yaml|jpg|jpeg|png|webp|gif)\b/i;
const transcriptPattern =
  /\b(?:conversation|chat|transcript|message\s*history|full\s*transcript)\b/i;
const applicationAnswerPattern =
  /\b(?:application\s*(?:answer|answers|details?)|answer\s*(?:question|questions)|my\s+answers)\b/i;
const englishNamePattern =
  /\b(?:my\s+name\s+is|name\s+is|i\s+am|i'm)\s+[a-z]+(?:[\s-][a-z]+){1,3}\b/i;
const chineseNamePattern =
  /(?:我(?:叫|是)|本人(?:叫|是)|姓名|名字)\s*[:：]?\s*[\p{Script=Han}]{2,5}/u;
const chineseCaseStatusPattern =
  /(?:我的|本人|我想查|查詢|跟進).*(?:申請|進度|狀態|狀況|付款|捐款|收據|個案|編號|號碼)/u;

function hasPersonalData(rawQuery: string): boolean {
  const normalizedQuery = normalizeHelpQuery(rawQuery);
  const lowered = rawQuery.toLowerCase();

  return (
    emailPattern.test(rawQuery) ||
    hkPhonePattern.test(rawQuery) ||
    longNumberPattern.test(rawQuery) ||
    addressPattern.test(normalizedQuery) ||
    chineseAddressPattern.test(rawQuery) ||
    referencePattern.test(rawQuery) ||
    chineseReferencePattern.test(rawQuery) ||
    donationIdPattern.test(normalizedQuery) ||
    uploadedFilePattern.test(rawQuery) ||
    transcriptPattern.test(lowered) ||
    applicationAnswerPattern.test(normalizedQuery) ||
    englishNamePattern.test(lowered) ||
    chineseNamePattern.test(rawQuery) ||
    chineseCaseStatusPattern.test(rawQuery)
  );
}

export function sanitizeHelpQuery(query: string): SanitizedHelpQuery {
  if (!query.trim()) {
    return { redacted: true };
  }

  if (hasPersonalData(query)) {
    return { redacted: true };
  }

  const queryTopic = normalizeHelpQuery(query)
    .replace(/[?!,.:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (!queryTopic) {
    return { redacted: true };
  }

  return { redacted: false, queryTopic };
}

export function trackHelpEvent(action: HelpAnalyticsAction, params: HelpAnalyticsParams = {}) {
  const sanitized = params.query ? sanitizeHelpQuery(params.query) : undefined;
  const pagePath =
    params.pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined);

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
