# Home-page animal photo backfill from hkscda.com

Status: approved by the user on 2026-09-14; ready for an implementation plan.
Production writes remain gated behind an explicit `--apply` run.

## Problem

The homepage `FeaturedAnimals` band only shows animals that have a photograph
(`src/lib/animals/featuredSelection.ts`), because at the 2026-09-11 audit only 14
of 248 unarchived animals had an `image_url`. In production today 292 animals
exist and only 14 carry a photo — all of them
`content-media/legacy-animals/<sha>.jpeg`. The rest render the "暫未有相片"
placeholder, so a first-time visitor sees an almost empty band on the page whose
job is to make them want to meet an animal.

The live organisation site `https://hkscda.com` lists its adoptable animals with
photographs. We want to scrape those photographs one time and map them onto the
existing production animal records so the homepage and the full cat/dog directory
show real pictures.

## What the source actually is

`hkscda.com` is a server-rendered legacy site (Bootstrap/jQuery), not a SPA.

- Listings: `/animals/cat` (8 pages) and `/animals/dog` (7 pages), paginated with
  `?page=N`. Verified 228 unique live animals (120 cats, 108 dogs).
- Each card is `<a href="/animal/id/<numericId>">` containing
  `background-image:url('/HKSCDA/storage/app/public/animals/<token>.jpeg')` and
  `名字: <name>`, `性別: <gender>`, `年齡: <age>`.
- Detail page `/animal/id/<N>` exposes the same photo as `<img id="m-img">` plus
  `#m-gender`, `#m-age`, `#m-personality_description`, `#m-health_description`,
  `#m-suitable_for`, `#m-arrival_source`, `#m-has_chip`, `#m-is_castrated`,
  `#m-remarks`. It displays no animal code.
- Photos resolve and download: `https://hkscda.com/HKSCDA/storage/app/public/animals/<token>.jpeg`
  returns HTTP 200 `image/jpeg`.

### Why the existing tooling is wrong

- `scripts/scrape-hkscda-animals.js` discovers `/animals/cat/<uuid>` detail links
  and `<img>` tags. The real site uses `/animal/id/<numericId>` (singular,
  numeric) and CSS background images, so it extracts nothing usable.
- `scripts/scrape-hkscda.js` looks for `/animals/cat` cards with `<img>` and a
  `名字/性別/年齡` label, and writes `data/hkscda_animals.json`. The tracked
  fixture's detail URLs are this app's `/animals/cat/<uuid>` pattern (all 404 on
  the real site), so it was produced against a local app, not the live site.
- `scripts/import-hkscda-animals.js` inserts or updates animal rows from that
  fixture. We do not want to create animals; we want to attach photos to rows
  that already exist.

### Production facts that shape the design

- `animals` has 292 rows: 234 active with no `image_url`, 14 with one.
- 188 of the 228 live animals match a production row by exact `(type, name)`.
- No stored exact key links the numeric id to `animals.id`: `source_url` is empty
  on every row, `uuid5('hkscda:legacy:v1:animals:<n>')` matches nothing, and
  `import_private` is not exposed to PostgREST. Some rows carry
  `public_profile.code` (e.g. `C3674`, `D137`), but the live HTML does not show it.
- The public `animal-images` bucket exists and is empty
  (`20260911130000_animal_images_bucket.sql`).
- `.env.local` resolves to the production project `iihqjzilgawhfdhdevam` and has a
  `SUPABASE_SERVICE_ROLE_KEY`.

## Decisions

- One-time backfill (not a recurring sync).
- Target is the **live production** Supabase project.
- **Update existing** animal records; do not create rows.
- Populate **all matched** animals, not only the four featured ones.
- **Re-host** photo bytes in Supabase; do not hotlink `hkscda.com`.
- **Skip** rows that already have a photo and **flag** ambiguous matches.

## Architecture

```
scripts/scrape-hkscda-listing.mjs   fetch + parse live listings -> data/hkscda-live.json
scripts/lib/hkscdaMapping.mjs       pure normalise + match        (unit-tested)
scripts/apply-hkscda-photos.mjs     download + upload + update     (dry-run default)
scripts/hkscda-photo-overrides.json optional sourceId -> animalId
```

- **Scraper**: static fetch, no browser. Fetches `/animals/{cat,dog}?page=N` until
  a page yields no cards, parses cards with the real selectors
  (`a[href="/animal/id/<N>"]`, `background-image:url('...')`, `名字/性別/年齡`),
  and writes the normalised source list. Paced requests, browser-like
  `User-Agent` and `Referer`, one retry on 5xx/timeout. Detail pages are visited
  only when a card has no background image. If a Cloudflare challenge is detected,
  stop before any write with a clear message (the existing headed Playwright path
  is the documented fallback).
- **Matcher**: pure module — `normalizeName()` and `matchSourceToAnimals()` — no
  network and no Supabase import, so it is fully testable.
- **Applier**: loads the source list and the production rows, resolves matches,
  downloads and uploads photos, updates `image_url`, and writes the manifest.
  `--dry-run` is the default.
- **Retire the misleading tooling**: replace the `scrape:hkscda` / `import:hkscda`
  package scripts with the correct ones and mark the old files superseded so they
  are not run by mistake.

## Scrape fields

Per live animal: `sourceId` (numeric), `type` (`cat`|`dog`), `name`, `gender`,
`age`, `photoPath`, `detailUrl`. Listing and detail photos are the same file, so
the listing photo is authoritative; the detail page is a fallback only.

## Mapping rules

Match key is `(type, normalizedName)` against production rows where
`retired_at IS NULL`.

Normalisation: NFKC, trim, collapse inner whitespace, casefold Latin. No fuzzier
matching (no substring/partial), which would wrongly merge `雪雪` and `Snow 雪雪`.

Resolution, in order:

1. **Manual override** — `hkscda-photo-overrides.json` maps `sourceId` to
   `animalId` and wins outright.
2. **Unique active match** — apply.
3. **Multiple active matches** — `ambiguous`; skip and record.
4. **No match** — `unmatched`; skip and record.
5. **Match already has `image_url`** — `skipped-already-imaged`; never overwrite.

### Explicit non-goals, made visible in the manifest

- The ~40 live animals with no DB row (new arrivals, e.g. 肥黑, COICOI) are not
  created; recorded as `unmatched-live`.
- The ~47 active DB animals no longer listed on the live site keep their
  placeholder; recorded as `db-not-listed`.

## Storage and write path

- **Download** each matched photo from `https://hkscda.com<photoPath>` with the
  browser-like `User-Agent` and `Referer: https://hkscda.com/animals/<type>`;
  require `Content-Type: image/*`, and reject anything over 8 MB (the
  `animal-images` bucket's `file_size_limit`); pace ~400 ms.
- **Upload** to the public `animal-images` bucket at the deterministic key
  `hkscda/<sourceId>.<ext>`, where `ext` comes from the response content type
  (`jpeg`→`jpg`, else `png`/`webp`), `upsert: true`, then `getPublicUrl()`.
  Deterministic keys keep re-runs idempotent and preserve the external source id
  as provenance.
- **Update** `animals.image_url` only `WHERE id = <animalId> AND image_url IS NULL`,
  so the write cannot clobber the 14 existing photos.

### Safety gates

- `--dry-run` default; no download, upload, or write without `--apply`.
- On `--apply`, print the resolved project ref (`iihqjzilgawhfdhdevam`) and the
  match counts, then require explicit confirmation before the first write. This is
  the deliberate inverse of `import-hkscda-animals.js`, which refuses production.
- No inserts, no deletes, no field other than `image_url`.
- Collected per-animal failures produce a non-zero exit if any matched animal
  failed to apply.

## Reporting, errors and verification

Manifest `data/hkscda-photo-manifest.{json,csv}`, one row per live animal and per
DB animal, with `status` in `applied` · `skipped-already-imaged` · `ambiguous` ·
`override` · `unmatched-live` · `db-not-listed` · `failed`. A summary is printed.

- Fetch/challenge failure: abort before any write, non-zero exit.
- Download/upload/update failure: mark `failed`, continue, retry once on
  transient errors.
- Dry-run never uploads or writes.

Acceptance after `--apply`: `selectFeaturedAnimals()` yields at least 2 cats and
2 dogs; a sample of new `image_url`s returns HTTP 200 `image/jpeg`; a real cat and
dog photo render in `FeaturedAnimals` at 1440 and 390 widths; the empty-state
fallback still shows for any photo-less animal.

## Testing

- `scripts/lib/hkscdaMapping.test.ts` (`bun:test`): normalisation, unique match,
  ambiguous duplicates, retired exclusion, already-imaged skip, override
  precedence, no-match.
- Parser test against a saved listing-page HTML fixture (no network).
- Applier test with a dependency-injected fake Supabase/storage and fake fetcher:
  asserts updates are limited to `image_url IS NULL`, keys are deterministic, and
  each manifest status is recorded.
- Guard test: dry-run never uploads or updates.

Gates before handoff: `bun test`, `bunx tsc --noEmit`, `bun run lint`.

## Out of scope

- Creating animals for new arrivals, or retiring DB animals missing from the live
  site.
- A recurring sync; adding a `source_animal_id` column; backfilling exact legacy
  ids — revisit only if an exact key becomes available.
- Scraping personality/health/story text (a separate content review decision).

## Increment 2026-09-14 (post-run): downscale and overwrite re-run

The first production run applied 189 photos. Eight failed: five sources exceeded
the 8 MB bucket limit (8.4–10.3 MB), two listing/detail references 404 (the site
stores a filename with no usable extension), and one card points at an `mp4`.

Decision (approved by the user on 2026-09-14): downscale every re-hosted photo to
a small web image and re-run the whole match set with an opt-in overwrite, rather
than raising the bucket limit.

- **New devDependency `sharp`.** Script-only; it is never imported by application
  code, so it cannot reach the Vite bundle or a Vercel function.
- **`scripts/lib/hkscdaImage.mjs`** — `downscalePhoto(buffer, { maxEdge = 1600,
  quality = 80 })` returns `{ bytes, contentType: "image/jpeg" }` via
  `rotate()` (EXIF) → `resize({ fit: "inside", withoutEnlargement: true })` →
  `jpeg({ quality, mozjpeg: true })`. Verified: a 9 MB 4000×3000 source becomes
  ~270 KB at 1200×1600.
- **Applier** downscales each downloaded photo before upload. The storage key
  stays deterministic (`hkscda/<sourceId>.jpg`), so re-runs overwrite the same
  object and the DB `image_url` is unchanged for rows already pointing there.
- **Overwrite mode.** `--overwrite` (only meaningful with `--apply --yes`) makes
  the matcher stop skipping already-imaged animals and lets the DB update run on
  rows that already have an `image_url`. This is a deliberate, explicit relaxation
  of the "never overwrite" invariant: without the flag the original behaviour is
  unchanged. Only the `image_url` column is ever written.
- **Expected re-run result:** 224 applied, 3 unrecoverable (2 dead source
  references, 1 video). The five formerly-oversized sources now fit.
