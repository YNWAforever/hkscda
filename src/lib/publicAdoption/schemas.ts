import { z } from "zod";

import {
  CAT_VISIT_WINDOWS,
  DOG_VISIT_WINDOWS,
  VISIT_WINDOWS,
  normalizeVisitWindows,
} from "./visitWindows";

export const ADOPTION_TERMS_VERSION = "adoption-terms-2026-07";
export const MAX_ADOPTION_PREFERENCES = 3;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const trimmed = z.string().trim();
const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

export const languageSchema = z.enum(["zh-HK", "en"]);
export const adoptionAnimalTypeSchema = z.enum(["cat", "dog"]);
export const preferredContactMethodSchema = z.enum(["phone", "whatsapp", "email"]);
export const housingTypeSchema = z.enum(["私人樓宇", "居屋", "公屋", "村屋", "其他"]);
export const visitWindowSchema = z.enum(VISIT_WINDOWS);
export const dogVisitWindowSchema = z.enum(DOG_VISIT_WINDOWS);
export const catVisitWindowSchema = z.enum(CAT_VISIT_WINDOWS);
export const photoCategorySchema = z.enum(["home", "window", "living"]);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDate = trimmed.refine(isIsoDate, "Invalid date");

export const animalPreferenceSchema = z.object({
  rank: z.number().int().min(1).max(MAX_ADOPTION_PREFERENCES),
  animalId: z.string().uuid(),
  animalName: trimmed.min(1),
  animalType: adoptionAnimalTypeSchema,
});

export const expandedAdoptionApplicationSchema = z
  .object({
    language: languageSchema,
    animalPreferences: z.array(animalPreferenceSchema).min(1).max(MAX_ADOPTION_PREFERENCES),
    contact: z.object({
      applicantName: trimmed.min(1),
      phone: trimmed.min(8),
      email: trimmed.email(),
      address: trimmed.min(5),
      preferredContactMethod: preferredContactMethodSchema,
      householdSize: z.number().int().positive().optional(),
    }),
    home: z.object({
      housingType: housingTypeSchema,
      landlordRestrictions: optionalTrimmed,
      windowDoorSafety: trimmed.min(1),
      indoorSpaceNotes: optionalTrimmed,
      homeModificationsPossible: z
        .boolean()
        .nullable()
        .optional()
        .transform((value) => value ?? null),
    }),
    readiness: z.object({
      currentPets: optionalTrimmed,
      petCareExperience: optionalTrimmed,
      householdAgreement: trimmed.min(1),
      dailySchedule: trimmed.min(1),
      monthlyBudgetHkd: z.number().int().min(0).optional(),
      emergencyCarePlan: trimmed.min(1),
      reason: trimmed.min(10),
    }),
    visit: z.object({
      dateRangeStart: isoDate,
      dateRangeEnd: isoDate,
      dogTimeWindows: z.array(dogVisitWindowSchema),
      catTimeWindows: z.array(catVisitWindowSchema),
      notes: optionalTrimmed,
    }),
    terms: z.object({
      agreed: z.literal(true),
      version: z.string().min(1).default(ADOPTION_TERMS_VERSION),
    }),
    sourceMetadata: z.record(z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    const ranks = new Set(value.animalPreferences.map((animal) => animal.rank));
    if (ranks.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Animal preference ranks must be unique",
      });
    }

    const animalIds = new Set(value.animalPreferences.map((animal) => animal.animalId));
    if (animalIds.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Each animal can only appear once",
      });
    }

    const selectedSpecies = new Set(value.animalPreferences.map((animal) => animal.animalType));
    const groupedWindows = [
      { species: "dog", key: "dogTimeWindows" },
      { species: "cat", key: "catTimeWindows" },
    ] as const;

    for (const group of groupedWindows) {
      const windows = value.visit[group.key];
      if (selectedSpecies.has(group.species) && windows.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["visit", group.key],
          message: `Select at least one ${group.species} visit window`,
        });
      }
      if (!selectedSpecies.has(group.species) && windows.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["visit", group.key],
          message: `Remove ${group.species} visit windows when that species is not selected`,
        });
      }
    }

    if (value.visit.dateRangeEnd < value.visit.dateRangeStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visit", "dateRangeEnd"],
        message: "Visit end date must be on or after the start date",
      });
    }
  })
  .transform((value) => ({
    ...value,
    animalPreferences: [...value.animalPreferences].sort((left, right) => left.rank - right.rank),
  }));

export type ExpandedAdoptionApplication = z.infer<typeof expandedAdoptionApplicationSchema>;
export type AdoptionPhotoCategory = z.infer<typeof photoCategorySchema>;

export type AdoptionPhotoDescriptor = {
  category: AdoptionPhotoCategory;
  fileName: string;
  mimeType: (typeof PHOTO_MIME_TYPES)[number];
  sizeBytes: number;
};

export function validatePhotoDescriptor(input: {
  category: unknown;
  fileName: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}): AdoptionPhotoDescriptor {
  return z
    .object({
      category: photoCategorySchema,
      fileName: trimmed.min(1).max(180),
      mimeType: z.enum(PHOTO_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
    })
    .parse(input);
}

export function toAdoptionApplicationSummaryInsert(input: ExpandedAdoptionApplication) {
  const firstAnimal = input.animalPreferences[0]!;
  return {
    animal_id: firstAnimal.animalId,
    animal_name: firstAnimal.animalName,
    animal_type: firstAnimal.animalType,
    applicant_name: input.contact.applicantName,
    phone: input.contact.phone,
    email: input.contact.email,
    address: input.contact.address,
    housing_type: input.home.housingType,
    family_size: input.contact.householdSize ?? null,
    existing_pets: input.readiness.currentPets,
    reason: input.readiness.reason,
  };
}

export function toDetailInsert(publicApplicationId: string, input: ExpandedAdoptionApplication) {
  return {
    public_application_id: publicApplicationId,
    language: input.language,
    preferred_contact_method: input.contact.preferredContactMethod,
    household_size: input.contact.householdSize ?? null,
    landlord_restrictions: input.home.landlordRestrictions,
    window_door_safety: input.home.windowDoorSafety,
    indoor_space_notes: input.home.indoorSpaceNotes,
    home_modifications_possible: input.home.homeModificationsPossible,
    current_pets: input.readiness.currentPets,
    pet_care_experience: input.readiness.petCareExperience,
    household_agreement: input.readiness.householdAgreement,
    daily_schedule: input.readiness.dailySchedule,
    monthly_budget_hkd: input.readiness.monthlyBudgetHkd ?? null,
    emergency_care_plan: input.readiness.emergencyCarePlan,
    terms_version: input.terms.version,
    source_metadata: input.sourceMetadata,
    questionnaire: {
      contact: input.contact,
      home: input.home,
      readiness: input.readiness,
    },
  };
}

export function toPreferenceInserts(
  publicApplicationId: string,
  input: ExpandedAdoptionApplication,
) {
  return input.animalPreferences.map((animal) => ({
    public_application_id: publicApplicationId,
    rank: animal.rank,
    animal_id: animal.animalId,
    animal_name_snapshot: animal.animalName,
    animal_type_snapshot: animal.animalType,
  }));
}

export function toVisitPreferenceInsert(
  publicApplicationId: string,
  input: ExpandedAdoptionApplication,
) {
  const species = input.animalPreferences.map((animal) => animal.animalType);
  const windows = normalizeVisitWindows(species, {
    dog: input.visit.dogTimeWindows,
    cat: input.visit.catTimeWindows,
  });
  const selectedWindows = new Set([...windows.dog, ...windows.cat]);

  return {
    public_application_id: publicApplicationId,
    date_range_start: input.visit.dateRangeStart,
    date_range_end: input.visit.dateRangeEnd,
    dog_time_windows: windows.dog,
    cat_time_windows: windows.cat,
    preferred_time_windows: VISIT_WINDOWS.filter((window) => selectedWindows.has(window)),
    notes: input.visit.notes,
  };
}
