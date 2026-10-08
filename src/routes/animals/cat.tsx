import { createFileRoute, useRouter } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";
import { z } from "zod";

import {
  AnimalListingError,
  AnimalListingPage,
  AnimalListingPending,
} from "../../components/site/AnimalListingPage";
import { getPublicAnimalListing } from "../../lib/animals/publicListing.functions";

const PAGE_SIZE = 15;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
  gender: z.enum(["all", "female", "male"]).catch("all"),
  q: z.string().trim().max(80).catch(""),
  neutered: z.enum(["all", "yes", "no", "unknown"]).catch("all"),
  suitability: z.enum(["all", "newbie", "experienced", "unknown"]).catch("all"),
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
        q: deps.q,
        neutered: deps.neutered,
        suitability: deps.suitability,
      },
    }),
  head: () =>
    pageHead({
      title: "待領養貓貓",
      description:
        "查看目前可申請領養的貓貓，搜尋名字或編號，按生活需要縮窄結果，再了解牠們的需要。",
      path: "/animals/cat",
    }),
  pendingComponent: () => <AnimalListingPending species="cat" />,
  errorComponent: ListingError,
  component: ListingPage,
});

function ListingPage() {
  const listing = Route.useLoaderData();
  const { filter, gender, q, neutered, suitability } = Route.useSearch();

  return (
    <AnimalListingPage
      species="cat"
      animals={listing.animals}
      total={listing.total}
      page={listing.page}
      pageSize={PAGE_SIZE}
      ageFilter={filter}
      genderFilter={gender}
      q={q}
      neutered={neutered}
      suitability={suitability}
    />
  );
}

function ListingError() {
  const router = useRouter();
  return <AnimalListingError species="cat" onRetry={() => router.invalidate()} />;
}
