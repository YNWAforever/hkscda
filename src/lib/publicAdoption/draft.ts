import { pickDraftFields } from "../forms/localDraft";

export const ADOPTION_DRAFT_STORAGE_KEY = "hkscda-adoption-application-draft-v1";

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
