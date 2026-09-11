import type { Animal } from "../../types/animal";

/**
 * Maps a legacy `/admin?section=…` entry point to the animal filter it means.
 *
 * The admin list filtered `.eq("type", section)` while the public side filters
 * on the eligibility booleans (`isPublicAnimalMember` in publicListing.ts). The
 * two disagreed for exactly the records that matter: adoption and sponsorship
 * are independent memberships, so a cat marked sponsorship-eligible appears at
 * /sponsors publicly but was unreachable from /admin?section=sponsor, which
 * showed only the handful of legacy `type='sponsor'` rows. Staff could not open
 * the record the public could see.
 *
 * Species and programme are different questions:
 *
 *   - `cat` / `dog` are species. Staff maintain every animal of a species,
 *     including ones not currently offered for adoption, so this stays a `type`
 *     filter and deliberately does NOT narrow by adoption_eligible.
 *   - `sponsor` is not a species at all. It is sponsorship eligibility, and is
 *     filtered as such.
 *
 * The legacy `type='sponsor'` value still exists in the data; retiring it means
 * mapping each such animal to its real species by ID, which is a separate data
 * migration. Until then those rows carry `sponsorship_eligible = true` from the
 * 20260906162436 backfill, so they keep appearing under this filter.
 */
export type AdminAnimalSection = "cat" | "dog" | "sponsor";

export type AdminAnimalFilter =
  | { column: "type"; value: AdminAnimalSection }
  | { column: "sponsorship_eligible"; value: true };

export function adminAnimalFilter(section: AdminAnimalSection): AdminAnimalFilter {
  return section === "sponsor"
    ? { column: "sponsorship_eligible", value: true }
    : { column: "type", value: section };
}

/**
 * True while an animal still carries the legacy `'sponsor'` species placeholder.
 *
 * Species must be cat or dog; sponsorship is an eligibility, not a species. The
 * remaining `type='sponsor'` rows are the ones a human still has to assign a
 * real species to -- it cannot be derived, because nothing in the record says
 * whether the animal is a cat or a dog, and guessing from a name is exactly the
 * incorrect matching the migration rules forbid.
 *
 * Correcting one is now safe: until migration 20260911150000 the membership
 * trigger rewrote both eligibility flags on a species change, so fixing the
 * species silently removed the animal from the sponsorship catalogue. It now
 * preserves membership, which is what makes working through this list possible
 * at all.
 */
export function needsSpeciesVerification(animal: Pick<Animal, "type">): boolean {
  return animal.type === "sponsor";
}

/**
 * The same decision as a pure predicate, for asserting parity with the public
 * side without a database.
 */
export function isAdminSectionMember(
  animal: Pick<Animal, "type" | "sponsorship_eligible">,
  section: AdminAnimalSection,
): boolean {
  return section === "sponsor"
    ? (animal.sponsorship_eligible ?? animal.type === "sponsor")
    : animal.type === section;
}
