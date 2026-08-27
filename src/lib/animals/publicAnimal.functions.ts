import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Animal } from "../../types/animal";
import { isPublicAnimalId } from "./publicAnimal";

const publicAnimalInput = z.object({
  id: z.string(),
  type: z.enum(["cat", "dog"]).optional(),
});

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => {
    // Screened here rather than in the validator: a malformed id is a missing
    // page, and rejecting it as invalid input would surface as a 500.
    if (!isPublicAnimalId(data.id)) return null;

    const { supabase } = await import("../supabase");
    let query = supabase.from("animals").select("*").eq("id", data.id).eq("status", "available");
    if (data.type) query = query.eq("type", data.type);

    const { data: animal, error } = await query.maybeSingle();
    if (error) throw new Error("Could not load public animal");
    return (animal as Animal | null) ?? null;
  });
