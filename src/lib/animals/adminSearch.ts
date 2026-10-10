import type { Animal } from "../../types/animal";
import { parsePublicAnimalProfile } from "./publicProfile";

/**
 * Admin animal list search and archive handling.
 *
 * The list matched only `name` and `name_en`, so an animal's Chinese name found its record
 * and C3761 -- the reference number printed on the animal's own public page and the
 * identifier staff and the original site actually use -- found nothing. The two
 * must resolve to the same animal, which is the point of keeping the reference
 * number at all.
 *
 * Archived animals are a separate axis. `retired_at` retires a record without
 * breaking any historical foreign key, so archived animals must stay
 * RETRIEVABLE -- a retired record still needs correcting, and its applications
 * and sponsorships still point at it -- while not cluttering the working list
 * by default.
 */

export type AnimalSearchOptions = {
  /** Archived (retired) animals are hidden unless explicitly requested. */
  includeArchived?: boolean;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Matches a search term against the identifiers a person would actually type:
 * the animal's name in either language, and its reference number.
 *
 * The reference number is read through the public profile parser rather than
 * straight off the jsonb, so a malformed stored value behaves the same here as
 * it does on the public page instead of being searchable while invisible.
 */
export function matchesAnimalSearch(animal: Animal, term: string): boolean {
  const needle = normalize(term);
  if (!needle) return true;

  const code = parsePublicAnimalProfile(animal.public_profile ?? {}).code ?? "";
  return [animal.name, animal.name_en ?? "", code].some((candidate) =>
    normalize(candidate).includes(needle),
  );
}

export function isArchivedAnimal(animal: Pick<Animal, "retired_at">): boolean {
  return Boolean(animal.retired_at);
}

/** Applies the search term and the archive rule in one place. */
export function filterAdminAnimals(
  animals: Animal[],
  term: string,
  options: AnimalSearchOptions = {},
): Animal[] {
  return animals.filter(
    (animal) =>
      (options.includeArchived || !isArchivedAnimal(animal)) && matchesAnimalSearch(animal, term),
  );
}
