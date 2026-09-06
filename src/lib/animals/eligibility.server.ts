import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicAnimalMember } from "./publicListing";
import type { Animal } from "../../types/animal";

export async function readEligibleAnimals(
  client: SupabaseClient,
  ids: string[],
  intent: "adoption" | "sponsorship",
) {
  const { data, error } = await client
    .from("animals")
    .select("id,type,status,adoption_eligible,sponsorship_eligible,retired_at")
    .in("id", ids)
    .eq("status", "available")
    .eq(intent === "sponsorship" ? "sponsorship_eligible" : "adoption_eligible", true)
    .is("retired_at", null);
  if (error) throw new Error("Could not verify selected animals");
  return ((data ?? []) as Animal[]).filter((animal) =>
    isPublicAnimalMember(
      animal,
      intent === "sponsorship" ? "sponsor" : animal.type === "dog" ? "dog" : "cat",
    ),
  );
}
