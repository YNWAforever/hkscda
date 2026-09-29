export type AnimalType = "cat" | "dog" | "sponsor";
export type AnimalStatus = "available" | "adopted" | "fostered";

export const PUBLIC_VISIBLE_ANIMAL_STATUSES: readonly AnimalStatus[] = ["available", "fostered"];

export function isPubliclyVisibleStatus(status: AnimalStatus): boolean {
  return PUBLIC_VISIBLE_ANIMAL_STATUSES.includes(status);
}

/** Publication is a separate axis from `AnimalStatus` and from archival. */
export type AnimalPublicationState = "draft" | "published" | "unpublished";
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
  sponsorUse?: string | null;
  recentProgress?: string | null;
  story: string | null;
  recordDate: string | null;
}
export type NeuteredFilter = "all" | "yes" | "no" | "unknown";
export type SuitabilityFilter = "all" | "newbie" | "experienced" | "unknown";

export interface AnimalGalleryItem {
  id: string;
  url: string | null;
  draft_path: string | null;
  alt_zh: string;
  alt_en: string | null;
  source: string;
  focal_x: number;
  focal_y: number;
  review_status: "pending" | "approved" | "rejected";
  sort_order: number;
}

export interface Animal {
  id: string;
  /** Admin list projection; public readers use public_profile.code. */
  code?: string | null;
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
  /**
   * Public visibility, independent of the care state in `status` and of
   * `retired_at` archival. Optional for the same reason as the booleans above:
   * a snapshot taken before 20260911140000 will not carry it.
   */
  publication_state?: AnimalPublicationState;
  image_url: string | null;
  gallery?: AnimalGalleryItem[];
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
  if (normalized.length > 50) return "unknown";
  const months = normalized.match(
    /^(?:(?:約|大約)\s*|about\s+)?(\d+(?:\.\d+)?)\s*(?:個月|个月|月|months?|mos?)(?:\s+old)?$/,
  );
  if (months) {
    const value = Number(months[1]);
    if (!Number.isFinite(value) || value > 600) return "unknown";
    return value < 12 ? "bb" : value < 96 ? "adult" : "senior";
  }
  const years = normalized.match(
    /^(?:(?:約|大約)\s*|about\s+)?(\d+(?:\.\d+)?)\s*(?:歲|岁|years?|yrs?)(?:\s+old)?$/,
  );
  const value = Number(years?.[1] ?? (/^\d+(?:\.\d+)?$/.test(normalized) ? normalized : NaN));
  if (!Number.isFinite(value) || value > 50) return "unknown";
  return value < 1 ? "bb" : value < 8 ? "adult" : "senior";
}
