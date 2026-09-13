import { readWithOptionalGallery } from "./publicColumns";
import { projectPublicAnimal } from "./publicProfile";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Animal } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
import { isPublicAnimalId } from "./publicAnimal";

const publicAnimalInput = z.object({
  id: z.string(),
  type: z.enum(["cat", "dog", "sponsor"]).optional(),
});

// Extracted so it's directly callable in tests -- createServerFn's wrapped
// export throws outside a real request context (no userCtx), the same reason
// submit-application.functions.ts keeps its core logic in a plain function.
// Takes `supabase` as a parameter rather than importing it itself: the
// dynamic `await import("../supabase")` has to stay lexically inside the
// createServerFn .handler() callback below, not in a separately-exported
// function, or the client bundle build pulls in this function's whole
// module graph (confirmed by reproduction -- a sibling change that moved a
// dynamic import out of the handler this same way broke the client build by
// dragging in an unrelated .server.ts file's node:crypto usage).
export async function resolvePublicAnimal(
  data: { id: string; type?: "cat" | "dog" | "sponsor" },
  deps: { supabase: SupabaseClient },
) {
  // Screened here rather than in the validator: a malformed id is a missing
  // page, and rejecting it as invalid input would surface as a 500.
  if (!isPublicAnimalId(data.id)) return null;

  const { supabase } = deps;
  const { data: animal, error } = await readWithOptionalGallery((columns) => {
    let query = supabase
      .from("animals")
      .select(columns)
      .eq("publication_state", "published")
      .eq("id", data.id)
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES);
    query = query
      .is("retired_at", null)
      .eq(
        data.type === "sponsor" || !data.type ? "sponsorship_eligible" : "adoption_eligible",
        true,
      );
    if (data.type && data.type !== "sponsor") query = query.eq("type", data.type);

    return query.maybeSingle();
  });
  if (error) throw new Error("Could not load public animal");
  return animal ? projectPublicAnimal(animal as unknown as Animal) : null;
}

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => {
    const { supabase } = await import("../supabase");
    return resolvePublicAnimal(data, { supabase });
  });
