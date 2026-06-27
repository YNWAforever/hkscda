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

export type CoordinatorTaskPriority = "low" | "normal" | "high" | "urgent";
export type CoordinatorTaskContactChannel =
  | "phone"
  | "whatsapp"
  | "email"
  | "in_person"
  | "internal";

export type CoordinatorTaskCaseLink = {
  id: string;
  applicantName: string;
  animalType: string;
};

export type CoordinatorTaskAdopterLink = {
  id: string;
  supporterId: string | null;
  displayName: string | null;
  isBlacklisted: boolean;
};

export type CoordinatorTaskAnimalLink = {
  id: string;
  name: string;
  nameEn: string | null;
  type: string;
  status: string;
};

export type CoordinatorTask = {
  id: string;
  title: string;
  status: CoordinatorStatus;
  taskType: string;
  priority: CoordinatorTaskPriority;
  dueAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  assignedTo: string | null;
  volunteer: string | null;
  contactChannel: CoordinatorTaskContactChannel | null;
  outcome: string | null;
  nextStepAt: string | null;
  remarks: string | null;
  hasWindowNet: boolean | null;
  environment: string | null;
  score: string | null;
  createdAt: string;
  updatedAt: string;
  adoptionCase: CoordinatorTaskCaseLink | null;
  adopterProfile: CoordinatorTaskAdopterLink | null;
  animal: CoordinatorTaskAnimalLink | null;
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

export type AdoptionFollowup = Pick<
  CoordinatorTask,
  "id" | "title" | "status" | "scheduledAt" | "completedAt" | "volunteer" | "remarks"
>;

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
