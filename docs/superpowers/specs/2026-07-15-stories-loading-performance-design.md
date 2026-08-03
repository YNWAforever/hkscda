# Stories Loading Performance Design

Date: 2026-07-15
Status: Approved
Branch: `codex/stories-loading-performance`

## Objective

Improve the perceived and measured loading speed of `/stories` while balancing two user-visible goals:

1. Story cards should appear in the initial rendered page instead of waiting for client hydration and a second API request.
2. The Google rescue map should become usable promptly without competing with critical first-screen work.

The public content model, admin publishing workflow, and database schema remain unchanged.

## Baseline Evidence

Measurements against `https://hkscda.vercel.app/stories` on 2026-07-15 showed:

- `/stories` TTFB: approximately 0.56-0.79 seconds.
- `/stories` HTML size: approximately 25 KB.
- `/api/stories` TTFB: approximately 0.23-0.33 seconds.
- `/api/stories` payload: approximately 8.5 KB for 7 items and 4 map points.
- The main JavaScript asset is approximately 227 KB compressed.
- The initial HTML contains neither a story title nor the public map payload.
- The public API returns a Vercel cache hit and already uses public caching.

The current route renders empty arrays, waits for hydration, and only then starts `fetch("/api/stories")` from `useEffect`. Meaningful story content therefore sits behind an HTML, JavaScript, hydration, and API waterfall. Once data arrives, the Google Maps loader also begins work immediately.

## Selected Approach

Use a TanStack Router route loader backed by a server function to render story data during SSR, then defer the Google Maps script and map construction until idle time or proximity to the viewport.

This approach removes the critical client-side data waterfall without introducing a static regeneration or cache invalidation system. It also preserves the existing `/api/stories` endpoint for other consumers.

## Architecture

### Server Data Boundary

Add a stories page server function that:

- creates the existing Supabase service client;
- creates the existing content repository and service;
- calls `listPublicStoriesPage` with the standard public search defaults;
- returns the existing `{ items, total, points }` response shape;
- converts unexpected provider failures into a safe public error.

The handler body and server-only imports must remain in a server-safe module so Supabase service credentials and repository code do not enter the browser bundle.

### Route Loader

The `/stories` route loader calls the server function and supplies its result to `StoriesPage` through route loader data.

`StoriesPage` will:

- remove the mount-time `useEffect` request;
- remove duplicate `stories`, `points`, and request-error state;
- render `StoryWall`, `RescueMap`, and `StoryContentGrid` directly from loader data;
- use the route error boundary or a route-specific safe fallback when the loader fails.

This must work for both initial SSR and client-side navigation. The initial HTML must include rendered story titles.

### Existing Public API

Keep `/api/stories` and its current public cache behavior. No browser request to this endpoint should be initiated by the `/stories` component after hydration.

The implementation must not duplicate the list query itself. Both the server function and API route continue to rely on the existing content service and repository boundaries.

## Deferred Google Maps Loading

### Stable Placeholder

Reserve the existing map dimensions before Google Maps initializes. The placeholder must keep a minimum height of 300 pixels so deferred loading does not cause layout shift.

The rescue location list remains visible and usable independently of the interactive map.

### Script Preload Policy

Start loading the Google Maps script when either condition occurs:

1. the map section enters a root margin of approximately 600 pixels around the viewport; or
2. the browser becomes idle, with a fallback timeout of approximately 2 seconds.

The first condition to occur wins. Reuse the existing module-level loader promise so the script is downloaded at most once.

### Map Initialization Policy

Loading the script and constructing the map are separate operations:

- idle time may preload the script;
- `Map`, markers, bounds, info window, and listeners are created only when the map is near the viewport;
- cleanup removes observers, idle callbacks or timers, marker listeners, and markers;
- repeated renders must not inject duplicate scripts.

If `IntersectionObserver` is unavailable, initialize through a safe eager fallback. If `requestIdleCallback` is unavailable, use a timer fallback for script preload.

### Failure Behavior

If the API key is absent, no points exist, the Maps script fails, or initialization throws:

- retain the fixed-height fallback panel;
- show the existing safe Traditional Chinese status message;
- keep the rescue location list available;
- do not expose provider errors or API key details.

## Performance Acceptance Criteria

The implementation is accepted when all of the following are true in a production build or preview:

1. Initial `/stories` HTML contains at least one current story title when published stories exist.
2. Hydration does not trigger a browser request to `/api/stories`.
3. Story cards render without waiting for the Google Maps script.
4. The Maps script is not required for first-screen story content.
5. The interactive map initializes when its section approaches the viewport.
6. The map retains stable dimensions before and after initialization.
7. The `/stories` route JavaScript chunk does not materially grow from server-only dependencies.

Live timing comparisons will record HTML TTFB, meaningful-content request order, route asset size, and Maps request timing. Exact timings vary by network and Vercel region, so request ordering and removal of the waterfall are the primary deterministic gates.

## Testing Strategy

### Server and Loader Tests

- Verify the server data boundary delegates once to `listPublicStoriesPage`.
- Verify the response preserves items, total, and points.
- Verify provider failures become a safe public error.
- Verify the route renders loader data without a mount-time API fetch.

### Deferred Map Tests

- Verify the placeholder is rendered before initialization.
- Verify near-viewport observation starts script loading and map initialization.
- Verify idle work preloads the script without constructing the map early.
- Verify unsupported observer and idle APIs use their fallbacks.
- Verify failure messaging and rescue location fallback remain available.
- Verify observers, callbacks, listeners, and markers are cleaned up.

### Regression Checks

- Run focused stories, map loader, content service, and content repository tests.
- Run focused ESLint for changed files.
- Run TypeScript checking and distinguish pre-existing unrelated failures.
- Run the production build.
- Verify desktop and mobile layouts in a local production preview when runtime environment variables are available.

## Non-Goals

- No database migration or new index.
- No change to content pagination or filters.
- No replacement of Google Maps.
- No image CDN migration or broad image optimization project.
- No global main-bundle refactor.
- No change to admin content publishing behavior.

## Deployment and Rollback

Deploy through the normal Vercel preview and production flow. The existing Google Maps API key configuration remains unchanged.

Rollback is a code revert: restore the client fetch in `/stories` and eager map rendering. No data rollback or environment-variable change is required.
