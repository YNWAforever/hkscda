export type FaqLanguage = "zh-HK" | "en";
export type BilingualText = Record<FaqLanguage, string>;

export type FaqCategory = "sponsorship" | "adoption" | "tax_receipt" | "donation" | "contact";

export type FaqCta = {
  href: string;
  label: BilingualText;
  analyticsAction: string;
  external?: boolean;
};

export type FaqEntry = {
  id: string;
  category: FaqCategory;
  question: BilingualText;
  answer: BilingualText;
  keywords: Record<FaqLanguage, string[]>;
  ctaKey: string | null;
  sensitive: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FaqEntryInput = {
  id?: string;
  category: FaqCategory;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  keywordsZh: string[];
  keywordsEn: string[];
  ctaKey: string | null;
  sensitive: boolean;
  sortOrder: number;
  isActive: boolean;
};

// Public-shaped FAQ, matching what searchHelpFaqs and the FAQ UI components
// consume — same shape src/lib/help/faq.ts's HelpFaq had before this migration.
export type HelpFaq = {
  id: string;
  category: FaqCategory;
  question: BilingualText;
  answer: BilingualText;
  keywords: Record<FaqLanguage, string[]>;
  cta?: FaqCta;
  sensitive?: boolean;
};

export type FaqAuditLog = {
  actor_user_id: string;
  action: "faq_entry.create" | "faq_entry.update" | "faq_entry.deactivate";
  entity: "faq_entry";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export interface FaqRepository {
  listPublic(): Promise<HelpFaq[]>;
  listAdmin(): Promise<FaqEntry[]>;
  upsert(input: FaqEntryInput, actorUserId: string): Promise<FaqEntry>;
  deactivate(id: string, actorUserId: string): Promise<void>;
}
