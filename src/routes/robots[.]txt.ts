import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_SITE_ORIGIN } from "@/lib/publicOrigin";

const PRODUCTION_ORIGIN = PUBLIC_SITE_ORIGIN;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "User-agent: *",
            "Allow: /",
            "Disallow: /admin/",
            "Disallow: /adoption/apply",
            "Disallow: /api/",
            "Disallow: /adoption/status/",
            "Disallow: /sponsors/status/",
            "Disallow: /volunteer/status/",
            `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`,
            "",
          ].join("\n"),
          {
            headers: {
              "cache-control": "public, max-age=0, s-maxage=86400",
              "content-type": "text/plain; charset=utf-8",
            },
          },
        ),
    },
  },
});
