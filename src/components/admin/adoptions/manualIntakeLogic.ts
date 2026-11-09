import { MANUAL_IDENTITY_SEARCH_MIN_LENGTH } from "../../../lib/adoptions/schemas";
import type {
  CoordinatorStatus,
  CoordinatorTaskContactChannel,
  CoordinatorTaskPriority,
  ManualCaseIdentityCandidate,
} from "../../../lib/adoptions/types";

export type ManualAdopterProfileForm = {
  nameEnglish?: string;
  nameChinese?: string;
  address?: string;
  householdSize?: string;
};

export type ManualSupporterForm = {
  name: string;
  phone: string;
  email?: string;
  language?: "zh-HK" | "en";
};

export type ManualCaseIdentityForm =
  | {
      kind: "existing_adopter";
      adopterProfileId: string;
    }
  | {
      kind: "existing_supporter";
      supporterId: string;
      adopterProfile?: ManualAdopterProfileForm;
    }
  | {
      kind: "new_supporter";
      supporter: ManualSupporterForm;
      adopterProfile?: ManualAdopterProfileForm;
    };

export type ManualCaseForm = {
  initialStatusId: string;
  requestedAnimalId?: string;
  animalType: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail?: string;
  applicantAddress?: string;
  housingType?: string;
  familySize?: string;
  existingPets?: string;
  reason?: string;
  preferenceNotes?: string;
};

export type ManualInitialTaskForm = {
  enabled: boolean;
  statusId: string;
  title: string;
  taskType?: string;
  priority: CoordinatorTaskPriority;
  dueAt?: string;
  assignedTo?: string;
  volunteer?: string;
  contactChannel?: CoordinatorTaskContactChannel | "";
  remarks?: string;
};

export type ManualCasePayloadIdentity =
  | {
      kind: "existing_adopter";
      adopterProfileId: string;
    }
  | {
      kind: "existing_supporter";
      supporterId: string;
      adopterProfile?: ManualAdopterProfilePayload;
    }
  | {
      kind: "new_supporter";
      supporter: {
        name: string;
        phone: string;
        email?: string;
        language: "zh-HK" | "en";
      };
      adopterProfile?: ManualAdopterProfilePayload;
    };

export type ManualAdopterProfilePayload = {
  nameEnglish?: string;
  nameChinese?: string;
  address?: string;
  householdSize?: string;
};

export type ManualCasePayload = {
  identity: ManualCasePayloadIdentity;
  case: {
    initialStatusId: string;
    requestedAnimalId?: string;
    animalType: string;
    applicantName: string;
    applicantPhone: string;
    applicantEmail?: string;
    applicantAddress?: string;
    housingType?: string;
    familySize?: number;
    existingPets?: string;
    reason?: string;
    preferences: {
      notes?: string;
    };
  };
  initialTask?: {
    statusId: string;
    title: string;
    taskType: string;
    priority: CoordinatorTaskPriority;
    dueAt?: string;
    assignedTo?: string;
    volunteer?: string;
    contactChannel?: CoordinatorTaskContactChannel;
    remarks?: string;
  };
};

export type ManualCasePayloadInput = {
  identity: ManualCaseIdentityForm;
  caseForm: ManualCaseForm;
  initialTask?: ManualInitialTaskForm;
};

export type IdentitySearchFilters = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export function trimOrUndefined(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedPage(value: number | undefined) {
  return String(Math.max(1, value || 1));
}

function appendTrimmed(params: URLSearchParams, key: string, value: string | undefined) {
  const trimmed = trimOrUndefined(value);
  if (trimmed) params.set(key, trimmed);
}

function buildAdopterProfilePayload(
  form: ManualAdopterProfileForm | undefined,
): ManualAdopterProfilePayload | undefined {
  const payload: ManualAdopterProfilePayload = {};
  const nameEnglish = trimOrUndefined(form?.nameEnglish);
  const nameChinese = trimOrUndefined(form?.nameChinese);
  const address = trimOrUndefined(form?.address);
  const householdSize = trimOrUndefined(form?.householdSize);

  if (nameEnglish) payload.nameEnglish = nameEnglish;
  if (nameChinese) payload.nameChinese = nameChinese;
  if (address) payload.address = address;
  if (householdSize) payload.householdSize = householdSize;

  return Object.keys(payload).length ? payload : undefined;
}

function buildIdentityPayload(identity: ManualCaseIdentityForm): ManualCasePayloadIdentity {
  if (identity.kind === "existing_adopter") {
    return {
      kind: "existing_adopter",
      adopterProfileId: identity.adopterProfileId.trim(),
    };
  }

  if (identity.kind === "existing_supporter") {
    const adopterProfile = buildAdopterProfilePayload(identity.adopterProfile);
    return {
      kind: "existing_supporter",
      supporterId: identity.supporterId.trim(),
      ...(adopterProfile ? { adopterProfile } : {}),
    };
  }

  const email = trimOrUndefined(identity.supporter.email);
  const adopterProfile = buildAdopterProfilePayload(identity.adopterProfile);

  return {
    kind: "new_supporter",
    supporter: {
      name: identity.supporter.name.trim(),
      phone: identity.supporter.phone.trim(),
      ...(email ? { email } : {}),
      language: identity.supporter.language ?? "zh-HK",
    },
    ...(adopterProfile ? { adopterProfile } : {}),
  };
}

function datetimeLocalToIso(value: string | null | undefined) {
  const trimmed = trimOrUndefined(value);
  if (!trimmed) return undefined;

  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function buildInitialTaskPayload(
  form: ManualInitialTaskForm | undefined,
): ManualCasePayload["initialTask"] {
  if (!form?.enabled) return undefined;

  const payload: NonNullable<ManualCasePayload["initialTask"]> = {
    statusId: form.statusId.trim(),
    title: form.title.trim(),
    taskType: trimOrUndefined(form.taskType) ?? "followup",
    priority: form.priority,
  };
  const dueAt = datetimeLocalToIso(form.dueAt);
  const assignedTo = trimOrUndefined(form.assignedTo);
  const volunteer = trimOrUndefined(form.volunteer);
  const remarks = trimOrUndefined(form.remarks);

  if (dueAt) payload.dueAt = dueAt;
  if (assignedTo) payload.assignedTo = assignedTo;
  if (volunteer) payload.volunteer = volunteer;
  if (form.contactChannel) payload.contactChannel = form.contactChannel;
  if (remarks) payload.remarks = remarks;

  return payload;
}

// A case cannot start closed: the service refuses closing statuses at intake (BUG-41).
export function intakeCaseStatuses(statuses: CoordinatorStatus[] | undefined) {
  return (statuses ?? []).filter((status) => status.isActive && !status.isClosing);
}

/** The server refuses a shorter identity search (BUG-37), so the screen does not send one. */
export function canSearchIdentity(text: string): boolean {
  return text.trim().length >= MANUAL_IDENTITY_SEARCH_MIN_LENGTH;
}

/**
 * The copy for a manual-intake failure the server reports as a structured error code
 * (OPS-04: `supporter_archived`). Returns null for errors without a code this screen
 * translates, so the caller keeps showing the server's own message.
 */
export function codedManualIntakeErrorMessage(
  error: unknown,
  serverErrors: Record<string, string>,
): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" && Object.hasOwn(serverErrors, code) ? serverErrors[code]! : null;
}

/**
 * The contact a chosen identity pre-fills into the case. A supporter who is not an adopter comes
 * back with masked contact details (BUG-37), which must not be saved as the applicant's own.
 */
export function candidateContactPrefill(
  candidate: Pick<ManualCaseIdentityCandidate, "email" | "phone" | "contactMasked">,
): { phone: string; email: string } {
  if (candidate.contactMasked) return { phone: "", email: "" };
  return { phone: candidate.phone ?? "", email: candidate.email ?? "" };
}

export function buildIdentitySearchParams(filters: IdentitySearchFilters) {
  const params = new URLSearchParams();
  appendTrimmed(params, "q", filters.q);
  params.set("page", normalizedPage(filters.page));
  params.set("pageSize", String(Math.max(1, filters.pageSize || 10)));
  return params;
}

export function buildManualCasePayload(input: ManualCasePayloadInput): ManualCasePayload {
  const preferenceNotes = trimOrUndefined(input.caseForm.preferenceNotes);
  const familySize = trimOrUndefined(input.caseForm.familySize);
  const parsedFamilySize = familySize ? Number.parseInt(familySize, 10) : undefined;
  const payload: ManualCasePayload = {
    identity: buildIdentityPayload(input.identity),
    case: {
      initialStatusId: input.caseForm.initialStatusId.trim(),
      animalType: input.caseForm.animalType.trim(),
      applicantName: input.caseForm.applicantName.trim(),
      applicantPhone: input.caseForm.applicantPhone.trim(),
      preferences: preferenceNotes ? { notes: preferenceNotes } : {},
    },
  };
  const requestedAnimalId = trimOrUndefined(input.caseForm.requestedAnimalId);
  const applicantEmail = trimOrUndefined(input.caseForm.applicantEmail);
  const applicantAddress = trimOrUndefined(input.caseForm.applicantAddress);
  const housingType = trimOrUndefined(input.caseForm.housingType);
  const existingPets = trimOrUndefined(input.caseForm.existingPets);
  const reason = trimOrUndefined(input.caseForm.reason);
  const initialTask = buildInitialTaskPayload(input.initialTask);

  if (requestedAnimalId) payload.case.requestedAnimalId = requestedAnimalId;
  if (applicantEmail) payload.case.applicantEmail = applicantEmail;
  if (applicantAddress) payload.case.applicantAddress = applicantAddress;
  if (housingType) payload.case.housingType = housingType;
  if (Number.isFinite(parsedFamilySize)) payload.case.familySize = parsedFamilySize;
  if (existingPets) payload.case.existingPets = existingPets;
  if (reason) payload.case.reason = reason;
  if (initialTask) payload.initialTask = initialTask;

  return payload;
}
