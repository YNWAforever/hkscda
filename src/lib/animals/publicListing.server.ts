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
      .eq("type", input.type)
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (input.genderFilter !== "all") {
      query = query.eq("gender", input.genderFilter);
    }

    const { data, error } = await query.range(from, from + PUBLIC_QUERY_BATCH_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Animal[];
    animals.push(...batch);
    if (batch.length < PUBLIC_QUERY_BATCH_SIZE) break;
  }

  return animals;
}
