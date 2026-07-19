export type DocumentKind = "annual_report" | "wedding_form" | "adoption_guide";

export type DocumentLanguage = "zh-HK" | "en" | "bilingual";

export type DocumentAsset = {
  id: string;
  kind: DocumentKind;
  title: string;
  language: DocumentLanguage;
  bucketName: string;
  objectPath: string;
  fileUrl: string | null;
  mimeType: "application/pdf";
  byteSize: number;
  checksumSha256: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AnnualReport = {
  id: string;
  title: string;
  yearLabel: string;
  document: DocumentAsset;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentSlot = {
  id: string;
  slotKey: string;
  language: "zh-HK" | "en";
  document: DocumentAsset;
  isPublished: boolean;
};
