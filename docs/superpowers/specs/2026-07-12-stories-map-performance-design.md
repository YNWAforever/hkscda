# Stories Map and Public Content Performance Design

## Goal

Make `/stories` render its public content promptly and replace the illustrative SVG with an interactive Google Map of Hong Kong rescue locations.

## Evidence and Root Cause

Production measurements on 2026-07-11 showed the page shell returning in about 0.5 seconds after warm-up, while `/api/stories` took about 1.5 seconds and `/api/stories/map` took about 1.5 seconds. The page waits until client hydration and then fetches both endpoints.

Both endpoints repeat the same data work. `listPublicContent` and `listPublicMapStories` each load content rows and then call `hydrateContentDetails`, which hydrates every row serially and loads private-only relationships that a public card never renders. The public responses also use `Cache-Control: no-store`, so every visit repeats the database work.

## Scope

- Keep the existing Stories Wall filters, story cards, routes, and public map-coordinate model.
- Serve one public stories payload containing both summaries and map points.
- Batch-load only public-card fields and add a short CDN cache policy.
- Render a lazily loaded Google Maps JavaScript map centred on Hong Kong, with a marker and linked info window for every valid public rescue coordinate.
- Preserve a useful rescue-location list whenever the map key is missing or the Google script fails.

## Non-goals

- No address geocoding, location-history UI, map clustering, new database columns, or changes to internal addresses.
- No map interaction data is stored or sent to HKCSDA's backend.
- No API key is committed to the repository or exposed in server logs.

## Data and API Design

`GET /api/stories` becomes the sole page data request and returns:

```ts
{
  items: ContentSummary[];
  total: number;
  points: PublicStoryMapPoint[];
}
```

The server obtains the published content page first, then fetches rescue profiles, media, and public story updates by the complete content-ID set. These relationship reads are batched and run in parallel where their results are independent. The projection preserves public-media rules: a cover image linked to a non-public update is not exposed.

The map-point list is built from the same public summaries, so points and cards cannot drift. `/api/stories/map` may remain temporarily for compatibility, but `/stories` no longer calls it.

Public story responses use `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Management and authenticated content endpoints keep `no-store`.

## Google Maps Design

The browser receives `VITE_GOOGLE_MAPS_API_KEY` only at build time. It is a public browser key, but Google Cloud restricts it to:

- `https://hkscda.vercel.app/*`
- `https://hkscda.com/*`
- Maps JavaScript API (`maps-backend.googleapis.com`)

The map script is loaded only when the rescue-map section is mounted. It uses the current `PublicStoryMapPoint` latitude, longitude, label, title, and slug. The initial camera is centred on Hong Kong; markers open an accessible info window with a link to `/stories/$slug`.

When `VITE_GOOGLE_MAPS_API_KEY` is absent, no valid points exist, or Google Maps fails to load, the section still renders its marker list and a concise non-blocking fallback state. The Stories Wall and content grid are never delayed by the third-party script.

## Delivery and Configuration

Google Cloud project `n8ntest-489915` has billing enabled, Maps JavaScript API and API Keys API enabled, and a restricted key named `HKCSDA Stories browser map`. Its value is retrieved only when setting Vercel's production `VITE_GOOGLE_MAPS_API_KEY`; it is never copied into a tracked file.

The earlier experimental Google Cloud project is out of scope for this feature and must not be deleted without a separate approval.

## Testing and Verification

- Add repository tests that assert public summaries and points are built from one batch payload and do not invoke per-item hydration.
- Add HTTP tests for the combined public response and cache header while retaining `no-store` coverage for management responses.
- Add component tests for marker rendering, valid Google-script initialization, and the missing-key/error fallback.
- Run focused tests, lint, type checking, production build, and a local browser check for the Stories Wall, fallback, and loaded Google map.
- After deployment, measure `/api/stories` and `/stories` again, verify a Vercel cache hit on a repeated request, and verify only the approved production origins can load the map.
