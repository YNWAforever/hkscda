import { createFileRoute } from "@tanstack/react-router";

const PRODUCTION_ORIGIN = "https://hkscda.vercel.app";

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
            "Disallow: /api/admin/",
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
