export interface AdoptionInstructionRule {
  id: string;
  text: string;
}

export interface AdoptionInstructionCareTopic {
  id: string;
  value: string;
  label: string;
  content: string;
}

export interface AdoptionInstructionContent {
  hero: { eyebrow: string; title: string; description: string };
  fees: {
    sectionTitle: string;
    dogTitle: string;
    catTitle: string;
    itemLabel: string;
    amountLabel: string;
    notice: string;
  };
  estates: {
    sectionTitle: string;
    introduction: string;
    estateLabel: string;
    districtLabel: string;
    notesLabel: string;
    emptyState: string;
  };
  guides: {
    sectionTitle: string;
    catTitle: string;
    dogTitle: string;
    generalTitle: string;
    zhHkActionLabel: string;
    enActionLabel: string;
  };
  rules: { title: string; items: AdoptionInstructionRule[] };
  care: {
    cat: { title: string; topics: AdoptionInstructionCareTopic[] };
    dog: { title: string; topics: AdoptionInstructionCareTopic[] };
  };
}

export type AdoptionInstructionRevisionState = "draft" | "published" | "archived";

export interface AdoptionInstructionRevision {
  id: string;
  pageKey: string;
  revisionNumber: number;
  state: AdoptionInstructionRevisionState;
  content: AdoptionInstructionContent;
  sourceRevisionId: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdoptionInstructionPageState {
  pageKey: string;
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
