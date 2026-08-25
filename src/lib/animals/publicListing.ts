import type { AgeFilter, Animal, GenderFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";

export type PublicAnimalType = Extract<Animal["type"], "cat" | "dog">;

export interface PublicAnimalListingInput {
  animals: Animal[];
  type: PublicAnimalType;
  ageFilter: AgeFilter;
  genderFilter: GenderFilter;
  page: number;
  pageSize: number;
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
}: PublicAnimalListingInput): PublicAnimalListing {
  const normalizedPage = Math.max(1, Math.trunc(page));
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));

  const filtered = animals
    .filter((animal) => animal.type === type && animal.status === "available")
    .filter((animal) => genderFilter === "all" || animal.gender === genderFilter)
    .filter((animal) => ageFilter === "all" || parseAgeFilter(animal.age) === ageFilter)
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
