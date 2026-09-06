# Legacy Animal Profiles Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the independent tasks below.

**Goal:** Deliver the approved information-first cat/dog catalogue using reviewed legacy profile data.
**Architecture:** Add one allowlisted public_profile object to animals; parse and project it at public read boundaries. Existing species identity/membership and application workflows remain authoritative. Frontend consumes one typed profile contract; private Python staging prepares the data patch and review holds.
**Tech Stack:** TanStack Start/React19, strict TypeScript, Zod, Supabase Postgres, Bun tests, offline PostgreSQL and Playwright.

## Global Constraints

- Existing isolated checkout, branch codex/legacy-animal-profiles-20260907; preserve prior operational evidence and tmp/backups.
- Public profile shape: code:string|null, birthday:YYYY-MM-DD|null, neutered:boolean|null, suitability:newbie|experienced|null, personality:string|null, health:string|null, story:string|null, recordDate:YYYY-MM-DD|null.
- Store only these keys in public_profile; never raw legacy rows. React renders approved plain text. Health/personality/story require text review; phones/email/staff/internal remarks stay private.
- Missing profile is compatible with pre-migration rows; all fields normalize to null. No failed-request fallback that drops retirement/eligibility protections.
- Query filters are q:string, neutered:all|yes|no|unknown, suitability:all|newbie|experienced|unknown in addition to existing age/gender/page. Defaults preserve old URLs. All filtering occurs before pagination.
- Keep 100 cats/108 dogs absent a separately approved data change. No main merge/deploy or new production profile migration/write in this implementation approval.
- Compact cards, three/two/one responsive columns, real small portraits and modest labelled no-photo state. Existing brand tokens, no synthetic animal photos, one h1.

## Task 1 — Public contract, schema and projection (central owner)

Files: src/types/animal.ts; src/lib/animals/publicProfile.ts and .test.ts; publicListing.server.ts; publicAnimal.functions.ts; CLI-generated animal_public_profile migration; scripts/ci/supabase-fixture.mjs.

- [x] Add optional Animal.public_profile of the exact profile shape above (nullable properties).
- [x] Write failing tests for unknown-key exclusion, invalid dates, nullable neutering, future birthday, deterministic age, internal notes removed and missing-profile compatibility.
- [x] Implement parsePublicAnimalProfile(value:unknown):AnimalPublicProfile and projectPublicAnimal(animal:Animal, now=()=>new Date()):Animal. Explicitly construct the outgoing Animal fields, set notes/notes_en null, sanitize the profile, and derive age only from a valid nonfuture birthday. Use Hong Kong date boundaries and injected clock.
- [x] Wire both listing and detail readers through projectPublicAnimal. Existing filters continue at SQL boundary; a migration adds public_profile jsonb NOT NULL DEFAULT '{}' with type/allowed-key validation. No production apply.
- [x] Add populated/unknown profiles to the CI fixture without changing expected catalogue totals; retain safe missing-photo examples.
- [x] Run bun test src/lib/animals/publicProfile.test.ts, typecheck and offline migration/constraint tests; review this task.

## Task 2 — Cards, details and filter flow (frontend owner)

Files: src/components/site/AnimalCard.tsx, AnimalDetail.tsx, AnimalGrid.tsx, AnimalListingPage.tsx and colocated tests; src/routes/animals/cat.tsx,dog.tsx; src/lib/animals/publicListing.ts, publicListing.functions.ts and tests; src/styles.css (scoped new catalogue styles).

- [x] Write failures for code/profile rendering, no private notes, photo failure/no-photo, unknown facts, preserved shortlist intent; filters q/neutered/suitability across multiple pages.
- [x] Extend PublicAnimalListingInput with optional q/neutered/suitability filter values specified above; filter name/code case-insensitively and exact nullable profile facts before slicing.
- [x] Wire URL search validation/defaults through server inputs to listing/grid controls. Reset page on filter changes, retain other filters, add clear actions and accessible empty recovery. q length max80; whitespace-only means no search.
- [x] Build compact cards using existing design tokens. Show code/name/gender/age/neutering/suitability/personality; real portrait or labelled no-photo state. Do not use legacy notes as public summary. Render reviewed profile sections on details and preserve both intents/routes.
- [x] Verify focused rendering/filter/route tests, typecheck and scoped lint; review this task.

## Task 3 — Private legacy projection and release patch (data owner)

Files: scripts/legacy-import/public_profiles.py and test_public_profiles.py; private ignored profile candidate/holds; aggregate docs/evidence/legacy-import-20260906/profile-projection.json.

- [x] Tests: 'null'/missing neutering stays unknown, 0 is false, suitable_for only known values, valid dates, unsafe text held, no private key copied, stable ID/source hash matches applied 248.
- [x] Project only approved structure from the existing private SQLite snapshot using deterministic canonical IDs. Date fields normalized; code validated; detailed text stays held for public review until explicitly cleared. Keep a per-field private review manifest and aggregate coverage.
- [x] Prepare an idempotent guarded/audited local patch; rehearse against offline production-shaped animals with the new migration, force failure/rollback and repeat checks. Do not write production.
- [x] Run Python tests, review redaction/provenance and record exact allowed/held counts.

## Task 4 — Integrated acceptance and release candidate (central owner)

- [x] Review all task diffs; fix material findings.
- [x] Full bun test --isolate, Python suite, typecheck, lint, production fixture build.
- [x] Browser verify cat/dog listing and detail, 390/768/1440 widths, filters/clear/back navigation, missing photos, shortlist and keyboard; run existing brand/a11y/performance checks without loosening thresholds.
- [x] Save measured failing-before/passing-after and screenshots in development-completion-evidence.md; document staging/profile publication and production gates separately.
- [x] Commit only related code and evidence. Present the release candidate; no production schema/data/deployment claims.
