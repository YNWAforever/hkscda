import type {
  AgeFilter,
  Animal,
  GenderFilter,
  NeuteredFilter,
  SuitabilityFilter,
} from "../../types/animal";
import { isPubliclyVisibleStatus, parseAgeFilter } from "../../types/animal";

export type PublicAnimalType = Extract<Animal["type"], "cat" | "dog" | "sponsor">;

export function isPublicAnimalMember(
  animal: Pick<
    Animal,
    "type" | "status" | "retired_at" | "adoption_eligible" | "sponsorship_eligible"
  >,
  type: PublicAnimalType,
) {
  if (animal.retired_at || !isPubliclyVisibleStatus(animal.status)) return false;
  return type === "sponsor"
    ? (animal.sponsorship_eligible ?? animal.type === "sponsor")
    : animal.type === type && (animal.adoption_eligible ?? true);
}

export interface PublicAnimalListingInput {
  animals: Animal[];
  type: PublicAnimalType;
  ageFilter: AgeFilter;
  genderFilter: GenderFilter;
  page: number;
  pageSize: number;
  q?: string;
  neutered?: NeuteredFilter;
  suitability?: SuitabilityFilter;
}

export interface PublicAnimalListing {
  animals: Animal[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Public animal order is newest record first, then UUID ascending as a
 * deterministic tie-break. Keep the matching order clauses in the data query.
 */
export function comparePublicAnimals(left: Animal, right: Animal) {
  const createdDifference =
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  return createdDifference || left.id.localeCompare(right.id);
}

/**
 * Filters the complete RLS-approved result set before slicing a page. This
 * prevents totals and pagination from being calculated from only the current
 * client-side page.
 */
export function buildPublicAnimalListing({
  animals,
  type,
  ageFilter,
  genderFilter,
  page,
  pageSize,
  q = "",
  neutered = "all",
  suitability = "all",
}: PublicAnimalListingInput): PublicAnimalListing {
  const normalizedPage = Math.max(1, Math.trunc(page));
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));

  const search = q.trim().slice(0, 80).toLocaleLowerCase();
  const filtered = animals
    .filter((animal) => isPublicAnimalMember(animal, type))
    .filter((animal) => genderFilter === "all" || animal.gender === genderFilter)
    .filter((animal) => ageFilter === "all" || parseAgeFilter(animal.age) === ageFilter)
    .filter(
      (animal) =>
        !search ||
        [animal.name, animal.name_en, animal.public_profile?.code].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        ),
    )
    .filter(
      (animal) =>
        neutered === "all" ||
        (neutered === "unknown"
          ? animal.public_profile?.neutered == null
          : animal.public_profile?.neutered === (neutered === "yes")),
    )
    .filter(
      (animal) =>
        suitability === "all" ||
        (suitability === "unknown"
          ? animal.public_profile?.suitability == null
          : animal.public_profile?.suitability === suitability),
    )
    .sort(comparePublicAnimals);

  const total = filtered.length;
  const from = (normalizedPage - 1) * normalizedPageSize;

  return {
    animals: filtered.slice(from, from + normalizedPageSize),
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.ceil(total / normalizedPageSize),
  };
}
