import { describe, expect, test } from "bun:test";

import {
  expandedAdoptionApplicationSchema,
  photoCategorySchema,
  toAdoptionApplicationSummaryInsert,
  toDetailInsert,
  toPreferenceInserts,
  toVisitPreferenceInsert,
  validatePhotoDescriptor,
} from "./schemas";

const applicationId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const catId = "77777777-8888-4333-8444-555555555555";
const dogId = "66666666-8888-4333-8444-555555555555";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    language: "zh-HK",
    animalPreferences: [
      { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
      { rank: 2, animalId: dogId, animalName: "Lucky", animalType: "dog" },
    ],
    contact: {
      applicantName: "Ada",
      phone: "9123 4567",
      email: "ada@example.com",
      address: "HK Island",
      preferredContactMethod: "whatsapp",
      householdSize: 3,
    },
    home: {
      housingType: "私人樓宇",
      landlordRestrictions: "No pet restrictions",
      windowDoorSafety: "All windows have mesh",
      indoorSpaceNotes: "Quiet living room",
      homeModificationsPossible: true,
    },
    readiness: {
      currentPets: "None",
      petCareExperience: "Grew up with cats",
      householdAgreement: "Everyone agrees",
      dailySchedule: "Home evenings and weekends",
      monthlyBudgetHkd: 1200,
      emergencyCarePlan: "Nearby 24-hour vet",
      reason: "I can provide a safe and stable home.",
    },
    visit: {
      dateRangeStart: "2026-07-10",
      dateRangeEnd: "2026-07-24",
      dogTimeWindows: ["weekend_afternoon"],
      catTimeWindows: ["weekday_evening", "weekend_afternoon"],
      notes: "WhatsApp before visiting",
    },
    terms: {
      agreed: true,
      version: "adoption-terms-2026-07",
    },
    sourceMetadata: {
      shortlistSource: "animal_listing",
    },
    ...overrides,
  };
}

describe("expandedAdoptionApplicationSchema", () => {
  test("accepts the full guided adoption payload", () => {
    const parsed = expandedAdoptionApplicationSchema.parse(validPayload());
    expect(parsed.animalPreferences.map((animal) => animal.rank)).toEqual([1, 2]);
    expect(parsed.contact.email).toBe("ada@example.com");
  });

  test("rejects duplicate ranks and more than three animal preferences", () => {
    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
            { rank: 1, animalId: dogId, animalName: "Lucky", animalType: "dog" },
          ],
        }),
      ),
    ).toThrow("Animal preference ranks must be unique");

    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" },
            { rank: 2, animalId: dogId, animalName: "Lucky", animalType: "dog" },
            {
              rank: 3,
              animalId: "55555555-8888-4333-8444-555555555555",
              animalName: "B",
              animalType: "cat",
            },
            {
              rank: 4,
              animalId: "44444444-8888-4333-8444-555555555555",
              animalName: "C",
              animalType: "dog",
            },
          ],
        }),
      ),
    ).toThrow();
  });

  test("rejects sponsorship animals and invalid visit ranges in Phase 1", () => {
    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          animalPreferences: [
            { rank: 1, animalId: catId, animalName: "Sponsor Cat", animalType: "sponsor" },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      expandedAdoptionApplicationSchema.parse(
        validPayload({
          visit: {
            dateRangeStart: "2026-08-10",
            dateRangeEnd: "2026-08-01",
            dogTimeWindows: ["weekend_afternoon"],
            catTimeWindows: ["weekday_evening"],
            notes: "",
          },
        }),
      ),
    ).toThrow("Visit end date must be on or after the start date");
  });

  test("validates grouped windows for every selected species", () => {
    const dogOnly = validPayload({
      animalPreferences: [{ rank: 1, animalId: dogId, animalName: "Lucky", animalType: "dog" }],
      visit: {
        dateRangeStart: "2026-07-10",
        dateRangeEnd: "2026-07-24",
        dogTimeWindows: ["weekday_afternoon"],
        catTimeWindows: [],
        notes: "",
      },
    });
    expect(expandedAdoptionApplicationSchema.parse(dogOnly).visit).toMatchObject({
      dogTimeWindows: ["weekday_afternoon"],
      catTimeWindows: [],
    });

    expect(() =>
      expandedAdoptionApplicationSchema.parse({
        ...dogOnly,
        visit: { ...dogOnly.visit, dogTimeWindows: [], catTimeWindows: ["weekday_morning"] },
      }),
    ).toThrow();

    expect(() =>
      expandedAdoptionApplicationSchema.parse({
        ...dogOnly,
        visit: { ...dogOnly.visit, dogTimeWindows: ["weekday_morning"] },
      }),
    ).toThrow();

    const catOnly = validPayload({
      animalPreferences: [{ rank: 1, animalId: catId, animalName: "Mochi", animalType: "cat" }],
      visit: {
        dateRangeStart: "2026-07-10",
        dateRangeEnd: "2026-07-24",
        dogTimeWindows: [],
        catTimeWindows: ["weekday_morning"],
        notes: "",
      },
    });
    expect(expandedAdoptionApplicationSchema.parse(catOnly).visit.catTimeWindows).toEqual([
      "weekday_morning",
    ]);
  });

  test("maps payloads into compatibility and detail inserts", () => {
    const parsed = expandedAdoptionApplicationSchema.parse(validPayload());

    expect(toAdoptionApplicationSummaryInsert(parsed)).toEqual({
      animal_id: catId,
      animal_name: "Mochi",
      animal_type: "cat",
      applicant_name: "Ada",
      phone: "9123 4567",
      email: "ada@example.com",
      address: "HK Island",
      housing_type: "私人樓宇",
      family_size: 3,
      existing_pets: "None",
      reason: "I can provide a safe and stable home.",
    });

    expect(toDetailInsert(applicationId, parsed)).toMatchObject({
      public_application_id: applicationId,
      language: "zh-HK",
      preferred_contact_method: "whatsapp",
      household_size: 3,
      terms_version: "adoption-terms-2026-07",
    });

    expect(toPreferenceInserts(applicationId, parsed)).toHaveLength(2);
    expect(toVisitPreferenceInsert(applicationId, parsed)).toMatchObject({
      public_application_id: applicationId,
      date_range_start: "2026-07-10",
      date_range_end: "2026-07-24",
      dog_time_windows: ["weekend_afternoon"],
      cat_time_windows: ["weekday_evening", "weekend_afternoon"],
      preferred_time_windows: ["weekday_evening", "weekend_afternoon"],
    });
  });
});

describe("photo validation", () => {
  test("accepts known categories and image types under 8MB", () => {
    expect(photoCategorySchema.parse("home")).toBe("home");
    expect(
      validatePhotoDescriptor({
        category: "window",
        fileName: "window.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).toEqual({
      category: "window",
      fileName: "window.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
  });

  test("rejects unsupported files", () => {
    expect(() =>
      validatePhotoDescriptor({
        category: "home",
        fileName: "home.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    ).toThrow();
    expect(() =>
      validatePhotoDescriptor({
        category: "living",
        fileName: "large.png",
        mimeType: "image/png",
        sizeBytes: 9 * 1024 * 1024,
      }),
    ).toThrow();
  });
});
