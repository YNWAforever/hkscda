import { readWithOptionalGallery } from "./publicColumns";
import { projectPublicAnimal } from "./publicProfile";
import { supabase } from "../supabase";
import type { Animal, GenderFilter } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
import type { PublicAnimalType } from "./publicListing";

const PUBLIC_QUERY_BATCH_SIZE = 1_000;

export async function readPublicAnimals(input: {
  type: PublicAnimalType;
  genderFilter: GenderFilter;
}) {
  const animals: Animal[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await readWithOptionalGallery((columns) => {
      let query = supabase
        .from("animals")
        .select(columns)
        .eq("publication_state", "published")
        .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
        .is("retired_at", null)
        .eq(input.type === "sponsor" ? "sponsorship_eligible" : "adoption_eligible", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (input.type !== "sponsor") query = query.eq("type", input.type);

      if (input.genderFilter !== "all") {
        query = query.eq("gender", input.genderFilter);
      }

      return query.range(from, from + PUBLIC_QUERY_BATCH_SIZE - 1);
    });
    if (error) throw error;

    const batch = (data ?? []) as unknown as Animal[];
    if (batch.length === 0) break;
    animals.push(...batch.map((animal) => projectPublicAnimal(animal)));
    from += batch.length;
  }

  return animals;
}
