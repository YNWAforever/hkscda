export type AnimalType = "cat" | "dog" | "sponsor";
export type AnimalStatus = "available" | "adopted" | "fostered";
export type AgeFilter = "all" | "bb" | "adult" | "senior";
export type HousingType = "私人樓宇" | "居屋" | "公屋" | "村屋" | "其他";

export interface Animal {
  id: string;
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

export function parseAgeFilter(age: string): AgeFilter {
  if (age.includes("個月")) return "bb";
  const match = age.match(/(\d+)/);
  if (!match) return "adult";
  const years = parseInt(match[1], 10);
  if (years < 1) return "bb";
  if (years <= 7) return "adult";
  return "senior";
}
