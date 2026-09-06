import { projectPublicAnimal } from "./publicProfile";
import { supabase } from "../supabase";
import type { Animal, GenderFilter } from "../../types/animal";
import type { PublicAnimalType } from "./publicListing";

const PUBLIC_QUERY_BATCH_SIZE = 1_000;

export async function readPublicAnimals(input: {
  type: PublicAnimalType;
  genderFilter: GenderFilter;
}) {
  const animals: Animal[] = [];

  for (let from = 0; ; from += PUBLIC_QUERY_BATCH_SIZE) {
    let query = supabase
      .from("animals")
      .select("*")
      .eq("status", "available")
      .is("retired_at", null)
      .eq(input.type === "sponsor" ? "sponsorship_eligible" : "adoption_eligible", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (input.type !== "sponsor") query = query.eq("type", input.type);

    if (input.genderFilter !== "all") {
      query = query.eq("gender", input.genderFilter);
    }

    const { data, error } = await query.range(from, from + PUBLIC_QUERY_BATCH_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Animal[];
    animals.push(...batch.map((animal) => projectPublicAnimal(animal)));
    if (batch.length < PUBLIC_QUERY_BATCH_SIZE) break;
  }

  return animals;
}
