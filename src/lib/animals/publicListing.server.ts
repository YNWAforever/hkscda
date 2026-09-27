import { z } from "zod";

import type {
  AgeFilter,
  Animal,
  GenderFilter,
  NeuteredFilter,
  SuitabilityFilter,
} from "../../types/animal";
import { supabase } from "../supabase";
import { projectPublicAnimal } from "./publicProfile";

export type PublicAnimalPageQuery = {
  purpose: "adoption" | "sponsorship";
  species?: "cat" | "dog";
  query?: string;
  hasPhoto?: boolean;
  ageBand: AgeFilter;
  gender: GenderFilter;
  neutered?: NeuteredFilter;
  suitability?: SuitabilityFilter;
  sort?: "newest" | "oldest";
  page: number;
  pageSize: number;
};

const pageSchema = z.object({
  items: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          type: z.enum(["cat", "dog", "sponsor"]),
          name: z.string(),
          age: z.string(),
          status: z.enum(["available", "fostered"]),
          publication_state: z.literal("published"),
        })
        .passthrough(),
    )
    .max(48),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
});

/** The SQL reader filters/counts before slicing and returns only card summaries. */
export async function listPublicAnimals(input: PublicAnimalPageQuery) {
  const { data, error } = await supabase.rpc("public_animal_listing_page", {
    p_filters: input,
  });
  if (error) throw error;
  const page = pageSchema.parse(data);
  return {
    items: page.items.map((item) => projectPublicAnimal(item as unknown as Animal)),
    total: page.total,
    page: page.page,
  };
}
