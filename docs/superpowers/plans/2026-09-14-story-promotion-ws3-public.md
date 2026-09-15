# Story & Promotion Center — WS3 Public Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public story pages present the content the editor actually set — the content's own CTA, the animal type as text, and a bounded related-stories section.

**Architecture:** Add two pure helpers to the existing public story logic module and use them in `StoryCard`/`StoryDetail`; add one bounded, public-safe server read for related stories and thread it through the existing `$slug` loader. No schema or API changes; only public presentation and one server read.

**Tech Stack:** TypeScript (strict), React 19, TanStack Router/Start server functions, `bun:test` (component tests use `renderToStaticMarkup`).

## Global Constraints

- Public projections must stay public-safe: never expose `internalAddress`/`internalLocationNotes`, internal updates, notification drafts, or social copies.
- Use `var(--color-*)` tokens; no hardcoded colours. Traditional Chinese copy.
- Related stories must be bounded (≤3) and published-only.
- Strict TypeScript, zero `any`; Conventional Commits; tests beside the source with injected fakes.

---

### Task 1: CTA and animal-type helpers on the story card

**Files:**
- Modify: `src/components/site/stories/storyPublicLogic.ts`
- Modify: `src/components/site/stories/StoryWall.tsx` (`StoryCard`)
- Test: `src/components/site/stories/storyPublicLogic.test.ts`, `src/components/site/stories/StoryWall.test.tsx`

**Interfaces:**
- Consumes: `AnimalStoryType` (`src/lib/content/types`).
- Produces: `storyCta(story: { ctaLabel: string | null; ctaUrl: string | null }): { href: string; label: string }`; `animalTypeLabel(type: AnimalStoryType): string`.

- [ ] **Step 1: Write the failing helper tests**

Add to `src/components/site/stories/storyPublicLogic.test.ts`:

```ts
import { animalTypeLabel, storyCta } from "./storyPublicLogic";

describe("storyCta", () => {
  test("uses the content's own CTA when both label and safe url are present", () => {
    expect(storyCta({ ctaLabel: "了解牠的故事", ctaUrl: "/sponsors" })).toEqual({
      href: "/sponsors",
      label: "了解牠的故事",
    });
  });
  test("falls back to the donation CTA when either is missing", () => {
    expect(storyCta({ ctaLabel: null, ctaUrl: "/sponsors" }).href).toBe("/donate?purpose=medical");
    expect(storyCta({ ctaLabel: "x", ctaUrl: null }).href).toBe("/donate?purpose=medical");
  });
  test("rejects an unsafe url", () => {
    expect(storyCta({ ctaLabel: "x", ctaUrl: "javascript:alert(1)" }).href).toBe(
      "/donate?purpose=medical",
    );
  });
});

describe("animalTypeLabel", () => {
  test("labels every animal type in Traditional Chinese", () => {
    expect(animalTypeLabel("cat")).toBe("貓");
    expect(animalTypeLabel("dog")).toBe("狗");
    expect(animalTypeLabel("mixed")).toBe("貓狗");
    expect(animalTypeLabel("unknown")).toBe("未知");
  });
});
```

Add to `src/components/site/stories/StoryWall.test.tsx` (static-render style already used there) a case with a story whose `ctaLabel`/`ctaUrl` are set and `storyProfile.animalType = "cat"`; assert the rendered markup contains `了解牠的故事` (or the chosen label) and `貓`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/site/stories/storyPublicLogic.test.ts`
Expected: FAIL — `storyCta`/`animalTypeLabel` are not exported.

- [ ] **Step 3: Implement the helpers**

Add to `src/components/site/stories/storyPublicLogic.ts` (keep it free of zod/client-heavy imports — inline the href safety check rather than importing `schemas`):

```ts
import type { AnimalStoryType } from "../../../lib/content/types";

const animalTypeLabels: Record<AnimalStoryType, string> = {
  cat: "貓",
  dog: "狗",
  mixed: "貓狗",
  unknown: "未知",
};

export function animalTypeLabel(type: AnimalStoryType) {
  return animalTypeLabels[type];
}

function isSafeStoryHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const DEFAULT_STORY_CTA = { href: "/donate?purpose=medical", label: "支援醫療費用 ｜ 立即捐助" };

export function storyCta(story: { ctaLabel: string | null; ctaUrl: string | null }) {
  const href = story.ctaUrl?.trim();
  const label = story.ctaLabel?.trim();
  if (href && label && isSafeStoryHref(href)) return { href, label };
  return DEFAULT_STORY_CTA;
}
```

- [ ] **Step 4: Use them in `StoryCard`**

In `StoryWall.tsx` `StoryCard`, add an animal-type chip next to the status/region chips:

```tsx
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-offset)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)]">
            {animalTypeLabel(profile.animalType)}
          </span>
```

Replace the hardcoded CTA anchor with:

```tsx
        {(() => {
          const cta = storyCta(story);
          return (
            <a href={cta.href} className="btn-primary mt-auto min-h-11 w-full text-sm!">
              {cta.label}
            </a>
          );
        })()}
```

(Or hoist `const cta = storyCta(story);` above the `return` — preferred; the IIFE is only to keep the diff local.)

- [ ] **Step 5: Run the tests and gates**

Run: `bun test src/components/site/stories/storyPublicLogic.test.ts src/components/site/stories/StoryWall.test.tsx`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/stories/storyPublicLogic.ts src/components/site/stories/storyPublicLogic.test.ts src/components/site/stories/StoryWall.tsx src/components/site/stories/StoryWall.test.tsx
git commit -m "feat(stories): use the content CTA and animal type on story cards"
```

---

### Task 2: CTA and animal type on the story detail page

**Files:**
- Modify: `src/components/site/stories/StoryDetail.tsx`
- Test: `src/components/site/stories/StoryDetail.test.tsx`

**Interfaces:**
- Consumes: `storyCta`, `animalTypeLabel` (Task 1).
- Produces: the detail aside shows an 動物類型 fact and the `支持救援個案醫療` panel's CTA uses the content's own CTA when present.

- [ ] **Step 1: Write the failing test**

Add to `src/components/site/stories/StoryDetail.test.tsx` a static-render case where `content.ctaLabel = "了解牠的故事"`, `content.ctaUrl = "/sponsors"`, and `content.storyProfile.animalType = "cat"`; assert the markup contains `了解牠的故事`, `href="/sponsors"`, and `動物類型`/`貓`. Also assert a content without a CTA still renders the fallback `支援醫療費用 ｜ 立即捐助`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/site/stories/StoryDetail.test.tsx`
Expected: FAIL — the CTA is hardcoded and there is no animal-type fact.

- [ ] **Step 3: Implement**

In `StoryDetail.tsx`:
- Import `animalTypeLabel`, `storyCta` from `./storyPublicLogic`.
- Compute `const cta = storyCta(content);`.
- Add an 動物類型 fact inside the 救援概況 `<dl>` when `profile` exists:

```tsx
                  <div>
                    <dt className="font-bold text-[var(--color-text)]">動物類型</dt>
                    <dd className="mt-1 text-[var(--color-text-muted)]">
                      {animalTypeLabel(profile.animalType)}
                    </dd>
                  </div>
```

- Replace the support panel's hardcoded anchor with `<a href={cta.href} className="btn-primary min-h-11 mt-4 w-full text-sm!">{cta.label}</a>`.

- [ ] **Step 4: Run the tests and gates**

Run: `bun test src/components/site/stories/StoryDetail.test.tsx`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/stories/StoryDetail.tsx src/components/site/stories/StoryDetail.test.tsx
git commit -m "feat(stories): use the content CTA and animal type on story detail"
```

---

### Task 3: Related stories on the story detail page

**Files:**
- Modify: `src/lib/content/publicStoriesPage.server.ts` (add `loadRelatedStories`, export `projectPublicStory`)
- Modify: `src/lib/content/publicStory.functions.ts` (add `getRelatedStories`)
- Modify: `src/routes/stories/$slug.tsx` (loader returns `{ content, related }`)
- Modify: `src/components/site/stories/StoryWall.tsx` (export `StoryCard`)
- Modify: `src/components/site/stories/StoryDetail.tsx` (render 相關故事)
- Test: `src/lib/content/publicStoriesPage.server.test.ts`, `src/components/site/stories/StoryDetail.test.tsx`

**Interfaces:**
- Consumes: `createContentService`, `createSupabaseContentRepository`, `projectPublicStory`, `PublicStorySummary`, exported `StoryCard`.
- Produces: `loadRelatedStories(slug: string, createService?): Promise<PublicStorySummary[]>` (≤3, published-only, excludes the current story); `getRelatedStories` server function; `StoryDetail` prop `related: PublicStorySummary[]`.

- [ ] **Step 1: Write the failing server test**

Add to `src/lib/content/publicStoriesPage.server.test.ts` (reuse the file's fake-service harness):

```ts
test("loadRelatedStories prefers the same animal type, excludes the current story, and caps at 3", async () => {
  const reader = createRelatedStoriesReader({
    getPublicContentBySlug: async () => ({ id: "c1", type: "rescue_story", storyProfile: { animalType: "cat", rescueRegion: "Sha Tin" } }),
    listPublicStoriesPage: async (input: { animalType?: string; rescueRegion?: string }) => ({
      items:
        input.animalType === "cat"
          ? [story("c1"), story("c2"), story("c3"), story("c4")]
          : [story("c5")],
      total: 4,
      points: [],
    }),
  });
  const related = await reader("current-slug");
  expect(related.map((s) => s.id)).toEqual(["c2", "c3", "c4"]);
  expect(related).toHaveLength(3);
});
```

Plus a case where no same-type stories remain: it falls back to the same `rescueRegion` and still excludes the current id, and a case returning `[]` for a non-rescue or missing content.

- [ ] **Step 2: Run to verify failure, then implement the read**

Run: `bun test src/lib/content/publicStoriesPage.server.test.ts`
Expected: FAIL — no `loadRelatedStories`.

In `publicStoriesPage.server.ts`:
- Export `projectPublicStory`.
- Add a `createRelatedStoriesReader(service)` that:
  1. loads the current story via `service.getPublicContentBySlug(slug)`; returns `[]` unless it is a published `rescue_story` with a `storyProfile`;
  2. queries `service.listPublicStoriesPage({ type: "rescue_story", animalType, pageSize: 6 })`, excludes the current id, and takes up to 3;
  3. if fewer than 3, queries `service.listPublicStoriesPage({ type: "rescue_story", rescueRegion, pageSize: 6 })`, appends non-duplicate, non-current ids until 3;
  4. maps the result through `projectPublicStory`.
- Add `loadRelatedStories(slug, createService = createPublicStoriesPageService)` mirroring `loadPublicStoriesPage` (swallow errors to `[]` so the detail page still renders).

- [ ] **Step 3: Add the server function and thread it through the loader**

In `publicStory.functions.ts`, add:

```ts
export const getRelatedStories = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(160) }))
  .handler(async ({ data }) => {
    const { loadRelatedStories } = await import("./publicStoriesPage.server");
    return loadRelatedStories(data.slug);
  });
```

In `src/routes/stories/$slug.tsx`, import `getRelatedStories` from `../../lib/content/publicStory.functions` and change the loader to return both:

```ts
    let content;
    try {
      content = await getPublicStory({ data: { slug: params.slug } });
    } catch (error) {
      console.error("Story detail read failed; rendering the unavailable state.", error);
      return null;
    }
    if (!content) throw notFound();
    const related = content.type === "rescue_story" ? await getRelatedStories({ data: { slug: params.slug } }) : [];
    return { content, related };
```

Update `StoryDetailPage` (`Route.useLoaderData()`) to pass `content={data.content} related={data.related}`. The `head()` callback reads `loaderData?.seoTitle` etc.; update those references to `loaderData?.content`.

- [ ] **Step 4: Render related stories**

In `StoryWall.tsx`, change `function StoryCard` to `export function StoryCard`.

In `StoryDetail.tsx`, accept `related: PublicStorySummary[]` and, when non-empty, render a section after the main grid:

```tsx
      {related.length > 0 ? (
        <section className="section bg-[var(--color-surface)]" aria-labelledby="related-stories-title">
          <div className="public-container">
            <h2 id="related-stories-title" className="font-display text-2xl font-bold text-[var(--color-panel)]">
              相關故事
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
```

- [ ] **Step 5: Run the tests and gates**

Run: `bun test src/lib/content/publicStoriesPage.server.test.ts src/components/site/stories/StoryDetail.test.tsx`
Run: `bunx tsc --noEmit`, `bun run lint`
Expected: pass/clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/content/publicStoriesPage.server.ts src/lib/content/publicStoriesPage.server.test.ts src/lib/content/publicStory.functions.ts src/routes/stories/$slug.tsx src/components/site/stories/StoryWall.tsx src/components/site/stories/StoryDetail.tsx src/components/site/stories/StoryDetail.test.tsx
git commit -m "feat(stories): add a bounded related-stories section"
```

---

## Self-Review

**Spec coverage (WS3):**
- Content's own CTA on card and detail → Tasks 1 and 2.
- Animal type as text on card and detail → Tasks 1 and 2.
- Related stories (bounded ≤3, published-only, excludes current, prefers animal type then region) → Task 3.

**Placeholder scan:** every step contains real code or a precise, testable instruction with file paths.

**Type consistency:** `storyCta`/`animalTypeLabel` (Task 1) are consumed in Task 2; `PublicStorySummary` flows from `loadRelatedStories` (Task 3) into the exported `StoryCard` and the `StoryDetail` `related` prop.

## Notes for the implementer

- Only `rescue_story` content with a `storyProfile` gets related stories; events/markets/reports return `[]`.
- Do not change the public cache headers, the `read_published_content_snapshots` RPC, or any WS1/WS2 code.
- `StoryWall.test.tsx` and `StoryDetail.test.tsx` use `renderToStaticMarkup`; extend them rather than adding a DOM library.
