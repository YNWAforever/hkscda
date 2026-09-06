# Legacy animal profiles and cat/dog catalogue redesign

Status: approved by the user on 2026-09-07; implementation and local acceptance are tracked in the companion plan. Production release remains separately gated.

## Recommendation and alternatives

Recommend compact, information-first animal cards. A large-photo gallery would leave most adoption cards empty: only one of 208 adoption animals has an available matched photo. A table is efficient for staff but less inviting and harder to browse on mobile. Compact cards balance legibility, warmth and the actual source coverage.

## Page design

Keep the site's existing Chinese-first brand, warm neutral surfaces and accessible contrast. Use a compact introduction with cat/dog tabs and accurate result counts. Display three cards per row on wide screens, two on medium screens and one on mobile. Avoid the current oversized repeated animal-icon area. Use a small real portrait when present and a clearly labelled, modest no-photo treatment otherwise.

Each card shows the legacy animal code, name, gender, age calculated from a valid birthday, recorded neutering status, suitability for first-time/experienced adopters, and a short approved personality summary. Keep missing values explicit as 未有記錄; the literal legacy null neutering value is unknown, never false. Show adoption/sponsorship eligibility independently and retain one canonical animal identity. Keep 查看詳細資料 and the existing shortlist action; preserve existing routes and application flows.

Filters: name/code search, age, gender, recorded neutering and adopter experience suitability. Filter the entire public eligible set before pagination and keep filters in the URL. Show an active-filter summary, clear action, empty-state recovery and accessible page navigation. Unknown values remain searchable/filterable without invented labels. Default ordering stays deterministic; any use of legacy seq must be explicitly validated instead of claiming exact legacy-site order.

## Detail content

Present a real photo when available and a clear identity/facts panel. Below it, show personality, care/health needs, and the animal's story only where the source text passes public-content review. Never write an invented personality or fill missing descriptions with generic claims. Health notes are animal care context and must not become medical advice. Include the legacy record date when displaying time-sensitive facts.

Source coverage among 248 canonical animals: code/name/gender248, birthday247, personality192, health notes177, story93, description35, suitability248 (newbie172/experienced76). Neutering: recorded yes173/no59/unknown16. Among adoption animals, personality text exists for 79 cats and 84 dogs. These are field-presence counts, not publication approval for raw text.

## Public/private boundary and data flow

Create an explicit allowlisted public profile projection rather than sending complete legacy rows to the browser. Code, birthday, neutering and suitability need source-to-target validation. Review personality, health and story text for personal contact data, staff names, internal comments and unsafe markup before publication; holds remain private. Never publish raw remarks, cage/current location, creator, volunteer names, chip identifiers, costs, private attachments or uninterpreted status letters. Store legacy provenance privately and render approved plain text only.

Coordinate any additive schema and shared type changes centrally. Populate reviewed profile fields only after migration and restore checks. Preserve current animal IDs, membership flags and linked history. Record data/audit writes atomically. Do not merge or deploy the redesign without the user's production release authorization.

## Error handling and acceptance

Public fetch errors must be distinguishable from a genuinely empty catalogue. Handle photo errors without layout shifts or unrelated images. Preserve the one-h1 page structure. Regression evidence must cover valid/unknown field mapping, safe text projection, all filters before pagination, preserved shortlist intent, empty/missing-photo cards and retired-record exclusion. Browser verification must include both species, small/wide screens, populated and empty filters, keyboard navigation and existing brand/accessibility/performance checks. Confirm 100 adoption cats and 108 adoption dogs are still the public totals absent a separately authorized data change.

## Rollout

Photo upload is an independently authorized completed operation. The redesign proceeds only after this design is approved: implementation plan, isolated changes and tests, preview review, then a separately authorized release. Photo coverage remains limited by supplied files; never substitute historical animal photos for current records merely to fill the layout.
