import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildPublicAnimalListing } from "./publicListing";

const publicAnimalListingInput = z.object({
  type: z.enum(["cat", "dog"]),
  ageFilter: z.enum(["all", "bb", "adult", "senior"]),
  genderFilter: z.enum(["all", "male", "female"]),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(48),
});

/**
 * Uses the existing public anonymous Supabase client, so the current RLS policy
 * remains authoritative. Age is free text in the existing schema; filtering
 * the complete RLS-approved set in this server function avoids a migration
 * while still applying filters before pagination.
 */
export const getPublicAnimalListing = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalListingInput)
  .handler(async ({ data }) => {
    const { readPublicAnimals } = await import("./publicListing.server");
    const animals = await readPublicAnimals({
      type: data.type,
      genderFilter: data.genderFilter,
    });
    return buildPublicAnimalListing({
      animals,
      type: data.type,
      ageFilter: data.ageFilter,
      genderFilter: data.genderFilter,
      page: data.page,
      pageSize: data.pageSize,
    });
  });
