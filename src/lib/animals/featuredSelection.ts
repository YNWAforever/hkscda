import type { Animal } from "../../types/animal";

/**
 * Chooses which animals the homepage features.
 *
 * The homepage took the first few cats and the first few dogs with no regard for
 * whether they had a photograph. At the 2026-09-11 audit only 14 of 248
 * unarchived animals carried a main-photo URL, so the band a first-time visitor
 * sees would have been mostly placeholder icons -- the worst possible
 * introduction on a page whose entire job is to make someone want to meet an
 * animal.
 *
 * The rule is explicit: feature animals with photographs, and do NOT feature
 * records without them. That is not the same as hiding those records. They stay
 * in the full directory at /animals/cat, /animals/dog and /sponsors, which this
 * function does not touch -- an animal without a photograph is still looking for
 * a home and must remain findable.
 *
 * Deliberately no fallback. If nothing has a photograph the band renders its
 * empty state, which links to the full list, rather than quietly padding itself
 * with the very records the rule excludes. An honest empty state beats a grid of
 * placeholders that misrepresents what the association has to show.
 */
export function hasDisplayablePhoto(animal: Pick<Animal, "image_url">): boolean {
  return typeof animal.image_url === "string" && animal.image_url.trim().length > 0;
}

export function selectFeaturedAnimals(animals: Animal[], limit?: number): Animal[] {
  const withPhoto = animals.filter(hasDisplayablePhoto);
  return typeof limit === "number" ? withPhoto.slice(0, limit) : withPhoto;
}
