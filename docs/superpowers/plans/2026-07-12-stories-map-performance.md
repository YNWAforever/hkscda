# Stories Map and Public Content Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/stories` use one cached, batched public data request and render Google Maps Hong Kong rescue markers without blocking the story content.

**Architecture:** Extend the existing `contentListRead.server.ts` batching seam with a page-specific public read that assembles summaries and map points from one relation set. Keep the public HTTP route thin and cacheable. Replace the SVG map with a client-only Google Maps canvas plus the existing story-link list as a permanent accessible fallback.

**Tech Stack:** TanStack Start, React 19, TypeScript, Supabase JS, Bun tests, Google Maps JavaScript API, Vercel environment variables.

## Global Constraints

- Keep all internal address and location-note data out of public responses and browser markup.
- Use `VITE_GOOGLE_MAPS_API_KEY`; never write the key value to a tracked file, test fixture, command output, or log.
- The Google key is restricted to `https://hkscda.vercel.app/*`, `https://hkscda.com/*`, and `maps-backend.googleapis.com` in project `n8ntest-489915`.
- Preserve the existing `GET /api/stories/map` contract until consumers are deliberately migrated; `/stories` must stop requesting it.
- Request explicit user approval immediately before writing the production Vercel environment variable.

---

### Task 1: Build One Batched Stories Page Payload

**Files:**
- Modify: `src/lib/content/contentListRead.server.ts`
- Modify: `src/lib/content/service.ts`
- Test: `src/lib/content/contentListRead.server.test.ts`

**Interfaces:**
- Produces `PublicStoriesPage = { items: ContentSummary[]; total: number; points: PublicStoryMapPoint[] }`.
- Adds `ContentRepository.listPublicStoriesPage(input: PublicContentSearch): Promise<PublicStoriesPage>`.
- Adds `ContentService.listPublicStoriesPage(raw: unknown): Promise<PublicStoriesPage>`.

- [ ] **Step 1: Write a failing repository test for a combined read**

Add a test that creates `createSupabaseContentListRead(fakeClient)`, calls `listPublicStoriesPage({ page: 1, pageSize: 25, status: "published" })`, and asserts:

```ts
expect(result.items).toHaveLength(2);
expect(result.points.map((point) => point.id)).toEqual(["story-1"]);
expect(calls.filter((call) => call.table === "content_item")).toHaveLength(1);
expect(calls.filter((call) => call.table === "rescue_story_profile")).toHaveLength(1);
expect(calls.filter((call) => call.table === "content_media")).toHaveLength(1);
expect(calls.filter((call) => call.table === "story_update")).toHaveLength(1);
```

Include a private story-update cover in the fake media data and assert the corresponding public summary has `coverImageUrl === null`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts
```

Expected: FAIL because `listPublicStoriesPage` does not exist.

- [ ] **Step 3: Refactor the shared public read before adding the new method**

In `contentListRead.server.ts`, extract the published `content_item` query and `loadRelations` call used by `listPublicContent` into a private helper returning:

```ts
type PublicContentRead = {
  rows: ContentListRow[];
  relations: Awaited<ReturnType<typeof loadRelations>> | null;
  total: number;
};
```

Return an empty `rows` array and `relations: null` when no content matches. Reimplement `listPublicContent` through this helper so its response remains unchanged.

- [ ] **Step 4: Implement the combined public page method**

Add `listPublicStoriesPage` to `ContentListReadModule` and implement it through the same helper:

```ts
async listPublicStoriesPage(input) {
  const read = await readPublicContent(input);
  if (!read.relations) return { items: [], total: read.total, points: [] };
  const items = read.rows.map((row) => assemblePublicSummary(row, read.relations));
  return {
    items,
    total: read.total,
    points: items.map(mapStoryPoint).filter(nonNullable),
  };
}
```

Add the corresponding method to `ContentRepository` and `createContentService`, parsing with `publicContentSearchSchema` exactly as `listPublicContent` does.

- [ ] **Step 5: Run the focused repository tests**

Run:

```powershell
bun test src/lib/content/contentListRead.server.test.ts src/lib/content/service.test.ts
```

Expected: PASS, including existing public-card and privacy tests.

- [ ] **Step 6: Commit the batched payload change**

```powershell
git add src/lib/content/contentListRead.server.ts src/lib/content/contentListRead.server.test.ts src/lib/content/service.ts
git commit -m "perf: combine public stories content and map data"
```

### Task 2: Serve and Consume the Cached Combined Endpoint

**Files:**
- Modify: `src/lib/content/http.server.ts`
- Modify: `src/lib/content/http.test.ts`
- Modify: `src/routes/api/stories.ts`
- Modify: `src/routes/stories.tsx`

**Interfaces:**
- Produces `createContentHandlers(...).listPublicStoriesPage({ request }): Promise<Response>`.
- `GET /api/stories` responds with `PublicStoriesPage` and `cache-control: public, s-maxage=60, stale-while-revalidate=300`.
- `/stories` makes one `fetch("/api/stories")` and reads `items` and `points` from that body.

- [ ] **Step 1: Write failing HTTP tests for response shape and caching**

In `http.test.ts`, extend the fake service with `listPublicStoriesPage`, invoke the new handler with `new Request("https://example.test/api/stories")`, then assert:

```ts
expect(response.status).toBe(200);
expect(response.headers.get("cache-control")).toBe(
  "public, s-maxage=60, stale-while-revalidate=300",
);
expect(await response.json()).toEqual({ items: [], total: 0, points: [] });
```

Also keep an admin handler assertion that its cache-control header remains `no-store`.

- [ ] **Step 2: Run the HTTP test and verify it fails**

Run:

```powershell
bun test src/lib/content/http.test.ts
```

Expected: FAIL because `listPublicStoriesPage` and the public cache response do not exist.

- [ ] **Step 3: Add an explicit cacheable public JSON helper**

Keep `jsonResponse` unchanged for authenticated and mutation handlers. Add:

```ts
function publicJsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
  return Response.json(body, { ...init, headers });
}
```

Expose `listPublicStoriesPage` from `createContentHandlers`, call `service.listPublicStoriesPage(searchParams(request))`, and wrap its result with `publicJsonResponse` inside `withContentErrors(..., true)`.

- [ ] **Step 4: Route `/api/stories` to the new handler**

In `src/routes/api/stories.ts`, replace:

```ts
GET: ({ request }) => createHandlers().listPublicContent({ request }),
```

with:

```ts
GET: ({ request }) => createHandlers().listPublicStoriesPage({ request }),
```

- [ ] **Step 5: Collapse the client fetch path**

In `src/routes/stories.tsx`, replace the `Promise.all` request and two response-body types with one request:

```ts
const response = await fetch("/api/stories");
if (!response.ok) throw new Error("Failed to load stories");
const body = (await response.json()) as {
  items: ContentSummary[];
  points: PublicStoryMapPoint[];
};
if (!mounted) return;
setStories(body.items);
setPoints(body.points);
```

- [ ] **Step 6: Run route and HTTP verification**

Run:

```powershell
bun test src/lib/content/http.test.ts src/lib/content/contentListRead.server.test.ts
bunx eslint src/lib/content/http.server.ts src/routes/api/stories.ts src/routes/stories.tsx
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the endpoint and client fetch change**

```powershell
git add src/lib/content/http.server.ts src/lib/content/http.test.ts src/routes/api/stories.ts src/routes/stories.tsx
git commit -m "perf: cache combined stories page data"
```

### Task 3: Render Google Maps Without Blocking Story Content

**Files:**
- Create: `src/components/site/stories/googleMapsLoader.ts`
- Create: `src/components/site/stories/GoogleRescueMap.tsx`
- Create: `src/components/site/stories/googleMapsLoader.test.ts`
- Modify: `src/components/site/stories/RescueMap.tsx`
- Modify: `src/components/site/stories/RescueMap.test.tsx`
- Modify: `.env.example`

**Interfaces:**
- `loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace>` appends at most one Maps script and rejects on script failure.
- `GoogleRescueMap` accepts `{ apiKey: string; points: PublicStoryMapPoint[] }` and owns map initialization, markers, info windows, and cleanup.
- `RescueMap` always renders the linked point list and renders `GoogleRescueMap` only when a key and valid points exist.

- [ ] **Step 1: Write failing loader and fallback tests**

In `googleMapsLoader.test.ts`, stub `document.head.append` and assert duplicate calls with the same key append one script whose source contains `maps.googleapis.com/maps/api/js` and the encoded key. Trigger `script.onerror` and assert the returned promise rejects.

In `RescueMap.test.tsx`, render `<RescueMap points={[makePoint(1)]} apiKey={undefined} />` and assert the marker list link remains while the Google canvas is absent:

```ts
expect(markup).toContain('href="/stories/story-1"');
expect(markup).not.toContain('data-google-rescue-map="ready"');
```

- [ ] **Step 2: Run the focused component tests and verify they fail**

Run:

```powershell
bun test src/components/site/stories/RescueMap.test.tsx src/components/site/stories/googleMapsLoader.test.ts
```

Expected: FAIL because the loader and `apiKey` prop do not exist.

- [ ] **Step 3: Implement a typed, idempotent script loader**

In `googleMapsLoader.ts`, define the minimal Maps namespace needed by the component (`Map`, `Marker`, `InfoWindow`, `LatLngBounds`, and `event.clearInstanceListeners`) and store an in-module promise. Create a script with `async = true`, `defer = true`, and:

```ts
script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
```

Resolve only after `window.google.maps` is available; reject with `new Error("Google Maps failed to load")` on `onerror`. Never include a key in an error message.

- [ ] **Step 4: Implement the client-only map canvas**

In `GoogleRescueMap.tsx`, use a `ref` and `useEffect`. On mount, load the API, then construct the map with Hong Kong defaults:

```ts
center: { lat: 22.3193, lng: 114.1694 },
zoom: 11,
mapTypeControl: false,
streetViewControl: false,
fullscreenControl: true,
```

For each point create a marker, create one info window, and attach a click listener that sets content using DOM nodes (not interpolated HTML) and links to `/stories/${encodeURIComponent(point.slug)}`. Fit bounds for two or more markers. On cleanup, clear every marker listener and prevent late script resolution from mutating an unmounted element. Render `data-google-rescue-map="ready"` on the canvas container for browser verification.

- [ ] **Step 5: Replace the SVG while preserving the list fallback**

In `RescueMap.tsx`, remove `hkBounds`, `clamp`, and `projectPoint`. Add an optional prop for deterministic tests:

```ts
type RescueMapProps = {
  points: PublicStoryMapPoint[];
  apiKey?: string;
};
```

Resolve `const resolvedApiKey = apiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;`. Render `GoogleRescueMap` only if `resolvedApiKey` and `points.length > 0`; otherwise render the existing panel as a non-blocking unavailable state. Keep the linked point cards unchanged.

Add to `.env.example`:

```dotenv
# Browser-restricted Google Maps JavaScript API key for the public Stories map.
VITE_GOOGLE_MAPS_API_KEY=
```

- [ ] **Step 6: Run component tests and lint**

Run:

```powershell
bun test src/components/site/stories/RescueMap.test.tsx src/components/site/stories/googleMapsLoader.test.ts
bunx eslint src/components/site/stories/RescueMap.tsx src/components/site/stories/GoogleRescueMap.tsx src/components/site/stories/googleMapsLoader.ts
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the map integration**

```powershell
git add .env.example src/components/site/stories/RescueMap.tsx src/components/site/stories/RescueMap.test.tsx src/components/site/stories/GoogleRescueMap.tsx src/components/site/stories/googleMapsLoader.ts src/components/site/stories/googleMapsLoader.test.ts
git commit -m "feat: add Google rescue map markers"
```

### Task 4: Configure the Production Key and Verify the Full Flow

**Files:**
- No tracked source files unless a verification fix is required.

**Interfaces:**
- Vercel production has `VITE_GOOGLE_MAPS_API_KEY` set to the restricted key from `n8ntest-489915`.
- Production `/api/stories` returns a combined response and a repeat request receives a Vercel cache hit.

- [ ] **Step 1: Obtain explicit approval for the Vercel production environment write**

State the exact change before making it: set production `VITE_GOOGLE_MAPS_API_KEY` to the restricted `HKCSDA Stories browser map` key from project `n8ntest-489915`; no source file or log will receive the value.

- [ ] **Step 2: Write the key directly to Vercel without printing it**

Retrieve the key only through a pipe and write it directly to Vercel's production environment using the authenticated Vercel CLI or connector. Do not assign the key to a logged variable and do not use a command that echoes it. Verify only that the environment variable name exists.

- [ ] **Step 3: Build and run the full test suite**

Run:

```powershell
bun test
bunx eslint src/lib/content/contentListRead.server.ts src/lib/content/http.server.ts src/routes/api/stories.ts src/routes/stories.tsx src/components/site/stories/RescueMap.tsx src/components/site/stories/GoogleRescueMap.tsx src/components/site/stories/googleMapsLoader.ts
bun run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Deploy and measure production behavior**

Deploy through the existing GitHub/Vercel flow. After the deployment is ready, run two requests to each route:

```powershell
curl.exe -sS -D - https://hkscda.vercel.app/api/stories -o NUL
curl.exe -sS -D - https://hkscda.vercel.app/stories -o NUL
```

Expected: `/api/stories` has the combined `items`, `total`, and `points` payload plus `public, s-maxage=60, stale-while-revalidate=300`; a repeated response has a Vercel cache hit or revalidation state. In a browser, verify the Hong Kong map shows each public point, marker info windows link to the right story, and the point list still appears.

- [ ] **Step 5: Check the branch for review**

Run:

```powershell
git status --short
git diff origin/main...HEAD --check
git log --oneline origin/main..HEAD
```

Expected: a clean worktree, no whitespace errors, and the three focused commits from Tasks 1-3. Request code review before publishing a draft pull request.
