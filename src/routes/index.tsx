import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { HomeHero } from "../components/site/home/HomeHero";
import { FeaturedAnimals } from "../components/site/home/FeaturedAnimals";
import { ImpactBand } from "../components/site/home/ImpactBand";
import { AdoptionStepsBand } from "../components/site/home/AdoptionStepsBand";
import { FeaturedStory } from "../components/site/home/FeaturedStory";
import { HelpCards } from "../components/site/home/HelpCards";
import { TransparencyBand } from "../components/site/home/TransparencyBand";
import { getPublicAnimalListing } from "../lib/animals/publicListing.functions";
import { getPublicImpactItems } from "../lib/animals/publicImpact.functions";
import { getPublicStoriesPage } from "../lib/content/publicStoriesPage.functions";
import heroImg from "@/assets/dog-smiling.jpg";

const FEATURED_PER_SPECIES = 2;

/**
 * Server-rendered so the home page ships real animal, impact and story data in
 * its first response. Every section degrades to its own empty state, so one
 * unavailable source never blanks the page.
 */
async function loadHome() {
  const listing = (type: "cat" | "dog") =>
    getPublicAnimalListing({
      data: {
        type,
        ageFilter: "all",
        genderFilter: "all",
        page: 1,
        pageSize: FEATURED_PER_SPECIES,
      },
    }).catch(() => null);

  const [cats, dogs, impact, stories] = await Promise.all([
    listing("cat"),
    listing("dog"),
    getPublicImpactItems().catch(() => ({ items: [], asOf: null })),
    getPublicStoriesPage().catch(() => null),
  ]);

  return {
    featuredAnimals: [...(cats?.animals ?? []), ...(dogs?.animals ?? [])],
    impact,
    featuredStory: stories?.items?.[0] ?? null,
  };
}

export const Route = createFileRoute("/")({
  loader: () => loadHome(),
  head: () => ({
    meta: [
      { title: "香港拯救貓狗協會 HKSCDA · 領養代替購買" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會（HKSCDA）成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務。支持領養等於拯救生命。",
      },
      { property: "og:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        property: "og:description",
        content: "支持領養 · 拯救生命 · 不殺機構",
      },
      { property: "og:image", content: heroImg },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/") }],
  }),
  component: Index,
});

function Index() {
  const { featuredAnimals, impact, featuredStory } = Route.useLoaderData();

  return (
    <main>
      <HomeHero />
      <FeaturedAnimals animals={featuredAnimals} />
      <ImpactBand items={impact.items} asOf={impact.asOf} />
      <AdoptionStepsBand />
      <FeaturedStory story={featuredStory} />
      <HelpCards />
      <TransparencyBand />
    </main>
  );
}
