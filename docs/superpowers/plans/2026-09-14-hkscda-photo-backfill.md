# hkscda.com Animal Photo Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape the live `hkscda.com` adoption listings once and map each animal's photo onto the matching existing production animal record, so the homepage and directory show real pictures.

**Architecture:** A dependency-injected three-stage pipeline. A scraper statically fetches the server-rendered listing HTML into `data/hkscda-live.json`; a pure matcher resolves each scraped animal to a production `animals.id` by `(type, normalised name)`; an applier downloads each photo, re-hosts it in the public `animal-images` bucket, and sets `image_url` only where it is currently null. All parsing/matching/orchestration logic is pure and unit-tested with fixtures and fakes; only the thin CLI wiring touches the network and Supabase.

**Tech Stack:** Bun, Node ESM (`.mjs`), `bun:test`, `@supabase/supabase-js`, native `fetch`.

## Global Constraints

- Scripts live in `scripts/`; tests are `*.test.ts` beside the source and run with `bun test`.
- `tsconfig.json` does not include `scripts/`, so `bunx tsc --noEmit` does not typecheck these files — still keep the code plain and typed-by-construction.
- Dry-run is the default; no download, upload, or database write happens without `--apply`.
- On `--apply`, require `--yes`; print the resolved project ref and match counts before the first write.
- Only ever `UPDATE animals SET image_url = ... WHERE id = ? AND image_url IS NULL`. Never insert, delete, or modify another column.
- Never overwrite an animal that already has a non-empty `image_url`.
- Re-host photo bytes in the public `animal-images` bucket; do not hotlink `hkscda.com`.
- Deterministic storage key `hkscda/<sourceId>.<ext>`; `upsert: true`. Reject photo bodies over 8 MB.
- Commits use Conventional Commits.

---

### Task 1: Matching module

**Files:**
- Create: `scripts/lib/hkscdaMapping.mjs`
- Test: `scripts/lib/hkscdaMapping.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STATUS: { OVERRIDE, MATCHED, AMBIGUOUS, UNMATCHED, SKIPPED_ALREADY_IMAGED }`
  - `normalizeName(name: unknown): string`
  - `animalKey(type: string, name: unknown): string`
  - `matchSourceToAnimals(sourceList: Source[], animals: Animal[], overrides?: Map<string,string>): MatchResult[]`
  - `collectDbNotListed(animals: Animal[], results: MatchResult[]): DbNotListed[]`
  - Shapes: `Source = { sourceId: string, type: "cat"|"dog", name: string, gender?: string|null, age?: string|null, photoPath?: string|null }`; `Animal = { id: string, type: string, name: string, retired_at?: string|null, image_url?: string|null }`; `MatchResult = { source: Source, status: string, animalId?: string, candidates?: string[], reason?: string }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/hkscdaMapping.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  animalKey,
  collectDbNotListed,
  matchSourceToAnimals,
  normalizeName,
  STATUS,
} from "./hkscdaMapping.mjs";

const source = (over: Partial<Record<string, unknown>> = {}) => ({
  sourceId: "5309",
  type: "cat",
  name: "芝麻  Sesame",
  photoPath: "/HKSCDA/storage/app/public/animals/a.jpeg",
  ...over,
});

const animal = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "id-1",
  type: "cat",
  name: "芝麻 Sesame",
  retired_at: null,
  image_url: null,
  ...over,
});

describe("normalizeName", () => {
  test("trims, collapses whitespace, applies NFKC and casefolds Latin", () => {
    expect(normalizeName("  Sesame   芝麻 ")).toBe("sesame 芝麻");
    expect(normalizeName("COICOI")).toBe("coicoi");
    expect(normalizeName("ＣＯＩＣＯＩ")).toBe("coicoi");
  });

  test("returns an empty string for non-strings", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(42)).toBe("");
  });
});

describe("matchSourceToAnimals", () => {
  test("matches a live animal to the unique active record with the same type and name", () => {
    const results = matchSourceToAnimals([source()], [animal()]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(STATUS.MATCHED);
    expect(results[0].animalId).toBe("id-1");
  });

  test("ignores retired records", () => {
    const results = matchSourceToAnimals([source()], [animal({ retired_at: "2026-01-01" })]);
    expect(results[0].status).toBe(STATUS.UNMATCHED);
  });

  test("does not match across species", () => {
    const results = matchSourceToAnimals([source()], [animal({ type: "dog" })]);
    expect(results[0].status).toBe(STATUS.UNMATCHED);
  });

  test("flags a duplicate name as ambiguous and lists the candidate ids", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals);
    expect(results[0].status).toBe(STATUS.AMBIGUOUS);
    expect(results[0].candidates).toEqual(["id-1", "id-2"]);
  });

  test("skips a unique match that already has a photo", () => {
    const results = matchSourceToAnimals([source()], [animal({ image_url: "https://x/y.jpg" })]);
    expect(results[0].status).toBe(STATUS.SKIPPED_ALREADY_IMAGED);
  });

  test("an override wins over name matching", () => {
    const animals = [animal({ id: "id-1", name: "different" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals, new Map([["5309", "id-1"]]));
    expect(results[0].status).toBe(STATUS.OVERRIDE);
    expect(results[0].animalId).toBe("id-1");
  });

  test("an override to an already-imaged target is still skipped, not overwritten", () => {
    const animals = [animal({ id: "id-1", image_url: "https://x/y.jpg" })];
    const results = matchSourceToAnimals([source()], animals, new Map([["5309", "id-1"]]));
    expect(results[0].status).toBe(STATUS.SKIPPED_ALREADY_IMAGED);
  });

  test("an override to an unknown id is unmatched", () => {
    const results = matchSourceToAnimals([source()], [animal()], new Map([["5309", "nope"]]));
    expect(results[0].status).toBe(STATUS.UNMATCHED);
    expect(results[0].reason).toBe("override-missing");
  });
});

describe("collectDbNotListed", () => {
  test("returns active animals not referenced by any match or candidate", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2", name: "other" })];
    const results = matchSourceToAnimals([source()], animals);
    const missing = collectDbNotListed(animals, results);
    expect(missing.map((m) => m.animalId)).toEqual(["id-2"]);
  });

  test("excludes candidates of an ambiguous match", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals);
    expect(collectDbNotListed(animals, results)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/lib/hkscdaMapping.test.ts`
Expected: FAIL — cannot resolve `./hkscdaMapping.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/hkscdaMapping.mjs`:

```js
/**
 * Pure source->animal matching for the hkscda.com photo backfill.
 * No network, no Supabase import — data in, data out.
 */

export const STATUS = Object.freeze({
  OVERRIDE: "override",
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  UNMATCHED: "unmatched",
  SKIPPED_ALREADY_IMAGED: "skipped-already-imaged",
});

export function normalizeName(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function animalKey(type, name) {
  return `${type}\u0000${normalizeName(name)}`;
}

function hasImage(animal) {
  return typeof animal.image_url === "string" && animal.image_url.trim().length > 0;
}

export function matchSourceToAnimals(sourceList, animals, overrides = new Map()) {
  const active = animals.filter((a) => !a.retired_at);
  const byKey = new Map();
  for (const a of active) {
    const key = animalKey(a.type, a.name);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(a);
    else byKey.set(key, [a]);
  }

  const results = [];
  for (const source of sourceList) {
    const overrideId = overrides.get(source.sourceId);
    if (overrideId) {
      const target = active.find((a) => a.id === overrideId);
      if (!target) {
        results.push({ source, status: STATUS.UNMATCHED, reason: "override-missing" });
      } else if (hasImage(target)) {
        results.push({ source, status: STATUS.SKIPPED_ALREADY_IMAGED, animalId: target.id });
      } else {
        results.push({ source, status: STATUS.OVERRIDE, animalId: target.id });
      }
      continue;
    }

    const candidates = byKey.get(animalKey(source.type, source.name)) ?? [];
    if (candidates.length === 0) {
      results.push({ source, status: STATUS.UNMATCHED });
    } else if (candidates.length > 1) {
      results.push({ source, status: STATUS.AMBIGUOUS, candidates: candidates.map((c) => c.id) });
    } else {
      const target = candidates[0];
      results.push({
        source,
        status: hasImage(target) ? STATUS.SKIPPED_ALREADY_IMAGED : STATUS.MATCHED,
        animalId: target.id,
      });
    }
  }
  return results;
}

export function collectDbNotListed(animals, results) {
  const referenced = new Set();
  for (const result of results) {
    if (result.animalId) referenced.add(result.animalId);
    for (const id of result.candidates ?? []) referenced.add(id);
  }
  return animals
    .filter((a) => !a.retired_at && !referenced.has(a.id))
    .map((a) => ({ animalId: a.id, type: a.type, name: a.name, image_url: a.image_url ?? null }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/lib/hkscdaMapping.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/hkscdaMapping.mjs scripts/lib/hkscdaMapping.test.ts
git commit -m "feat(scripts): add pure hkscda source-to-animal matcher"
```

---

### Task 2: Listing and detail parser

**Files:**
- Create: `scripts/lib/hkscdaListing.mjs`
- Test: `scripts/lib/hkscdaListing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SITE_ORIGIN = "https://hkscda.com"`
  - `parseListingHtml(html: string, type: "cat"|"dog"): Source[]`
  - `parseDetailHtml(html: string): { photoPath: string|null, gender: string|null, age: string|null }`
  - `parseTotalPages(html: string): number`
  - `toAbsolutePhotoUrl(photoPath: string|null): string|null`
  - `extensionForContentType(contentType: string|null|undefined, url: string|null|undefined): string`
  - `looksLikeChallenge(html: string, title?: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/hkscdaListing.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  extensionForContentType,
  looksLikeChallenge,
  parseDetailHtml,
  parseListingHtml,
  parseTotalPages,
  toAbsolutePhotoUrl,
} from "./hkscdaListing.mjs";

const LISTING_HTML = `
<div class="col-6 col-md-3">
  <a href="/animal/id/5309" class="animal card d-block">
    <div class="animal-img" style="background-image:url('/HKSCDA/storage/app/public/animals/zyAL.jpeg')"></div>
    <div class="row align-items-center">
      <div class="paw"><img src='/img/paw.png'/></div>
      <div class="animal-info col-9">
        <p class="animal-name">名字: 肥黑 &amp; 仔</p>
        <p>性別: 男</p>
        <p>年齡: 11歲</p>
      </div>
    </div>
  </a>
</div>
<div class="col-6 col-md-3">
  <a href="/animal/id/5306" class="animal card d-block">
    <div class="animal-img"></div>
    <p class="animal-name">名字: 芳糖</p>
    <p>性別: 女</p>
    <p>年齡: 3個月</p>
  </a>
</div>
<ul class="pagination">
  <li><a href="https://hkscda.com/animals/cat?page=2">2</a></li>
  <li><a href="https://hkscda.com/animals/cat?page=8">8</a></li>
</ul>
`;

describe("parseListingHtml", () => {
  test("extracts cards with numeric id, name, gender, age and photo path", () => {
    const cards = parseListingHtml(LISTING_HTML, "cat");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      sourceId: "5309",
      type: "cat",
      name: "肥黑 & 仔",
      gender: "男",
      age: "11歲",
      photoPath: "/HKSCDA/storage/app/public/animals/zyAL.jpeg",
    });
    expect(cards[1].photoPath).toBeNull();
  });
});

describe("parseTotalPages", () => {
  test("returns the highest page number, or 1 when absent", () => {
    expect(parseTotalPages(LISTING_HTML)).toBe(8);
    expect(parseTotalPages("<html></html>")).toBe(1);
  });
});

describe("parseDetailHtml", () => {
  test("reads the main image and the labelled fields", () => {
    const html = `
      <img id="m-img" src="/HKSCDA/storage/app/public/animals/zyAL.jpeg" width="100%" />
      <p id="m-gender" class="col-8">男</p>
      <p id="m-age" class="col-8">11歲</p>`;
    expect(parseDetailHtml(html)).toEqual({
      photoPath: "/HKSCDA/storage/app/public/animals/zyAL.jpeg",
      gender: "男",
      age: "11歲",
    });
  });
});

describe("toAbsolutePhotoUrl", () => {
  test("prefixes relative paths and leaves absolute urls alone", () => {
    expect(toAbsolutePhotoUrl("/HKSCDA/a.jpeg")).toBe(
      "https://hkscda.com/HKSCDA/a.jpeg",
    );
    expect(toAbsolutePhotoUrl("https://cdn.example/a.jpeg")).toBe("https://cdn.example/a.jpeg");
    expect(toAbsolutePhotoUrl(null)).toBeNull();
  });
});

describe("extensionForContentType", () => {
  test("prefers the content type, falls back to the url suffix", () => {
    expect(extensionForContentType("image/jpeg; charset=binary", null)).toBe("jpg");
    expect(extensionForContentType("image/png", null)).toBe("png");
    expect(extensionForContentType(null, "https://x/a.webp?x=1")).toBe("webp");
    expect(extensionForContentType(null, null)).toBe("jpg");
  });
});

describe("looksLikeChallenge", () => {
  test("detects a Cloudflare interstitial", () => {
    expect(looksLikeChallenge("<html>cf-chl</html>")).toBe(true);
    expect(looksLikeChallenge("<html>Just a moment...</html>")).toBe(true);
    expect(looksLikeChallenge("<html>動物資料</html>")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/lib/hkscdaListing.test.ts`
Expected: FAIL — cannot resolve `./hkscdaListing.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/hkscdaListing.mjs`:

```js
/**
 * Pure HTML parsing for hkscda.com's server-rendered animal listings.
 * Real card shape (verified 2026-09-14):
 *   <a href="/animal/id/<N>"> ... background-image:url('/HKSCDA/...jpeg')
 *   ... 名字: / 性別: / 年齡:
 */

export const SITE_ORIGIN = "https://hkscda.com";

function decodeEntities(value) {
  if (value == null) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function text(value) {
  const decoded = decodeEntities(value);
  if (decoded == null) return null;
  return decoded.replace(/\s+/g, " ").trim() || null;
}

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? text(m[1]) : null;
}

export function parseListingHtml(html, type) {
  const cards = [];
  const seen = new Set();
  const anchorRe = /<a\s+href="\/animal\/id\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const sourceId = m[1];
    if (seen.has(sourceId)) continue;
    const block = m[2];
    const name = firstMatch(block, /名字:\s*([^<]+)/);
    if (!name) continue;
    seen.add(sourceId);
    cards.push({
      sourceId,
      type,
      name,
      gender: firstMatch(block, /性別:\s*([^<]+)/),
      age: firstMatch(block, /年齡:\s*([^<]+)/),
      photoPath: decodeEntities(
        (block.match(/background-image:\s*url\('([^']+)'\)/) ?? [])[1] ?? null,
      ),
    });
  }
  return cards;
}

export function parseDetailHtml(html) {
  const photoPath =
    firstMatch(html, /<img[^>]*id="m-img"[^>]*src="([^"]+)"/) ??
    firstMatch(html, /<img[^>]*src="([^"]+)"[^>]*id="m-img"/);
  const field = (id) => firstMatch(html, new RegExp(`id="${id}"[^>]*>([^<]*)<`));
  return { photoPath, gender: field("m-gender"), age: field("m-age") };
}

export function parseTotalPages(html) {
  let max = 1;
  for (const m of html.matchAll(/\?page=(\d+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function toAbsolutePhotoUrl(photoPath) {
  if (!photoPath) return null;
  if (/^https?:\/\//i.test(photoPath)) return photoPath;
  return SITE_ORIGIN + (photoPath.startsWith("/") ? photoPath : `/${photoPath}`);
}

export function extensionForContentType(contentType, url) {
  const ct = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  if (byType[ct]) return byType[ct];
  const m = String(url ?? "").match(/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export function looksLikeChallenge(html, title = "") {
  return (
    /cf-chl|challenges\.cloudflare\.com|cf_chl_/i.test(html) ||
    /just a moment|請稍候|attention required/i.test(`${title}\n${html}`)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/lib/hkscdaListing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/hkscdaListing.mjs scripts/lib/hkscdaListing.test.ts
git commit -m "feat(scripts): parse hkscda.com listing and detail markup"
```

---

### Task 3: Listing scraper CLI

**Files:**
- Create: `scripts/scrape-hkscda-listing.mjs`
- Test: `scripts/scrape-hkscda-listing.test.ts`

**Interfaces:**
- Consumes: `parseListingHtml`, `parseDetailHtml`, `parseTotalPages`, `looksLikeChallenge`, `SITE_ORIGIN` from `./lib/hkscdaListing.mjs`.
- Produces:
  - `fetchHtml(fetchImpl, url: string, type: "cat"|"dog"): Promise<string>` (throws on non-OK or challenge)
  - `collectListing(options?): Promise<Source[]>` where options are `{ fetchImpl?: typeof fetch, origin?: string, sleepImpl?: (ms:number)=>Promise<void>, maxPages?: number, onProgress?: (msg:string)=>void }`
  - Side effect: writes `data/hkscda-live.json` when run as a script.

- [ ] **Step 1: Write the failing test**

Create `scripts/scrape-hkscda-listing.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { collectListing, fetchHtml } from "./scrape-hkscda-listing.mjs";

const page1 = `
<a href="/animal/id/1" class="animal card d-block">
  <div class="animal-img" style="background-image:url('/HKSCDA/a.jpeg')"></div>
  <p class="animal-name">名字: 甲</p><p>性別: 男</p><p>年齡: 1歲</p>
</a>
<a href="https://hkscda.com/animals/cat?page=2">2</a>`;

const page2 = `
<a href="/animal/id/2" class="animal card d-block">
  <div class="animal-img"></div>
  <p class="animal-name">名字: 乙</p><p>性別: 女</p><p>年齡: 2歲</p>
</a>`;

const detail2 = `
<img id="m-img" src="/HKSCDA/b.jpeg" />
<p id="m-gender" class="col-8">女</p><p id="m-age" class="col-8">2歲</p>`;

function fakeFetch(routes: Record<string, string>) {
  return async (url: string) => {
    const body = routes[url];
    if (body == null) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  };
}

describe("fetchHtml", () => {
  test("throws on a non-OK response", async () => {
    const fetchImpl = fakeFetch({});
    await expect(fetchHtml(fetchImpl, "https://hkscda.com/animals/cat", "cat")).rejects.toThrow(
      "HTTP 404",
    );
  });

  test("throws when the body is a Cloudflare challenge", async () => {
    const fetchImpl = fakeFetch({ "https://hkscda.com/animals/cat": "cf-chl" });
    await expect(fetchHtml(fetchImpl, "https://hkscda.com/animals/cat", "cat")).rejects.toThrow(
      "Cloudflare",
    );
  });
});

describe("collectListing", () => {
  test("paginates, then falls back to the detail page when a card has no photo", async () => {
    const routes: Record<string, string> = {
      "https://hkscda.com/animals/cat": page1,
      "https://hkscda.com/animals/cat?page=2": page2,
      "https://hkscda.com/animals/dog": "",
      "https://hkscda.com/animal/id/2": detail2,
    };
    const result = await collectListing({
      fetchImpl: fakeFetch(routes),
      sleepImpl: async () => {},
    });
    expect(result.map((a) => a.sourceId)).toEqual(["1", "2"]);
    expect(result[0].photoPath).toBe("/HKSCDA/a.jpeg");
    expect(result[1].photoPath).toBe("/HKSCDA/b.jpeg");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/scrape-hkscda-listing.test.ts`
Expected: FAIL — cannot resolve `./scrape-hkscda-listing.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/scrape-hkscda-listing.mjs`:

```js
/**
 * HKSCDA live-listing scraper  —  scripts/scrape-hkscda-listing.mjs
 *
 * Fetches https://hkscda.com/animals/{cat,dog} (server-rendered HTML),
 * follows pagination, falls back to the detail page when a card has no photo,
 * and writes data/hkscda-live.json.
 *
 * Run:  node scripts/scrape-hkscda-listing.mjs   (or: bun run scrape:hkscda)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  looksLikeChallenge,
  parseDetailHtml,
  parseListingHtml,
  parseTotalPages,
  SITE_ORIGIN,
} from "./lib/hkscdaListing.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const DATA_DIR = "data";
const OUT_FILE = path.join(DATA_DIR, "hkscda-live.json");
const PAGE_DELAY_MS = 400;
const MAX_PAGES = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchHtml(fetchImpl, url, type) {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "zh-HK,zh;q=0.9",
      Referer: `${SITE_ORIGIN}/animals/${type}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (looksLikeChallenge(html)) throw new Error(`Cloudflare challenge at ${url}`);
  return html;
}

export async function collectListing({
  fetchImpl = fetch,
  origin = SITE_ORIGIN,
  sleepImpl = sleep,
  maxPages = MAX_PAGES,
  onProgress = () => {},
} = {}) {
  const animals = [];
  for (const type of ["cat", "dog"]) {
    let page = 1;
    let totalPages = 1;
    for (;;) {
      const url = `${origin}/animals/${type}${page > 1 ? `?page=${page}` : ""}`;
      const html = await fetchHtml(fetchImpl, url, type);
      const cards = parseListingHtml(html, type);
      onProgress(`${type} page ${page}: ${cards.length} card(s)`);
      if (cards.length === 0) break;

      for (const card of cards) {
        if (!card.photoPath) {
          try {
            const detailHtml = await fetchHtml(fetchImpl, `${origin}/animal/id/${card.sourceId}`, type);
            card.photoPath = parseDetailHtml(detailHtml).photoPath;
          } catch {
            // Leave null; the applier reports it rather than failing the run.
          }
          await sleepImpl(PAGE_DELAY_MS);
        }
        animals.push(card);
      }

      totalPages = parseTotalPages(html);
      if (page >= Math.min(totalPages, maxPages)) break;
      page += 1;
      await sleepImpl(PAGE_DELAY_MS);
    }
  }
  return animals;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const animals = await collectListing({ onProgress: (m) => console.log(`  ${m}`) });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(animals, null, 2)}\n`, "utf8");
  const cats = animals.filter((a) => a.type === "cat").length;
  const dogs = animals.filter((a) => a.type === "dog").length;
  const withPhoto = animals.filter((a) => a.photoPath).length;
  console.log(`\nScraped ${animals.length} animals (${cats} cats, ${dogs} dogs); ${withPhoto} with a photo.`);
  console.log(`Wrote ${OUT_FILE}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/scrape-hkscda-listing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape-hkscda-listing.mjs scripts/scrape-hkscda-listing.test.ts
git commit -m "feat(scripts): scrape hkscda.com live animal listings"
```

---

### Task 4: Backfill orchestration (pure, dependency-injected)

**Files:**
- Create: `scripts/lib/hkscdaBackfill.mjs`
- Test: `scripts/lib/hkscdaBackfill.test.ts`

**Interfaces:**
- Consumes: `matchSourceToAnimals`, `collectDbNotListed`, `STATUS` from `./hkscdaMapping.mjs`; `toAbsolutePhotoUrl`, `extensionForContentType` from `./hkscdaListing.mjs`.
- Produces:
  - `photoStorageKey(sourceId: string, ext: string): string` → `hkscda/<sourceId>.<ext>`
  - `summarize(manifest: ManifestRow[], dbNotListed: DbNotListed[]): Record<string, number>`
  - `runBackfill({ sourceList, animals, overrides?, dryRun?, deps }): Promise<{ manifest, dbNotListed, summary }>`
  - `deps` shape: `{ downloadPhoto(url): Promise<{ bytes: Uint8Array|Buffer, contentType: string }>, uploadPhoto(key, bytes, contentType): Promise<string>, setImageUrl(animalId, url): Promise<void> }`
  - `ManifestRow.status` ∈ `pending-apply` (dry-run) · `applied` · `override` · `skipped-already-imaged` · `ambiguous` · `unmatched-live` · `failed`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/hkscdaBackfill.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { photoStorageKey, runBackfill, summarize } from "./hkscdaBackfill.mjs";

const source = (over = {}) => ({
  sourceId: "5309",
  type: "cat",
  name: "肥黑",
  photoPath: "/HKSCDA/a.jpeg",
  ...over,
});
const animal = (over = {}) => ({
  id: "id-1",
  type: "cat",
  name: "肥黑",
  retired_at: null,
  image_url: null,
  ...over,
});

function makeDeps() {
  const calls = { downloads: [] as string[], uploads: [] as string[], updates: [] as string[] };
  return {
    calls,
    deps: {
      downloadPhoto: async (url: string) => {
        calls.downloads.push(url);
        return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
      },
      uploadPhoto: async (key: string) => {
        calls.uploads.push(key);
        return `https://proj.supabase.co/storage/v1/object/public/animal-images/${key}`;
      },
      setImageUrl: async (id: string) => {
        calls.updates.push(id);
      },
    },
  };
}

describe("photoStorageKey", () => {
  test("builds a deterministic key from the source id and extension", () => {
    expect(photoStorageKey("5309", "jpg")).toBe("hkscda/5309.jpg");
  });
});

describe("runBackfill", () => {
  test("dry-run matches but never downloads, uploads or updates", async () => {
    const { deps, calls } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: true,
      deps,
    });
    expect(result.manifest[0].status).toBe("pending-apply");
    expect(calls.downloads).toEqual([]);
    expect(calls.uploads).toEqual([]);
    expect(calls.updates).toEqual([]);
  });

  test("apply downloads, uploads under a deterministic key, and writes image_url", async () => {
    const { deps, calls } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: false,
      deps,
    });
    expect(calls.downloads).toEqual(["https://hkscda.com/HKSCDA/a.jpeg"]);
    expect(calls.uploads).toEqual(["hkscda/5309.jpg"]);
    expect(calls.updates).toEqual(["id-1"]);
    expect(result.manifest[0].status).toBe("applied");
    expect(result.manifest[0].image_url).toContain("hkscda/5309.jpg");
  });

  test("a download failure is recorded as failed and does not throw", async () => {
    const { deps, calls } = makeDeps();
    deps.downloadPhoto = async () => {
      throw new Error("boom");
    };
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: false,
      deps,
    });
    expect(result.manifest[0].status).toBe("failed");
    expect(result.manifest[0].error).toBe("boom");
    expect(calls.updates).toEqual([]);
  });

  test("an animal absent from the listing is reported as db-not-listed", async () => {
    const { deps } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal(), animal({ id: "id-2", name: "missing" })],
      dryRun: true,
      deps,
    });
    expect(result.dbNotListed.map((d) => d.animalId)).toEqual(["id-2"]);
  });
});

describe("summarize", () => {
  test("counts statuses and includes db-not-listed", () => {
    const counts = summarize(
      [{ status: "matched" }, { status: "matched" }, { status: "failed" }] as never,
      [{ animalId: "x" }] as never,
    );
    expect(counts).toEqual({ matched: 2, failed: 1, "db-not-listed": 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/lib/hkscdaBackfill.test.ts`
Expected: FAIL — cannot resolve `./hkscdaBackfill.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/hkscdaBackfill.mjs`:

```js
/**
 * Pure backfill orchestration. All side effects (download, upload, DB write)
 * arrive as injected `deps`, so this module is testable without a network or
 * a database. The CLI in scripts/apply-hkscda-photos.mjs supplies real deps.
 */

import { collectDbNotListed, matchSourceToAnimals, STATUS } from "./hkscdaMapping.mjs";
import { extensionForContentType, toAbsolutePhotoUrl } from "./hkscdaListing.mjs";

export function photoStorageKey(sourceId, ext) {
  return `hkscda/${sourceId}.${ext}`;
}

export function summarize(manifest, dbNotListed) {
  const counts = {};
  for (const row of manifest) counts[row.status] = (counts[row.status] ?? 0) + 1;
  counts["db-not-listed"] = dbNotListed.length;
  return counts;
}

export async function runBackfill({ sourceList, animals, overrides = new Map(), dryRun = true, deps }) {
  const results = matchSourceToAnimals(sourceList, animals, overrides);
  const manifest = [];

  for (const result of results) {
    const base = {
      sourceId: result.source.sourceId,
      type: result.source.type,
      name: result.source.name,
      animalId: result.animalId ?? null,
      candidates: result.candidates ?? [],
      image_url: null,
      error: null,
    };

    if (result.status === STATUS.MATCHED || result.status === STATUS.OVERRIDE) {
      if (dryRun) {
        manifest.push({ ...base, status: "pending-apply" });
        continue;
      }
      try {
        const absoluteUrl = toAbsolutePhotoUrl(result.source.photoPath);
        if (!absoluteUrl) throw new Error("source has no photo path");
        const download = await deps.downloadPhoto(absoluteUrl);
        const ext = extensionForContentType(download.contentType, absoluteUrl);
        const key = photoStorageKey(result.source.sourceId, ext);
        const publicUrl = await deps.uploadPhoto(key, download.bytes, download.contentType);
        await deps.setImageUrl(result.animalId, publicUrl);
        const appliedStatus = result.status === STATUS.OVERRIDE ? STATUS.OVERRIDE : "applied";
        manifest.push({ ...base, status: appliedStatus, image_url: publicUrl });
      } catch (error) {
        manifest.push({ ...base, status: "failed", error: error.message });
      }
    } else if (result.status === STATUS.UNMATCHED) {
      manifest.push({ ...base, status: "unmatched-live" });
    } else {
      manifest.push({ ...base, status: result.status });
    }
  }

  const dbNotListed = collectDbNotListed(animals, results);
  return { manifest, dbNotListed, summary: summarize(manifest, dbNotListed) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/lib/hkscdaBackfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/hkscdaBackfill.mjs scripts/lib/hkscdaBackfill.test.ts
git commit -m "feat(scripts): add dependency-injected photo backfill orchestration"
```

---

### Task 5: Applier CLI with real Supabase/HTTP deps and safety gates

**Files:**
- Create: `scripts/apply-hkscda-photos.mjs`
- Test: `scripts/apply-hkscda-photos.test.ts`

**Interfaces:**
- Consumes: `runBackfill`, `photoStorageKey` from `./lib/hkscdaBackfill.mjs`; `PRODUCTION_PROJECT_REF`, `extractProjectRef` from `./seed-admin.js`.
- Produces:
  - `parseArgs(argv: string[]): { apply: boolean, yes: boolean }`
  - `checkRunGuard({ dryRun, yes }): string | null` — message when writes are not permitted.
  - `downloadPhoto(fetchImpl, url): Promise<{ bytes: Buffer, contentType: string }>` — rejects non-images and bodies over 8 MB.
  - `toCsv(rows: Record<string, unknown>[]): string`
  - CLI: `--dry-run` default; `--apply` plus `--yes` to write.

- [ ] **Step 1: Write the failing test**

Create `scripts/apply-hkscda-photos.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { checkRunGuard, downloadPhoto, parseArgs, toCsv } from "./apply-hkscda-photos.mjs";

describe("parseArgs", () => {
  test("defaults to dry-run and requires both flags to write", () => {
    expect(parseArgs([])).toEqual({ apply: false, yes: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true, yes: false });
    expect(parseArgs(["--apply", "--yes"])).toEqual({ apply: true, yes: true });
  });
});

describe("checkRunGuard", () => {
  test("allows dry-run without confirmation", () => {
    expect(checkRunGuard({ dryRun: true, yes: false })).toBeNull();
  });

  test("refuses --apply without --yes", () => {
    expect(checkRunGuard({ dryRun: false, yes: false })).toContain("--yes");
  });

  test("allows --apply with --yes", () => {
    expect(checkRunGuard({ dryRun: false, yes: true })).toBeNull();
  });
});

describe("downloadPhoto", () => {
  test("returns bytes for an image response", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await downloadPhoto(fetchImpl as never, "https://hkscda.com/a.jpeg");
    expect(result.contentType).toBe("image/jpeg");
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
  });

  test("rejects a non-image response", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "text/html" : null) },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    await expect(downloadPhoto(fetchImpl as never, "https://hkscda.com/a")).rejects.toThrow(
      "not an image",
    );
  });
});

describe("toCsv", () => {
  test("quotes values containing commas or quotes", () => {
    expect(toCsv([{ a: "x,y", b: 'q"r' }])).toBe('"a","b"\n"x,y","q""r"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/apply-hkscda-photos.test.ts`
Expected: FAIL — cannot resolve `./apply-hkscda-photos.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/apply-hkscda-photos.mjs`:

```js
/**
 * HKSCDA photo backfill applier  —  scripts/apply-hkscda-photos.mjs
 *
 * Reads data/hkscda-live.json, matches it against the production `animals`
 * table, re-hosts each photo in the public `animal-images` bucket and sets
 * `image_url` only where it is currently null.
 *
 * Dry-run is the default. To write:
 *   node scripts/apply-hkscda-photos.mjs --apply --yes
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBackfill } from "./lib/hkscdaBackfill.mjs";
import { extractProjectRef, PRODUCTION_PROJECT_REF } from "./seed-admin.js";

const LIVE_FILE = path.join("data", "hkscda-live.json");
const OVERRIDES_FILE = path.join("scripts", "hkscda-photo-overrides.json");
const MANIFEST_JSON = path.join("data", "hkscda-photo-manifest.json");
const MANIFEST_CSV = path.join("data", "hkscda-photo-manifest.csv");
const MAX_BYTES = 8 * 1024 * 1024;

function readEnv() {
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.trim().match(/^([^#=][^=]*?)\s*=\s*(.*)$/);
      if (m) merged[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...merged, ...process.env };
}

export function parseArgs(argv) {
  return { apply: argv.includes("--apply"), yes: argv.includes("--yes") };
}

export function checkRunGuard({ dryRun, yes }) {
  if (dryRun) return null;
  if (!yes) {
    return "Refusing to write without --yes (or an interactive confirmation).";
  }
  return null;
}

export async function downloadPhoto(fetchImpl, url) {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      Referer: "https://hkscda.com/animals",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`not an image (${contentType || "no content-type"}) for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`image too large (${buffer.byteLength} bytes) for ${url}`);
  }
  return { bytes: buffer, contentType };
}

export function toCsv(rows) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const s = value == null ? "" : Array.isArray(value) ? value.join("|") : String(value);
    return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  };
  return [columns.map((c) => `"${c}"`).join(","), ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))].join("\n");
}

async function loadOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return new Map();
  const parsed = JSON.parse(await fs.readFile(OVERRIDES_FILE, "utf8"));
  return new Map(Object.entries(parsed));
}

async function main() {
  const { apply, yes } = parseArgs(process.argv.slice(2));
  const dryRun = !apply;

  const guard = checkRunGuard({ dryRun, yes });
  if (guard) {
    console.error(`✗ ${guard}`);
    process.exit(1);
  }

  const env = readEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    console.error("✗ VITE_SUPABASE_URL not set.");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exit(1);
  }
  const projectRef = extractProjectRef(supabaseUrl);
  console.log(`Target project: ${projectRef}${projectRef === PRODUCTION_PROJECT_REF ? " (PRODUCTION)" : ""}`);
  console.log(dryRun ? "Mode: DRY RUN — no changes will be made.\n" : "Mode: APPLY — writing to Supabase.\n");

  const sourceList = JSON.parse(await fs.readFile(LIVE_FILE, "utf8"));
  const overrides = await loadOverrides();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: animals, error } = await supabase
    .from("animals")
    .select("id, type, name, retired_at, image_url")
    .limit(5000);
  if (error) {
    console.error("✗ Could not read animals:", error.message);
    process.exit(1);
  }

  const deps = {
    downloadPhoto: (url) => downloadPhoto(fetch, url),
    async uploadPhoto(key, bytes, contentType) {
      const { error: uploadError } = await supabase.storage
        .from("animal-images")
        .upload(key, bytes, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("animal-images").getPublicUrl(key);
      return data.publicUrl;
    },
    async setImageUrl(animalId, url) {
      const { data, error: updateError } = await supabase
        .from("animals")
        .update({ image_url: url })
        .eq("id", animalId)
        .is("image_url", null)
        .select("id");
      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error(`animal ${animalId} already has an image or no longer exists`);
      }
    },
  };

  const { manifest, dbNotListed, summary } = await runBackfill({
    sourceList,
    animals: animals ?? [],
    overrides,
    dryRun,
    deps,
  });

  await fs.mkdir(path.dirname(MANIFEST_JSON), { recursive: true });
  await fs.writeFile(MANIFEST_JSON, `${JSON.stringify({ dryRun, summary, manifest, dbNotListed }, null, 2)}\n`, "utf8");
  const csvRows = [
    ...manifest.map((row) => ({ kind: "source", ...row })),
    ...dbNotListed.map((row) => ({
      kind: "db-not-listed",
      sourceId: "",
      type: row.type,
      name: row.name,
      status: "db-not-listed",
      animalId: row.animalId,
      candidates: [],
      image_url: row.image_url,
      error: null,
    })),
  ];
  await fs.writeFile(MANIFEST_CSV, `${toCsv(csvRows)}\n`, "utf8");

  console.log("Summary:", JSON.stringify(summary, null, 2));
  console.log(`\nManifest: ${MANIFEST_JSON}\n         ${MANIFEST_CSV}`);

  const failed = manifest.filter((row) => row.status === "failed");
  if (failed.length > 0) {
    console.error(`\n✗ ${failed.length} animal(s) failed to apply.`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/apply-hkscda-photos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-hkscda-photos.mjs scripts/apply-hkscda-photos.test.ts
git commit -m "feat(scripts): add gated hkscda photo backfill applier"
```

---

### Task 6: Wire scripts, retire the misleading tooling, ignore generated output

**Files:**
- Modify: `package.json` (the `scripts` block)
- Modify: `.gitignore`
- Create: `scripts/hkscda-photo-overrides.json`
- Modify: `scripts/scrape-hkscda.js`, `scripts/scrape-hkscda-animals.js`, `scripts/import-hkscda-animals.js` (add a superseded banner only)

**Interfaces:**
- Consumes: the CLIs from Tasks 3 and 5.
- Produces: `bun run scrape:hkscda` and `bun run backfill:animal-photos`.

- [ ] **Step 1: Update `package.json` scripts**

Change the two scraper entries to:

```json
"scrape:hkscda": "node scripts/scrape-hkscda-listing.mjs",
"backfill:animal-photos": "node scripts/apply-hkscda-photos.mjs",
```

Remove the `"import:hkscda": "node scripts/import-hkscda-animals.js"` entry.

- [ ] **Step 2: Ignore generated output**

Append to `.gitignore`:

```gitignore

# HKSCDA photo backfill output (generated; contains live production data)
data/hkscda-live.json
data/hkscda-photo-manifest.json
data/hkscda-photo-manifest.csv
```

- [ ] **Step 3: Add the overrides file**

Create `scripts/hkscda-photo-overrides.json`:

```json
{}
```

- [ ] **Step 4: Mark the old scripts superseded**

Add this banner directly under the opening docstring comment of each of `scripts/scrape-hkscda.js`, `scripts/scrape-hkscda-animals.js`, and `scripts/import-hkscda-animals.js`:

```js
// SUPERSEDED (2026-09-14): this targeted a URL/img shape hkscda.com does not
// use (it now uses /animal/id/<numeric> and CSS background images). Use
// scripts/scrape-hkscda-listing.mjs + scripts/apply-hkscda-photos.mjs instead.
```

- [ ] **Step 5: Verify the new commands are wired and the old ones are gone**

Run: `node -e "const s=require('./package.json').scripts; console.log(s['scrape:hkscda'], '|', s['backfill:animal-photos'], '|', s['import:hkscda'])"`
Expected: `node scripts/scrape-hkscda-listing.mjs | node scripts/apply-hkscda-photos.mjs | undefined`

- [ ] **Step 6: Run the whole script test set and the repo gates**

Run: `bun test scripts && bunx tsc --noEmit && bun run lint`
Expected: all script tests pass; typecheck and lint report no new errors.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore scripts/hkscda-photo-overrides.json scripts/scrape-hkscda.js scripts/scrape-hkscda-animals.js scripts/import-hkscda-animals.js
git commit -m "chore(scripts): wire hkscda photo backfill and retire superseded scrapers"
```

---

### Task 7: Run against production (operational, requires explicit approval)

**Files:** none — this is an approved operational run, not a code change.

**Interfaces:**
- Consumes: the CLIs from Tasks 3 and 5 and the production credentials in `.env.local`.

- [ ] **Step 1: Scrape the live listing**

Run: `bun run scrape:hkscda`
Expected: `Scraped <N> animals (<cats> cats, <dogs> dogs); <M> with a photo.` and `data/hkscda-live.json` written. (~228 animals at last check.)

- [ ] **Step 2: Dry-run the backfill**

Run: `bun run backfill:animal-photos`
Expected: prints `Target project: iihqjzilgawhfdhdevam (PRODUCTION)` and `Mode: DRY RUN`, then a summary with `pending-apply` ≈ 188, plus `skipped-already-imaged` ⊇ the 14 existing photos, and small `ambiguous` / `unmatched-live` counts. No writes; manifest written.

- [ ] **Step 3: Review the manifest for ambiguous/unmatched rows**

Open `data/hkscda-photo-manifest.json`; for any `ambiguous` or `unmatched-live` row that should map, add an entry to `scripts/hkscda-photo-overrides.json` (`"<sourceId>": "<animalId>"`) and re-run Step 2 until only accepted rows remain.

- [ ] **Step 4: Apply (only after the dry-run is accepted)**

Run: `bun run backfill:animal-photos --apply --yes`
Expected: `Mode: APPLY`; summary `applied` ≈ 188, `failed: 0`; non-zero exit if any row failed.

- [ ] **Step 5: Verify on the home page**

Run: `bun run dev`, open `http://localhost:8080`, and confirm the `等待一個家` band shows real cat and dog photos at 1440 and 390 widths, with the `暫未有相片` fallback still used by any animal without a photo. Optionally spot-check a returned URL returns HTTP 200 `image/jpeg`.

---

## Self-Review

**Spec coverage:**
- One-time backfill, production target, update existing rows, all matched animals, re-host, skip-existing/flag-ambiguous → Tasks 1, 4, 5, 7.
- Scrape fields and real markup selectors → Task 2.
- Match key `(type, normalizedName)`, retired exclusion, resolution order incl. override → Task 1.
- Deterministic storage key, 8 MB ceiling, `image_url IS NULL` write guard → Tasks 4, 5.
- Dry-run default, `--apply`/`--yes`, project-ref printing, no inserts/deletes → Task 5.
- Manifest with all statuses + db-not-listed + failed exit code → Tasks 4, 5.
- Cloudflare challenge detection / abort before write → Tasks 2, 3.
- Testing plan (matcher, parser, applier fakes, guard) → Tasks 1, 2, 3, 4, 5.
- Retire misleading tooling → Task 6.

**Placeholder scan:** none — every code step contains full code; every command has expected output.

**Type consistency:** `Source`, `Animal`, `MatchResult`, `STATUS`, `photoStorageKey`, `runBackfill` deps, and manifest `status` values are named identically across Tasks 1–5.

## Notes for the implementer

- `tsconfig.json` excludes `scripts/`, so `bunx tsc --noEmit` will not check these files; rely on `bun test` and keep imports `.mjs`-suffixed.
- Do not commit `data/hkscda-live.json` or the manifests — they are gitignored in Task 6.
- Task 7 writes to the live production database. Do not run Step 4 without explicit user approval.

---

## Increment: downscale and overwrite re-run

Context: the first production run applied 189 photos; 8 failed (5 over the 8 MB
bucket limit, 2 dead source references, 1 `mp4`). The user approved downscaling
every re-hosted photo to a small web image and re-running the whole match set with
an opt-in overwrite. Spec: see the "Increment 2026-09-14 (post-run)" section of
`docs/superpowers/specs/2026-09-14-hkscda-photo-backfill-design.md`.

Global constraints for this increment:
- `sharp` is a devDependency used only by `scripts/` code; it must never be imported from `src/`.
- Downscale target: long edge `1600`, JPEG quality `80`, never enlarge, honour EXIF orientation.
- Overwrite is opt-in via `--overwrite` and only takes effect with `--apply --yes`; the default never-overwrite behaviour must be unchanged.
- Only the `image_url` column is ever written.

### Task 8: Image downscaling module

**Files:**
- Create: `scripts/lib/hkscdaImage.mjs`
- Test: `scripts/lib/hkscdaImage.test.ts`
- Modify: `package.json` (add `sharp` devDependency)

**Interfaces:**
- Produces: `downscalePhoto(input: Buffer|Uint8Array, options?: { maxEdge?: number, quality?: number }): Promise<{ bytes: Buffer, contentType: "image/jpeg" }>`; `DEFAULT_MAX_EDGE = 1600`; `DEFAULT_QUALITY = 80`.

- [ ] **Step 1: Add the dependency and write the failing test**

Run: `bun add -d sharp`

Create `scripts/lib/hkscdaImage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { downscalePhoto } from "./hkscdaImage.mjs";

async function makeImage(width: number, height: number) {
  return await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

describe("downscalePhoto", () => {
  test("shrinks a large image to the long-edge cap and returns jpeg", async () => {
    const input = await makeImage(3000, 2000);
    const { bytes, contentType } = await downscalePhoto(input, { maxEdge: 1600 });
    expect(contentType).toBe("image/jpeg");
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe("jpeg");
  });

  test("does not enlarge a small image", async () => {
    const input = await makeImage(100, 80);
    const { bytes } = await downscalePhoto(input, { maxEdge: 1600 });
    const meta = await sharp(bytes).metadata();
    expect(`${meta.width}x${meta.height}`).toBe("100x80");
  });

  test("rejects an empty buffer", async () => {
    await expect(downscalePhoto(Buffer.alloc(0))).rejects.toThrow("empty image");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/lib/hkscdaImage.test.ts`
Expected: FAIL — cannot resolve `./hkscdaImage.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/hkscdaImage.mjs`:

```js
/**
 * Pure image downscaling for the hkscda.com photo backfill.
 * `sharp` is a dev-only dependency used by scripts; it is never imported by app code.
 */
import sharp from "sharp";

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_QUALITY = 80;

export async function downscalePhoto(input, { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = {}) {
  if (!input || input.byteLength === 0) throw new Error("empty image buffer");
  const bytes = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return { bytes, contentType: "image/jpeg" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/lib/hkscdaImage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock scripts/lib/hkscdaImage.mjs scripts/lib/hkscdaImage.test.ts
git commit -m "feat(scripts): add image downscaling for photo backfill"
```

### Task 9: Thread overwrite through the matcher and orchestration

**Files:**
- Modify: `scripts/lib/hkscdaMapping.mjs` (`matchSourceToAnimals` signature)
- Modify: `scripts/lib/hkscdaBackfill.mjs` (`runBackfill` signature)
- Test: `scripts/lib/hkscdaMapping.test.ts`, `scripts/lib/hkscdaBackfill.test.ts`

**Interfaces:**
- `matchSourceToAnimals(sourceList, animals, overrides = new Map(), options = {})` where `options.includeAlreadyImaged` (default `false`). When `true`, an already-imaged unique match or override resolves to `MATCHED`/`OVERRIDE` instead of `SKIPPED_ALREADY_IMAGED`.
- `runBackfill({ sourceList, animals, overrides = new Map(), dryRun = true, overwrite = false, deps })` passes `{ includeAlreadyImaged: overwrite }` to the matcher. Default behaviour unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/lib/hkscdaMapping.test.ts`:

```ts
test("includeAlreadyImaged matches an already-imaged unique record instead of skipping", () => {
  const results = matchSourceToAnimals(
    [source()],
    [animal({ image_url: "https://x/y.jpg" })],
    new Map(),
    { includeAlreadyImaged: true },
  );
  expect(results[0].status).toBe(STATUS.MATCHED);
  expect(results[0].animalId).toBe("id-1");
});

test("includeAlreadyImaged matches an already-imaged override", () => {
  const results = matchSourceToAnimals(
    [source()],
    [animal({ id: "id-1", image_url: "https://x/y.jpg" })],
    new Map([["5309", "id-1"]]),
    { includeAlreadyImaged: true },
  );
  expect(results[0].status).toBe(STATUS.OVERRIDE);
});
```

Add to `scripts/lib/hkscdaBackfill.test.ts`:

```ts
test("overwrite re-processes an already-imaged animal", async () => {
  const { deps, calls } = makeDeps();
  const result = await runBackfill({
    sourceList: [source()],
    animals: [animal({ image_url: "https://old/x.jpg" })],
    dryRun: false,
    overwrite: true,
    deps,
  });
  expect(result.manifest[0].status).toBe("applied");
  expect(calls.updates).toEqual(["id-1"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test scripts/lib/hkscdaMapping.test.ts scripts/lib/hkscdaBackfill.test.ts`
Expected: FAIL — the `options` / `overwrite` arguments are ignored, so statuses are `skipped-already-imaged`.

- [ ] **Step 3: Write the implementation**

In `scripts/lib/hkscdaMapping.mjs`, change the signature and the two `hasImage` branches:

```js
export function matchSourceToAnimals(sourceList, animals, overrides = new Map(), options = {}) {
  const { includeAlreadyImaged = false } = options;
```

Override branch:

```js
      } else if (hasImage(target) && !includeAlreadyImaged) {
        results.push({ source, status: STATUS.SKIPPED_ALREADY_IMAGED, animalId: target.id });
      } else {
        results.push({ source, status: STATUS.OVERRIDE, animalId: target.id });
      }
```

Unique-match branch:

```js
      results.push({
        source,
        status: hasImage(target) && !includeAlreadyImaged ? STATUS.SKIPPED_ALREADY_IMAGED : STATUS.MATCHED,
        animalId: target.id,
      });
```

In `scripts/lib/hkscdaBackfill.mjs`:

```js
export async function runBackfill({ sourceList, animals, overrides = new Map(), dryRun = true, overwrite = false, deps }) {
  const results = matchSourceToAnimals(sourceList, animals, overrides, { includeAlreadyImaged: overwrite });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test scripts/lib/hkscdaMapping.test.ts scripts/lib/hkscdaBackfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/hkscdaMapping.mjs scripts/lib/hkscdaBackfill.mjs scripts/lib/hkscdaMapping.test.ts scripts/lib/hkscdaBackfill.test.ts
git commit -m "feat(scripts): allow opt-in overwrite in photo backfill matching"
```

### Task 10: Downscale and `--overwrite` in the applier CLI

**Files:**
- Modify: `scripts/apply-hkscda-photos.mjs`
- Test: `scripts/apply-hkscda-photos.test.ts`

**Interfaces:**
- Consumes: `downscalePhoto` from `./lib/hkscdaImage.mjs`.
- Produces: `parseArgs(argv) => { apply, yes, overwrite }`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/apply-hkscda-photos.test.ts` inside the `parseArgs` describe:

```ts
  test("recognises --overwrite", () => {
    expect(parseArgs(["--apply", "--yes", "--overwrite"])).toEqual({
      apply: true,
      yes: true,
      overwrite: true,
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test scripts/apply-hkscda-photos.test.ts`
Expected: FAIL — `parseArgs` returns no `overwrite` key (`undefined`).

- [ ] **Step 3: Write the implementation**

In `scripts/apply-hkscda-photos.mjs`:

Add the import:

```js
import { downscalePhoto } from "./lib/hkscdaImage.mjs";
```

Change `parseArgs`:

```js
export function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    yes: argv.includes("--yes"),
    overwrite: argv.includes("--overwrite"),
  };
}
```

In `main`, read `overwrite` and pass it to both `runBackfill` calls:

```js
  const { apply, yes, overwrite } = parseArgs(process.argv.slice(2));
```

```js
  const plan = await runBackfill({ sourceList, animals: animals ?? [], overrides, dryRun: true, overwrite, deps });
```

```js
  const result = dryRun
    ? plan
    : await runBackfill({ sourceList, animals: animals ?? [], overrides, dryRun: false, overwrite, deps });
```

Downscale in the real download dependency (keep the pacing `finally`):

```js
    downloadPhoto: async (url) => {
      try {
        const download = await downloadPhoto(fetch, url);
        return await downscalePhoto(download.bytes);
      } finally {
        await sleep(DOWNLOAD_DELAY_MS);
      }
    },
```

Update `setImageUrl` so overwrite removes the null guard:

```js
    async setImageUrl(animalId, url) {
      let query = supabase.from("animals").update({ image_url: url }).eq("id", animalId);
      if (!overwrite) query = query.is("image_url", null);
      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error(`animal ${animalId} was not updated (already has an image or no longer exists)`);
      }
    },
```

Also update the `Mode:` line so the operator sees overwrite is active:

```js
  console.log(dryRun ? "Mode: DRY RUN — no changes will be made.\n" : `Mode: APPLY${overwrite ? " (OVERWRITE)" : ""} — writing to Supabase.\n`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test scripts/apply-hkscda-photos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-hkscda-photos.mjs scripts/apply-hkscda-photos.test.ts
git commit -m "feat(scripts): downscale photos and add overwrite re-run"
```

### Task 11: Downscale overwrite re-run against production (operational, requires explicit approval)

- [ ] **Step 1: Dry-run with overwrite**

Run: `bun run backfill:animal-photos --overwrite`
Expected: `Mode: DRY RUN`, `Planned:` shows ~224 to apply (all live matches including already-imaged), 3 unmatched-live-equivalent failures expected only at apply time.

- [ ] **Step 2: Apply**

Run: `bun run backfill:animal-photos --apply --yes --overwrite`
Expected: `Mode: APPLY (OVERWRITE)`; `applied` ≈ 224, `failed` = 3 (2 dead references, 1 video).

- [ ] **Step 3: Verify**

Spot-check a replaced URL is now small (`Content-Length` well under 1 MB) and returns `image/jpeg`; re-check the deployed homepage still shows `animal-images` references with no placeholders.

## Increment self-review

- Spec increment requirements (sharp dev-only, 1600/80, opt-in overwrite, only `image_url` written) → Tasks 8, 9, 10, 11.
- No placeholders: every step contains full code and expected output.
- Type consistency: `downscalePhoto`, `parseArgs`, `runBackfill({ overwrite })`, `matchSourceToAnimals(..., { includeAlreadyImaged })` are named identically across tasks.
