import type { ConsentStatus } from "../crm/types";

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

export type AdoptionFollowup = CoordinatorTask;

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

export type AdopterCaseHistoryRow = {
  id: string;
  applicantName: string;
  animalType: string;
  status: CoordinatorStatus;
  requestedAnimalName: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type AdopterSuccessfulAdoptionRow = {
  id: string;
  caseNumber: string;
  animalId: string;
  animalName: string | null;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};

export type AdopterLatestCaseSummary = AdopterCaseHistoryRow;

export type AdopterSummary = {
  id: string;
  supporterId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  livingArea: string | null;
  isBlacklisted: boolean;
  openCaseCount: number;
  successfulAdoptionCount: number;
  openTaskCount: number;
  latestCaseAt: string | null;
  latestCase: AdopterLatestCaseSummary | null;
};

export type AdopterDetail = AdopterSummary & {
  nameEnglish: string | null;
  nameChinese: string | null;
  gender: string | null;
  birthday: string | null;
  occupation: string | null;
  facebook: string | null;
  householdSize: string | null;
  monthlyHouseholdIncome: string | null;
  address: string | null;
  floorArea: string | null;
  blacklistReason: string | null;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
  cases: AdopterCaseHistoryRow[];
  successfulAdoptions: AdopterSuccessfulAdoptionRow[];
  tasks: CoordinatorTask[];
};

export type CoordinatorExportKind =
  | "cases"
  | "adopters"
  | "successful-adoptions"
  | "animals"
  | "tasks";

export type CoordinatorExportResult = {
  csv: string;
  rowCount: number;
  filename: string;
};

export type CoordinatorCaseExportRow = {
  caseId: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string | null;
  status: string;
  animalType: string;
  requestedAnimal: string | null;
  adopterProfileId: string | null;
  supporterId: string | null;
  createdAt: string;
  closedAt: string | null;
};

export type CoordinatorAdopterExportRow = {
  adopterProfileId: string;
  supporterId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  livingArea: string | null;
  isBlacklisted: boolean;
  openCaseCount: number;
  successfulAdoptionCount: number;
  openTaskCount: number;
  latestCaseAt: string | null;
};

export type CoordinatorSuccessfulAdoptionExportRow = {
  successfulAdoptionId: string;
  caseId: string;
  caseNumber: string;
  adopterProfileId: string;
  supporterId: string;
  animalId: string;
  animalName: string | null;
  adoptionFeeCents: number | null;
  approvalDate: string;
  pickupDate: string | null;
};

export type CoordinatorAnimalExportRow = {
  animalId: string;
  type: string;
  name: string;
  nameEn: string | null;
  status: string;
  internalCode: string | null;
  currentPosition: string | null;
  arrivalSource: string | null;
  isAdoptable: boolean;
  isInsideSupportPool: boolean;
  adoptedAt: string | null;
  deceasedAt: string | null;
};

export type CoordinatorTaskExportRow = {
  taskId: string;
  title: string;
  status: string;
  priority: CoordinatorTaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  adoptionCaseId: string | null;
  adopterProfileId: string | null;
  animalId: string | null;
  assignedTo: string | null;
  volunteer: string | null;
  contactChannel: CoordinatorTaskContactChannel | null;
  outcome: string | null;
  remarks: string | null;
};
