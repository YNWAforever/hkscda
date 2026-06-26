import { describe, expect, test } from "bun:test";

import { buildCaseFromPublicApplication } from "./caseFactory";

describe("buildCaseFromPublicApplication", () => {
  test("normalizes public form data for internal cases", () => {
    expect(
      buildCaseFromPublicApplication({
        id: "11111111-2222-4333-8444-555555555555",
        animal_id: null,
        animal_name: "Mochi",
        animal_type: "cat",
        applicant_name: " Ada ",
        phone: " 9123 4567 ",
        email: "ADA@EXAMPLE.COM",
        address: "HK",
        housing_type: "私人樓宇",
        family_size: null,
        existing_pets: "",
        reason: "I can provide a safe home.",
      }),
    ).toMatchObject({
      applicantName: "Ada",
      applicantPhone: "9123 4567",
      applicantEmail: "ada@example.com",
      existingPets: null,
      preferences: { animalName: "Mochi" },
    });
  });
});
