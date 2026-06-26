export type CoordinatorStatusCategory =
  | "adoption_case"
  | "animal_lifecycle"
  | "match"
  | "followup"
  | "final_outcome";

export type CoordinatorStatus = {
  id: string;
  category: CoordinatorStatusCategory;
  key: string;
  labelZh: string;
  labelEn: string;
  sortOrder: number;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  isClosing: boolean;
  isFinal: boolean;
};

export type AdoptionCaseSummary = {
  id: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string | null;
  animalType: string;
  requestedAnimalName: string | null;
  status: CoordinatorStatus;
  createdAt: string;
  closedAt: string | null;
};

export type AdoptionCaseDetail = AdoptionCaseSummary & {
  applicantAddress: string | null;
  housingType: string | null;
  familySize: number | null;
  existingPets: string | null;
  reason: string | null;
  supporterId: string | null;
  adopterProfileId: string | null;
  assessment: Record<string, unknown>;
  preferences: Record<string, unknown>;
  matches: AnimalMatchSummary[];
  followups: AdoptionFollowup[];
  successfulAdoption: SuccessfulAdoption | null;
};

export type AnimalMatchSummary = {
  id: string;
  animalId: string;
  animalName: string;
  status: CoordinatorStatus;
  isApproved: boolean;
  notes: string | null;
};

export type AdoptionFollowup = {
  id: string;
  title: string;
  status: CoordinatorStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  volunteer: string | null;
  remarks: string | null;
};

export type SuccessfulAdoption = {
  id: string;
  caseNumber: string;
  animalId: string;
  supporterId: string;
  adopterProfileId: string;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};
