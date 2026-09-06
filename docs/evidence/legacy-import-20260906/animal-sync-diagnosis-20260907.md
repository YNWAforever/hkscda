# Animal synchronization diagnosis — 2026-09-07

Read-only investigation. No production records/assets or synchronization settings changed.

Confirmed live Supabase project iihqjzilgawhfdhdevam has 44 animals: cats 26 available + 1 fostered, dogs 13 available + 1 adopted, sponsors 2 available + 1 fostered. All 44 have empty/null image_url and source_url. The earlier 5,144 legacy animal records and 1,142 matched photo links remain private local staging; no production animal import was executed by the preparation tools.

PR #108 is now merged (2026-09-06T16:04:49Z); origin/main is fdfe562 at this inspection. That PR shipped tooling and evidence, not automatic execution of a data import. Its CI checks passed. Public routes read Supabase via publicListing functions; they do not read the local SQLite staging database or downloaded photos.

The older scraper starts at https://hkscda.com/animal/ rather than the three current supplied listing URLs. The older importer accepts only animalType cat/dog and writes those types. The sponsor page explicitly requests type sponsor; the legacy SQL instead represents sponsorship membership with is_inside_support_pool on cat/dog records. These models require explicit mapping, preserving animal identity across adoption and sponsorship views.

No scheduled animal synchronization was found in the inspected Vercel config or GitHub workflows; package.json exposes manual scrape/import commands. This is an inspected-repository finding, not proof about every external scheduler.

Do not run the old importer blindly: it defaults unknown statuses to available, defaults missing gender to female, can continue without an idempotent source key, uses index-based public photo paths and assembles operational remarks into public notes. These behaviors conflict with the safe legacy-import requirements.

Source live cat/dog/sponsor pages each returned HTTP 403 to the web reader. Chrome inspection could not start because the local browser tool reported an ACL helper error. Exact current old-site entry counts and item-by-item parity were therefore not measured.

Next implementation scope: a reviewed private-to-public animal projection with explicit adoption/sponsorship eligibility; stable legacy IDs and target collision resolution; privacy-safe photo publication; full-list reconciliation and rollback. Unknown status codes stay preserved rather than guessed. Production import/publication still requires a concrete candidate and explicit approval under the standing release restriction.
