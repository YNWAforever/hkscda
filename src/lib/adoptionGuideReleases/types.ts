import type { DocumentAsset } from "../documents/types";

export type AdoptionGuideSpecies = "cat" | "dog" | "general";

export type AdoptionGuideAssetVerification = {
  asset: DocumentAsset;
  objectVerified: boolean;
};

export type AdoptionGuideReleaseState = "draft" | "in_review" | "published" | "archived";

export type AdoptionGuideRelease = {
  id: string;
  topic: string;
  species: AdoptionGuideSpecies;
  zhHkAssetId: string | null;
  enAssetId: string | null;
  knowledgePostId: string | null;
  knowledgeTitle: string;
  knowledgeTopic: string;
  knowledgeShortIntro: string;
  knowledgeSourceName: string | null;
  sortOrder: number;
  state: AdoptionGuideReleaseState;
  version: number;
  createdBy: string;
  updatedBy: string;
  submittedBy: string | null;
  submittedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdoptionGuideReadinessIssue = {
  field:
    | "zhHkAssetId"
    | "enAssetId"
    | "knowledgeTitle"
    | "knowledgeTopic"
    | "knowledgeShortIntro"
    | "assets";
  code: string;
  message: string;
};

export type AdoptionGuideReadiness = {
  ready: boolean;
  issues: AdoptionGuideReadinessIssue[];
};

export type AdoptionGuidePreview = {
  release: AdoptionGuideRelease;
  readiness: AdoptionGuideReadiness;
  adoptionPanel: {
    heading: string;
    zhHkUrl: string | null;
    enUrl: string | null;
  };
  knowledgeCard: {
    title: string;
    topic: string;
    shortIntro: string;
    sourceName: string | null;
    zhHkUrl: string | null;
    enUrl: string | null;
  };
};
