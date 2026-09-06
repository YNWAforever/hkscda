export type AnimalType = "cat" | "dog" | "sponsor";
export type AnimalStatus = "available" | "adopted" | "fostered";
export type AgeFilter = "all" | "bb" | "adult" | "senior";
export type GenderFilter = "all" | "male" | "female";
export type HousingType = "私人樓宇" | "居屋" | "公屋" | "村屋" | "其他";

export interface AnimalPublicProfile {
  code: string | null;
  birthday: string | null;
  neutered: boolean | null;
  suitability: "newbie" | "experienced" | null;
  personality: string | null;
  health: string | null;
  story: string | null;
  recordDate: string | null;
}
export type NeuteredFilter = "all" | "yes" | "no" | "unknown";
export type SuitabilityFilter = "all" | "newbie" | "experienced" | "unknown";

export interface Animal {
  id: string;
  public_profile?: AnimalPublicProfile | null;
  type: AnimalType;
  name: string;
  name_en: string | null;
  gender: "male" | "female";
  age: string;
  age_en: string | null;
  description: string | null;
  description_en: string | null;
  notes: string | null;
  notes_en: string | null;
  status: AnimalStatus;
  /** Independent catalogue memberships; missing only on pre-migration snapshots. */
  adoption_eligible?: boolean;
  sponsorship_eligible?: boolean;
  retired_at?: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdoptionApplication {
  id: string;
  animal_id: string | null;
  animal_name: string;
  animal_type: string;
  applicant_name: string;
  phone: string;
  email: string;
  address: string;
  housing_type: HousingType;
  family_size: number | null;
  existing_pets: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function parseAgeFilter(age: string): AgeFilter | "unknown" {
  const normalized = age.trim().toLocaleLowerCase("en");
  if (/個月|months?/.test(normalized)) return "bb";

  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return "unknown";

  const years = Number(match[1]);
  if (!Number.isFinite(years)) return "unknown";
  if (years < 1) return "bb";
  if (years <= 7) return "adult";
  return "senior";
}
