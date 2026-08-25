import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Animal } from "../../types/animal";

const publicAnimalInput = z.object({
  id: z.string().uuid(),
  type: z.enum(["cat", "dog"]).optional(),
});

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => {
    const { supabase } = await import("../supabase");
    let query = supabase.from("animals").select("*").eq("id", data.id).eq("status", "available");
    if (data.type) query = query.eq("type", data.type);

    const { data: animal, error } = await query.maybeSingle();
    if (error) throw new Error("Could not load public animal");
    return (animal as Animal | null) ?? null;
  });
