import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_SITE_ORIGIN } from "@/lib/publicOrigin";

import { loadPublicStoriesPage } from "../lib/content/publicStoriesPage.server";
import { supabase } from "../lib/supabase";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../types/animal";

const PRODUCTION_ORIGIN = PUBLIC_SITE_ORIGIN;

const staticPaths = [
  "/",
  "/animals/cat",
  "/animals/dog",
  "/adoption/instructions",
  "/sponsors",
  "/sponsors/pledge",
  "/donate",
  "/volunteer",
  "/volunteer/group",
  "/stories",
  "/knowledge",
  "/help",
  "/report/adoption",
  "/report/audit",
  "/about",
  "/about/tnr",
  "/about/team",
  "/about/privacy",
] as const;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

export async function publicDetailPaths() {
  const [animalsResult, storiesResult] = await Promise.allSettled([
    supabase
      .from("animals")
      .select("id,type,adoption_eligible,sponsorship_eligible")
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
      .is("retired_at", null),
    loadPublicStoriesPage(),
  ]);

  const animalPaths =
    animalsResult.status === "fulfilled" && !animalsResult.value.error
      ? (animalsResult.value.data ?? []).flatMap((animal) => {
          const paths: string[] = [];
          if (animal.adoption_eligible && (animal.type === "cat" || animal.type === "dog")) {
            paths.push(`/animals/${animal.type}/${encodeURIComponent(animal.id)}`);
          }
          if (animal.sponsorship_eligible) paths.push(`/sponsors/${encodeURIComponent(animal.id)}`);
          return paths;
        })
      : [];

  const storyPaths =
    storiesResult.status === "fulfilled"
      ? storiesResult.value.items.map((story) => `/stories/${encodeURIComponent(story.slug)}`)
      : [];

  return [...animalPaths, ...storyPaths];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const paths = [...staticPaths, ...(await publicDetailPaths())];
        const urls = [...new Set(paths)].map(
          (path) => `  <url><loc>${escapeXml(`${PRODUCTION_ORIGIN}${path}`)}</loc></url>`,
        );
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          "</urlset>",
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
            "content-type": "application/xml; charset=utf-8",
          },
        });
      },
    },
  },
});
