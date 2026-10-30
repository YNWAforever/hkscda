import type { AdminLanguage } from "../../../lib/admin/language";

/**
 * An animal staff can add to a pledge, as `search_sponsorship_assignment_candidates` returns it
 * through GET /api/admin/sponsorships/animals: eligible, published, not retired, adopted or
 * deceased.
 */
export type AnimalCandidate = {
  id: string;
  name: string;
  name_en: string | null;
  code: string | null;
  image_url: string | null;
};

/** The route refuses a longer search. */
const MAX_QUERY_LENGTH = 100;

export function animalCandidatesPath(query: string) {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  return `/api/admin/sponsorships/animals?q=${encodeURIComponent(q)}`;
}

/** The candidates in the route's `{ animals }` body; an empty list for anything else. */
export function animalCandidatesFrom(body: unknown): AnimalCandidate[] {
  if (!body || typeof body !== "object") return [];
  const animals = (body as { animals?: unknown }).animals;
  return Array.isArray(animals) ? (animals as AnimalCandidate[]) : [];
}

/** The name in the admin's language first, then the other name and the animal's code. */
export function animalCandidateLabel(animal: AnimalCandidate, language: AdminLanguage) {
  const names =
    language === "en" && animal.name_en
      ? [animal.name_en, animal.name]
      : [animal.name, animal.name_en];
  const name = names.filter((value): value is string => Boolean(value)).join(" / ");
  return animal.code ? `${name} · ${animal.code}` : name;
}
