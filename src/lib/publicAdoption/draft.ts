import { pickDraftFields } from "../forms/localDraft";

export const ADOPTION_DRAFT_STORAGE_KEY = "hkscda-adoption-application-draft-v1";

function stripFiles(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => !(item instanceof File)).map(stripFiles);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => key !== "photos" && !(item instanceof File))
        .map(([key, item]) => [key, stripFiles(item)]),
    );
  }
  return value;
}

export function serializeDraft(value: unknown) {
  return JSON.stringify(stripFiles(value));
}

export function parseDraft(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function pickAdoptionDraftData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const form = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (form.language === "en" || form.language === "zh-HK") result.language = form.language;
  const groups = {
    contact: [
      "applicantName",
      "phone",
      "email",
      "address",
      "preferredContactMethod",
      "householdSize",
    ],
    home: [
      "housingType",
      "landlordRestrictions",
      "windowDoorSafety",
      "indoorSpaceNotes",
      "homeModificationsPossible",
    ],
    readiness: [
      "currentPets",
      "petCareExperience",
      "householdAgreement",
      "dailySchedule",
      "monthlyBudgetHkd",
      "emergencyCarePlan",
      "reason",
    ],
    visit: ["dateRangeStart", "dateRangeEnd", "dogTimeWindows", "catTimeWindows", "notes"],
  } as const;
  for (const [group, fields] of Object.entries(groups)) {
    const picked = pickDraftFields(form[group], fields);
    if (Object.keys(picked).length > 0) result[group] = picked;
  }
  return result;
}
