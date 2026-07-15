# Stories Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render public stories in the initial SSR response and defer Google Maps work so story content and map usability improve without changing the content model.

**Architecture:** A server-only reader composes the existing content service and repository, exposed through a TanStack Start server function used by the `/stories` loader. The route renders loader data directly. A separate browser scheduler preloads Maps during idle time and initializes the map only near the viewport.

**Tech Stack:** React 19, TanStack Router/Start, TypeScript, Bun test, Supabase, Google Maps JavaScript API, Vite/Nitro, Playwright.

## Global Constraints

- Keep `/api/stories` and its public cache behavior unchanged.
- Do not add database changes, dependencies, static regeneration, image CDN work, or admin publishing changes.
- Initial HTML must contain story titles when published stories exist.
- Hydration must not initiate `/api/stories` from `/stories`.
- Reserve at least 300 pixels for the map before initialization.
- Preload Maps at a 600-pixel viewport margin or idle time with a 2-second fallback.
- Construct the map and markers only near the viewport.
- Never expose provider errors, service credentials, or the Maps API key.
- Follow TDD and witness every new test fail before production code.

## File Structure

- `src/lib/content/publicStoriesPage.server.ts`: server-only composition and safe reader.
- `src/lib/content/publicStoriesPage.server.test.ts`: dependency-injected reader tests.
- `src/lib/content/publicStoriesPage.functions.ts`: TanStack server-function boundary.
- `src/routes/stories.tsx`: loader, loader-data rendering, and safe error state.
- `src/routes/stories.test.tsx`: loader and SSR markup tests.
- `src/components/site/stories/deferredMapScheduling.ts`: viewport and idle adapters.
- `src/components/site/stories/deferredMapScheduling.test.ts`: scheduler tests.
- `src/components/site/stories/DeferredGoogleRescueMap.tsx`: placeholder and deferred activation.
- `src/components/site/stories/RescueMap.tsx`: deferred wrapper integration.
- `src/components/site/stories/RescueMap.test.tsx`: SSR and fallback regressions.

---

### Task 1: Add the Server Stories Reader

**Files:**
- Create: `src/lib/content/publicStoriesPage.server.ts`
- Create: `src/lib/content/publicStoriesPage.server.test.ts`
- Create: `src/lib/content/publicStoriesPage.functions.ts`

**Interfaces:**
- Consumes: existing content service, repository, and Supabase service client.
- Produces: `PublicStoriesPageData`, `createPublicStoriesPageReader`, `loadPublicStoriesPage`, and `getPublicStoriesPage`.

- [ ] **Step 1: Write the failing reader tests**

Create a one-story fixture and test exact delegation plus provider-error sanitization:

```ts
import { describe, expect, test } from "bun:test";
import type { ContentSummary, PublicStoryMapPoint } from "./types";
import { createPublicStoriesPageReader } from "./publicStoriesPage.server";

const item = { id: "story-1", title: "Lucky" } as ContentSummary;
const point = { id: "story-1", title: "Lucky" } as PublicStoryMapPoint;

describe("public stories page reader", () => {
  test("delegates once and preserves the payload", async () => {
    const calls: unknown[] = [];
    const expected = { items: [item], total: 1, points: [point] };
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage(input) {
        calls.push(input);
        return expected;
      },
    });
    expect(await read()).toEqual(expected);
    expect(calls).toEqual([{}]);
  });

  test("replaces provider details with a safe error", async () => {
    const read = createPublicStoriesPageReader({
      async listPublicStoriesPage() {
        throw new Error("database host and secret detail");
      },
    });
    expect(read()).rejects.toThrow("Could not load stories");
    expect(read()).rejects.not.toThrow("database host and secret detail");
  });
});
```

- [ ] **Step 2: Witness RED**

Run `bun test src/lib/content/publicStoriesPage.server.test.ts`.

Expected: FAIL because `publicStoriesPage.server.ts` does not exist.

- [ ] **Step 3: Implement the server-only reader**

```ts
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
import { createContentService } from "./service";
import type { ContentSummary, PublicStoryMapPoint } from "./types";

export type PublicStoriesPageData = {
  items: ContentSummary[];
  total: number;
  points: PublicStoryMapPoint[];
};

type PublicStoriesPageService = {
  listPublicStoriesPage(input: unknown): Promise<PublicStoriesPageData>;
};

export function createPublicStoriesPageReader(service: PublicStoriesPageService) {
  return async (): Promise<PublicStoriesPageData> => {
    try {
      return await service.listPublicStoriesPage({});
    } catch {
      throw new Error("Could not load stories");
    }
  };
}

export async function loadPublicStoriesPage() {
  const client = createSupabaseServiceClient();
  const service = createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: process.env.APP_URL ?? "http://localhost:5173",
  });
  return createPublicStoriesPageReader(service)();
}
```

- [ ] **Step 4: Add the browser-safe server function**

Use a dynamic import inside the handler so server modules cannot enter client assets:

```ts
import { createServerFn } from "@tanstack/react-start";

export const getPublicStoriesPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicStoriesPage } = await import("./publicStoriesPage.server");
  return loadPublicStoriesPage();
});
```

- [ ] **Step 5: Verify GREEN and commit**

```powershell
bun test src/lib/content/publicStoriesPage.server.test.ts src/lib/content/service.test.ts
bunx eslint src/lib/content/publicStoriesPage.server.ts src/lib/content/publicStoriesPage.server.test.ts src/lib/content/publicStoriesPage.functions.ts
git add src/lib/content/publicStoriesPage.server.ts src/lib/content/publicStoriesPage.server.test.ts src/lib/content/publicStoriesPage.functions.ts
git commit -m "perf: add server stories page reader"
```

Expected: selected tests pass and ESLint has zero errors before commit.

---

### Task 2: Render Stories Through a Route Loader

**Files:**
- Create: `src/routes/stories.test.tsx`
- Modify: `src/routes/stories.tsx`

**Interfaces:**
- Consumes: `getPublicStoriesPage(): Promise<PublicStoriesPageData>`.
- Produces: `createStoriesLoader`, `StoriesPageContent`, and `StoriesLoadError`.

- [ ] **Step 1: Write failing route tests**

Mock `@tanstack/react-router` using the existing lightweight `Link` pattern. Test that an injected loader is called once, SSR markup contains `Lucky` and `/stories/lucky`, and the error component only contains `暫時未能載入故事，請稍後再試。`.

```tsx
test("delegates loading once", async () => {
  let calls = 0;
  const loader = createStoriesLoader(async () => {
    calls += 1;
    return data;
  });
  expect(await loader()).toBe(data);
  expect(calls).toBe(1);
});

test("renders loader stories into SSR markup", () => {
  const markup = renderToStaticMarkup(<StoriesPageContent data={data} />);
  expect(markup).toContain("Lucky");
  expect(markup).toContain('/stories/lucky');
});
```

- [ ] **Step 2: Witness RED**

Run `bun test src/routes/stories.test.tsx`.

Expected: FAIL because the route does not export the new interfaces.

- [ ] **Step 3: Replace client fetch state with loader data**

Preserve the complete existing `head` metadata and add:

```tsx
import { getPublicStoriesPage } from "../lib/content/publicStoriesPage.functions";
import type { PublicStoriesPageData } from "../lib/content/publicStoriesPage.server";

type StoriesLoader = () => Promise<PublicStoriesPageData>;

export function createStoriesLoader(load: StoriesLoader) {
  return () => load();
}

const loadStories = createStoriesLoader(() => getPublicStoriesPage());

const storiesHead = () => ({
  meta: [
    { title: "救援故事牆 · 香港拯救貓狗協會 HKSCDA" },
    {
      name: "description",
      content: "瀏覽香港拯救貓狗協會公開救援故事、區域救援地圖、活動、義賣與報告。",
    },
    { property: "og:title", content: "救援故事牆 · HKSCDA" },
    {
      property: "og:description",
      content: "追蹤貓狗救援、康復、領養與協會活動報告。",
    },
    { property: "og:type", content: "website" },
  ],
  links: [{ rel: "canonical", href: "https://hkscda.com/stories" }],
});

export const Route = createFileRoute("/stories")({
  loader: loadStories,
  errorComponent: StoriesLoadError,
  head: storiesHead,
  component: StoriesPage,
});

function StoriesPage() {
  return <StoriesPageContent data={Route.useLoaderData()} />;
}

export function StoriesPageContent({ data }: { data: PublicStoriesPageData }) {
  return (
    <main>
      <StoryWall stories={data.items} />
      <RescueMap points={data.points} />
      <StoryContentGrid items={data.items} />
    </main>
  );
}

export function StoriesLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p role="alert" className="rounded-md bg-[var(--color-surface-offset)] p-4 text-sm text-[var(--color-text-muted)]">
        暫時未能載入故事，請稍後再試。
      </p>
    </main>
  );
}
```

Remove `useEffect`, `useState`, `/api/stories`, and duplicate request state. Preserve the metadata values shown above exactly.

- [ ] **Step 4: Verify GREEN, build, and commit**

```powershell
bun test src/routes/stories.test.tsx src/components/site/stories/StoryWall.test.tsx src/lib/content/publicStoriesPage.server.test.ts
if (Select-String -Quiet -Pattern '/api/stories' src/routes/stories.tsx) { throw 'client fetch remains' }
bun run build
git add src/routes/stories.tsx src/routes/stories.test.tsx src/routeTree.gen.ts
git commit -m "perf: render stories through route loader"
```

Expected: tests and build pass; `/api/stories` is absent from the route. Add `routeTree.gen.ts` only if generated changes exist.

---

### Task 3: Add Viewport and Idle Scheduling

**Files:**
- Create: `src/components/site/stories/deferredMapScheduling.ts`
- Create: `src/components/site/stories/deferredMapScheduling.test.ts`

**Interfaces:**
- Produces: `DeferredMapEnvironment`, `createBrowserDeferredMapEnvironment`, `observeNearViewport`, and `scheduleIdlePreload`.

- [ ] **Step 1: Write failing scheduler tests**

Use injected fakes to verify:

- observer root margin is `600px`, activates once, and disconnects;
- missing observer activates immediately;
- idle callback timeout is `2000` and cleanup cancels it;
- missing idle callback uses and clears a 2000-millisecond timer.

- [ ] **Step 2: Witness RED**

Run `bun test src/components/site/stories/deferredMapScheduling.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic adapters**

```ts
export const MAP_ROOT_MARGIN = "600px";
export const MAP_IDLE_TIMEOUT_MS = 2000;

type ObserverHandle = { observe(target: Element): void; disconnect(): void };

export type DeferredMapEnvironment = {
  createObserver?: (
    callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    options: { rootMargin: string },
  ) => ObserverHandle;
  requestIdle?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdle?: (id: number) => void;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
};

export function observeNearViewport(target: Element, onNear: () => void, env: DeferredMapEnvironment) {
  if (!env.createObserver) {
    onNear();
    return () => {};
  }
  let activated = false;
  const observer = env.createObserver((entries) => {
    if (activated || !entries.some((entry) => entry.isIntersecting)) return;
    activated = true;
    observer.disconnect();
    onNear();
  }, { rootMargin: MAP_ROOT_MARGIN });
  observer.observe(target);
  return () => observer.disconnect();
}

export function scheduleIdlePreload(callback: () => void, env: DeferredMapEnvironment) {
  if (env.requestIdle && env.cancelIdle) {
    const id = env.requestIdle(callback, { timeout: MAP_IDLE_TIMEOUT_MS });
    return () => env.cancelIdle?.(id);
  }
  const id = env.setTimer(callback, MAP_IDLE_TIMEOUT_MS);
  return () => env.clearTimer(id);
}
```

Implement `createBrowserDeferredMapEnvironment()` in the same module. Bind browser APIs only inside the factory and return timer functions even when idle APIs are absent. Importing the module during SSR must not read `window`.

```ts
type BrowserWindow = Window & {
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function createBrowserDeferredMapEnvironment(): DeferredMapEnvironment {
  if (typeof window === "undefined") {
    return {
      setTimer: () => 0,
      clearTimer: () => {},
    };
  }

  const browserWindow = window as BrowserWindow;
  return {
    createObserver:
      typeof IntersectionObserver === "undefined"
        ? undefined
        : (callback, options) => {
            const observer = new IntersectionObserver(callback, options);
            return {
              observe: (target) => observer.observe(target),
              disconnect: () => observer.disconnect(),
            };
          },
    requestIdle: browserWindow.requestIdleCallback?.bind(browserWindow),
    cancelIdle: browserWindow.cancelIdleCallback?.bind(browserWindow),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (id) => window.clearTimeout(id),
  };
}
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
bun test src/components/site/stories/deferredMapScheduling.test.ts
bunx eslint src/components/site/stories/deferredMapScheduling.ts src/components/site/stories/deferredMapScheduling.test.ts
git add src/components/site/stories/deferredMapScheduling.ts src/components/site/stories/deferredMapScheduling.test.ts
git commit -m "perf: add deferred map scheduling"
```

Expected: tests pass and ESLint has zero errors.

---

### Task 4: Defer Google Maps Without Hiding Locations

**Files:**
- Create: `src/components/site/stories/DeferredGoogleRescueMap.tsx`
- Modify: `src/components/site/stories/RescueMap.tsx`
- Modify: `src/components/site/stories/RescueMap.test.tsx`

**Interfaces:**
- Consumes: Task 3 scheduler, `loadGoogleMaps`, and `GoogleRescueMap`.
- Produces: `DeferredGoogleRescueMap({ apiKey, points })`.

- [ ] **Step 1: Change RescueMap tests first**

For a key and points, assert SSR contains `data-google-rescue-map="deferred"` and `min-h-[300px]`, does not contain `data-google-rescue-map="canvas"`, and still includes the story link. Keep missing-key, API-key secrecy, and internal-location secrecy assertions.

- [ ] **Step 2: Witness RED**

Run `bun test src/components/site/stories/RescueMap.test.tsx`.

Expected: FAIL because SSR still mounts the map canvas immediately.

- [ ] **Step 3: Implement the deferred wrapper**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicStoryMapPoint } from "../../../lib/content/types";
import { GoogleRescueMap } from "./GoogleRescueMap";
import {
  createBrowserDeferredMapEnvironment,
  observeNearViewport,
  scheduleIdlePreload,
} from "./deferredMapScheduling";
import { loadGoogleMaps } from "./googleMapsLoader";

export function DeferredGoogleRescueMap({ apiKey, points }: {
  apiKey: string;
  points: PublicStoryMapPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const environment = useMemo(() => createBrowserDeferredMapEnvironment(), []);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    return observeNearViewport(target, () => setNearViewport(true), environment);
  }, [environment]);

  useEffect(
    () => scheduleIdlePreload(() => { void loadGoogleMaps(apiKey).catch(() => {}); }, environment),
    [apiKey, environment],
  );

  return (
    <div ref={containerRef} data-google-rescue-map="deferred" className="relative min-h-[300px] overflow-hidden rounded-md bg-[var(--color-surface-offset)]">
      {nearViewport ? <GoogleRescueMap apiKey={apiKey} points={points} /> : <p className="sr-only" role="status">救援地圖準備載入</p>}
    </div>
  );
}
```

- [ ] **Step 4: Integrate it in RescueMap**

Replace only the direct `GoogleRescueMap` import and render with `DeferredGoogleRescueMap`. Preserve all layout, copy, missing-key fallback, points list, and links.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
bun test src/components/site/stories/RescueMap.test.tsx src/components/site/stories/googleMapsLoader.test.ts src/components/site/stories/deferredMapScheduling.test.ts
bunx eslint src/components/site/stories/DeferredGoogleRescueMap.tsx src/components/site/stories/RescueMap.tsx src/components/site/stories/RescueMap.test.tsx src/components/site/stories/deferredMapScheduling.ts
git add src/components/site/stories/DeferredGoogleRescueMap.tsx src/components/site/stories/RescueMap.tsx src/components/site/stories/RescueMap.test.tsx
git commit -m "perf: defer stories Google map"
```

Expected: all selected tests pass and ESLint has zero errors.

---

### Task 5: Verify the Complete Performance Story

**Files:**
- Do not add tracked files unless verification exposes a defect in Tasks 1-4.
- Never commit `.env.local`, `.output`, screenshots, or request logs.

- [ ] **Step 1: Run combined regression checks**

```powershell
bun test src/lib/content/publicStoriesPage.server.test.ts src/lib/content/contentListRead.server.test.ts src/lib/content/service.test.ts src/routes/stories.test.tsx src/components/site/stories/StoryWall.test.tsx src/components/site/stories/RescueMap.test.tsx src/components/site/stories/googleMapsLoader.test.ts src/components/site/stories/deferredMapScheduling.test.ts
bunx eslint src/lib/content/publicStoriesPage.server.ts src/lib/content/publicStoriesPage.server.test.ts src/lib/content/publicStoriesPage.functions.ts src/routes/stories.tsx src/routes/stories.test.tsx src/components/site/stories/DeferredGoogleRescueMap.tsx src/components/site/stories/RescueMap.tsx src/components/site/stories/RescueMap.test.tsx src/components/site/stories/deferredMapScheduling.ts src/components/site/stories/deferredMapScheduling.test.ts
bunx tsc --noEmit
bun run build
```

Expected: focused tests, lint, and build pass. If full TypeScript reports only unrelated baseline failures, record exact paths and verify no changed file appears.

- [ ] **Step 2: Confirm server code is absent from client assets**

```powershell
rg -n "SUPABASE_SERVICE_ROLE|createSupabaseContentRepository|repository\.server" .output/public -g "*.js"
```

Expected: no service credential names or repository implementation in browser assets. Compare the generated stories route asset with the live baseline of about 4.3 KB compressed.

- [ ] **Step 3: Start a production preview with ignored local environment**

```powershell
if (-not (Test-Path .env.local)) { Copy-Item ..\..\.env.local .env.local }
git status --short
bun run preview -- --host 127.0.0.1 --port 4174
```

Expected: `.env.local` stays ignored and the preview starts. Use another free port if 4174 is occupied.

- [ ] **Step 4: Verify SSR and browser request order**

```powershell
$html = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4174/stories).Content
if ($html -notmatch 'Lucky|示範') { throw 'SSR story title missing' }
```

Use Playwright at `1440x900` and `390x844`. Record requests, navigate to `/stories`, assert story cards are visible and no URL ends with `/api/stories`, confirm the deferred wrapper is at least 300 pixels high, scroll it into view, and confirm either the map canvas or safe fallback. Capture screenshots and inspect for overlap or layout shift.

- [ ] **Step 5: Record before/after evidence and final branch state**

Record these deterministic comparisons in the completion report:

- initial HTML contains story data: before `false`, after `true`;
- hydration requests `/api/stories`: before `yes`, after `no`;
- Maps blocks first-screen stories: before competing after data, after `no`;
- route chunk size before and after;
- preview TTFB and HTML bytes, labeled as local rather than production measurements.

Run:

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: clean worktree and only approved documentation, server boundary, route, scheduler, deferred map, and tests in the branch.

## Final Review Checklist

- [ ] Initial SSR includes current story content.
- [ ] `/stories` has no mount-time browser fetch.
- [ ] `/api/stories` remains unchanged.
- [ ] Server-only Supabase code is absent from client assets.
- [ ] Maps preloads on idle or proximity and initializes only near viewport.
- [ ] Missing browser APIs and Maps failures retain a safe fallback.
- [ ] Map dimensions remain stable.
- [ ] Traditional Chinese copy is preserved exactly.
- [ ] Tests, lint, build, SSR assertion, request-order check, and screenshots are complete.
