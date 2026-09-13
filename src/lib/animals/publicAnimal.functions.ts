import { projectPublicAnimal } from "./publicProfile";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Animal } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
import { isPublicAnimalId } from "./publicAnimal";

const publicAnimalInput = z.object({
  id: z.string(),
  type: z.enum(["cat", "dog", "sponsor"]).optional(),
});

// Extracted so it's directly callable in tests -- createServerFn's wrapped
// export throws outside a real request context (no userCtx), the same reason
// submit-application.functions.ts keeps its core logic in a plain,
// separately-exported function rather than testing the wrapper itself.
export async function resolvePublicAnimal(data: { id: string; type?: "cat" | "dog" | "sponsor" }) {
  // Screened here rather than in the validator: a malformed id is a missing
  // page, and rejecting it as invalid input would surface as a 500.
  if (!isPublicAnimalId(data.id)) return null;

  const { supabase } = await import("../supabase");
  let query = supabase
    .from("animals")
    .select("*")
    .eq("id", data.id)
    .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES);
  query = query
    .is("retired_at", null)
    .eq(data.type === "sponsor" || !data.type ? "sponsorship_eligible" : "adoption_eligible", true);
  if (data.type && data.type !== "sponsor") query = query.eq("type", data.type);

  const { data: animal, error } = await query.maybeSingle();
  if (error) throw new Error("Could not load public animal");
  return animal ? projectPublicAnimal(animal as Animal) : null;
}

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => resolvePublicAnimal(data));
