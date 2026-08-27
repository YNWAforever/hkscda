import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import {
  AnimalListingError,
  AnimalListingPage,
  AnimalListingPending,
} from "../../components/site/AnimalListingPage";
import { getPublicAnimalListing } from "../../lib/animals/publicListing.functions";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
  gender: z.enum(["all", "female", "male"]).catch("all"),
});

export const Route = createFileRoute("/animals/cat")({
  validateSearch: searchSchema,
  // Server-rendered: the listing arrives with the first response instead of
  // after a browser round trip, and the projection filters before it paginates
  // so the total and the page count always agree (defect G-01).
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getPublicAnimalListing({
      data: {
        type: "cat",
        page: deps.page,
        pageSize: PAGE_SIZE,
        ageFilter: deps.filter,
        genderFilter: deps.gender,
      },
    }),
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/animals/cat" }],
  }),
  pendingComponent: () => <AnimalListingPending species="cat" />,
  errorComponent: ListingError,
  component: ListingPage,
});

function ListingPage() {
  const listing = Route.useLoaderData();
  const { filter, gender } = Route.useSearch();

  return (
    <AnimalListingPage
      species="cat"
      animals={listing.animals}
      total={listing.total}
      page={listing.page}
      pageSize={PAGE_SIZE}
      ageFilter={filter}
      genderFilter={gender}
    />
  );
}

function ListingError() {
  const router = useRouter();
  return <AnimalListingError species="cat" onRetry={() => router.invalidate()} />;
}
