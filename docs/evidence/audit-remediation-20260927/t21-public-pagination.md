# T21 · PERF-01 and CONTENT-02 public animal listing

Draft PR #155, source commit 8352adfaa88ed6655f906571bb9c7397ec3f7329, stacked on T19 PR #154. Code-complete and schema-ready only; neither deployed nor operationally enabled.

## Reproduction and implementation

The previous server listing fetched every public animal in batches of 1,000, then applied age, photo, name/code, neutering and suitability filters in memory before slicing. The 10k fixture transferred 4,787,800 uncompressed JSON bytes through 11 local DB calls to return one 25-card page. A red isolated DB test first failed because the page RPC did not exist. A second red age test showed an unrelated year in free text was classified as senior. The strict normalizer now accepts explicit month/year formats and plain numeric years; unrecognized text remains unknown. Twelve to 95 months are adult, 96+ months senior. Existing birthday facts override raw age using the Hong Kong date.

Migration 20260927143710_public_animal_listing_page.sql adds a generated stored public_age_band with automatic additive backfill, two partial listing indexes, and a security-invoker public_animal_listing_page(jsonb) RPC. It checks membership, published state, available/fostered status, archival, species/sponsorship eligibility, age, gender, photo, name/code, neutering and suitability before exact count and stable created_at/id pagination. The public result contains card summaries, no notes or draft path. Anon/authenticated execution is explicitly granted; the private normalizer remains uncallable by anon. The cat, dog, sponsor and homepage server functions now use the one-RPC path; the obsolete all-row listing reader was removed. Missing RPC is an error, not a hidden all-fetch fallback.

Cards reserve 4:3 dimensions; the first visible listing and featured image loads eagerly, other cards and gallery images stay lazy. Public animal-image URLs can obtain 360/720/1080-width responsive variants only when VITE_PUBLIC_IMAGE_TRANSFORMS is explicitly true and the URL belongs to the configured Supabase public animal-images bucket. The default is false because Supabase Storage image transformations require an enabled paid plan; no transformation service was invoked. Private draft and foreign-host URLs never receive variants, and a failing transformed variant falls back to its original public URL. The live thumbnail bandwidth gain is therefore not claimed yet.

## Isolated acceptance

The full migration was first executed inside BEGIN/ROLLBACK, then applied only to disposable DB 127.0.0.1:57322 without forging the migration ledger. Later function edits were individually rollback rehearsed before disposable-only replacement. Exact checksum: e2320e10dc29949dacb218ddd46ff28ad6afb3e3bdc865a1416e5306487a518d. The rollback-only fixture inserts 1k then 10k synthetic animals, compares page total and IDs with the prior pure JS filter, checks reverse stable order, sponsor species, birthday precedence, draft/adopted exclusion, anon execution/private note denial and the public/private function grants. One DB test passed 20 assertions. The local catalog checker reported 86 required objects compatible, zero issues. SSR and adapter tests verified dimensions/priority and one RPC call. The CI read-only API fixture now returns the new RPC shape; its Node fixture test passed, including second-page count and omission of private notes. Final full suite: 2,829 pass, 87 skip, zero fail; typecheck, lint and build each exit 0.

Thirty warm measurements against the same 10k synthetic rows, same loopback DB and client:
| Path | p50 | p95 | Uncompressed JSON bytes | DB calls |
|---|---:|---:|---:|---:|
| Previous full-row batch read plus JS filtering | 269.26 ms | 1478.72 ms | 4,787,800 | 11 |
| Candidate DB page/count/summary | 19.81 ms | 77.06 ms | 15,285 | 1 |

This is a DB/client microbenchmark, not Hong Kong browser latency, cold starts or a deployed preview. Results are machine- and fixture-specific. Browser screenshots, mobile keyboard checks and provider-paid transformed thumbnail delivery are not-run. Read-only production aggregate check saw 248 published visible candidates, 201 strict year strings, 46 strict month strings, zero numeric-only strings and 247 date-shaped birthdays; no row was edited. This aggregate is a dry-run classification estimate, not a data-bearing migration rehearsal.

## Release and rollback

Inspect the exact production catalog, row counts and index/build lock estimates. Rehearse generated-column table rewrite and backfill, exact count/search query plans and backup/restore on a sanitized data-bearing clone before approved DDL. Deploy schema before app; old app continues selecting its existing columns with the additive schema. New app requires the RPC. Code rollback retains the generated column, indexes and RPC; do not drop them or alter historical data just to roll back code. The paid transform flag remains false until the project plan, quota and owner approve it. No production migration, region switch, image transformation, payment or public preview occurred.
