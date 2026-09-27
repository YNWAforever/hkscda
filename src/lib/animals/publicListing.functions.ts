import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const publicAnimalListingInput = z.object({
  type: z.enum(["cat", "dog"]),
  ageFilter: z.enum(["all", "bb", "adult", "senior"]),
  genderFilter: z.enum(["all", "male", "female"]),
  withPhoto: z.boolean().default(false),
  q: z.string().trim().max(80).default(""),
  neutered: z.enum(["all", "yes", "no", "unknown"]).default("all"),
  suitability: z.enum(["all", "newbie", "experienced", "unknown"]).default("all"),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(48),
});

/** Uses the bounded SQL page reader under the existing anonymous RLS policy. */
export const getPublicAnimalListing = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalListingInput)
  .handler(async ({ data }) => {
    const { listPublicAnimals } = await import("./publicListing.server");
    const page = await listPublicAnimals({
      purpose: "adoption",
      species: data.type,
      query: data.q,
      hasPhoto: data.withPhoto,
      ageBand: data.ageFilter,
      gender: data.genderFilter,
      neutered: data.neutered,
      suitability: data.suitability,
      sort: "newest",
      page: data.page,
      pageSize: data.pageSize,
    });
    return {
      animals: page.items,
      total: page.total,
      page: page.page,
      pageSize: data.pageSize,
      totalPages: Math.ceil(page.total / data.pageSize),
    };
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
    const { listPublicAnimals } = await import("./publicListing.server");
    const page = await listPublicAnimals({
      purpose: "sponsorship",
      ageBand: data.ageFilter,
      gender: "all",
      sort: "newest",
      page: data.page,
      pageSize: data.pageSize,
    });
    return {
      animals: page.items,
      total: page.total,
      page: page.page,
      pageSize: data.pageSize,
      totalPages: Math.ceil(page.total / data.pageSize),
    };
  });
