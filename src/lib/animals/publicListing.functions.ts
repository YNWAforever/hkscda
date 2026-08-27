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

const publicSponsorListingInput = z.object({
  ageFilter: z.enum(["all", "bb", "adult", "senior"]),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(48),
});

/**
 * Sponsor animals through the same projection as the species listings. The
 * previous /sponsors query paginated with range() and no order(), so the same
 * animal could appear on two pages or on none - the defect recorded as G-01 for
 * the cat and dog listings, present here too. Sponsors declare no gender filter,
 * so the projection is asked for all genders.
 */
export const getPublicSponsorListing = createServerFn({ method: "GET" })
  .inputValidator(publicSponsorListingInput)
  .handler(async ({ data }) => {
    const { readPublicAnimals } = await import("./publicListing.server");
    const animals = await readPublicAnimals({ type: "sponsor", genderFilter: "all" });
    return buildPublicAnimalListing({
      animals,
      type: "sponsor",
      ageFilter: data.ageFilter,
      genderFilter: "all",
      page: data.page,
      pageSize: data.pageSize,
    });
  });
