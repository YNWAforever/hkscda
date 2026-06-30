export type PublicApplicationInput = {
  id?: string;
  animal_id?: string | null;
  animal_name: string;
  animal_type: string;
  applicant_name: string;
  phone: string;
  email: string;
  address: string;
  housing_type: string;
  family_size?: number | null;
  existing_pets?: string | null;
  reason: string;
};

export function buildCaseFromPublicApplication(input: PublicApplicationInput) {
  return {
    publicApplicationId: input.id ?? null,
    requestedAnimalId: input.animal_id ?? null,
    animalType: input.animal_type,
    applicantName: input.applicant_name.trim(),
    applicantPhone: input.phone.trim(),
    applicantEmail: input.email.trim().toLowerCase(),
    applicantAddress: input.address.trim(),
    housingType: input.housing_type,
    familySize: input.family_size ?? null,
    existingPets: input.existing_pets?.trim() || null,
    reason: input.reason.trim(),
    preferences: {
      animalName: input.animal_name,
    },
  };
}
