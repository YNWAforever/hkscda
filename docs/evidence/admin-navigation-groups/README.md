# Admin navigation grouping — review evidence

Candidate branch: `feat/admin-navigation-groups`, based on main `8aabbf5` (merged volunteer operations centre PR #121). Design approved in this task. This candidate has not been merged or deployed.

## Delivered

- Global sidebar changes from 25 administrator / 20 staff links to six work domains. Treasurer sees only Donations & sponsorship and System settings. Each domain opens an allowed destination; payment-method settings remain available to staff/treasurer under the existing role matrix.
- Animals share a heading, breadcrumb, explanation and Cat / Dog / Sponsorship tabs. Search, status, archived visibility and pagination are validated URL state; each tab retains independent state and browser back/forward restores it.
- Adoption, finance, content and system pages expose their original destinations through contextual navigation. Volunteer operations retain the existing internal workspace, with an operations/internships selector.
- Mobile menu closes after successful navigation and focuses the heading. Cancelling an unsaved volunteer-policy navigation preserves both the draft and drawer. Language switching and sidebar collapse remain available.
- Explicit allowed animal columns replace the legacy wildcard catalogue read. This fixes a reproduced 403 against the existing column-boundary migration without changing grants, RLS, private notes, canonical records or queries' species/sponsorship scope.
- Browser-discovered accessibility fixes associate animal form controls with labels, name role selectors, allow keyboard access to report/status tables, and connect status tabs to their panel. Animal row actions have 44px touch targets.

## Verification

- `bun run test:acceptance:all`: **2,413 passed, 0 failed**, 7,938 assertions across 409 files. Dedicated local test runner; final pass after source fixes.
- `bun run typecheck`: passed.
- `bun run lint`: **0 errors, 44 existing warnings**.
- `bun run build`: passed.
- `BASE_URL=http://127.0.0.1:56336 bun run verify:brand`: passed, **26 routes across five viewports**. This is a public-page regression check, not production acceptance or a performance audit.
- [browser.json](browser.json): **110 page/role/viewport checks** and **five interactive journeys**, all passing. Admin/staff/treasurer; desktop 1440 and mobile 390. No serious/critical axe violations, page exceptions, reported API failures or document overflow in final retained checks.
- Interactive journeys cover independent animal searches, back/forward, clear filters, mobile global menu/focus, keyboard link activation, bilingual labels and cancelled/accepted global navigation from an unsaved volunteer policy.
- Independent static review: no open material findings; breadcrumb/description and accessibility follow-ups resolved.

Reproduce browser checks (PowerShell):

```powershell
$env:ADMIN_NAV_LOCAL_VERIFY='1'
node scripts/verify-admin-navigation.mjs
```

Requires the existing ignored local credential/session files, dedicated Supabase API **56321** / DB **56322**, and app **56336**. The script confirms synthetic `@example.invalid` identities, blocks nonlocal browser requests and browser mutations; local session refresh sends no email. `ADMIN_NAV_PATH` accepts comma-separated route fragments or `journeys-only` for targeted runs, stored separately. Retained evidence combines the initial broad run with the affected-page rechecks after fixes. Initial animal loading captures were replaced by loaded-state checks.

Representative local screenshots (synthetic fixtures, not real animal replacements):

- [Desktop animals](1440-admin-section-cat.jpg)
- [Mobile animals](390-admin-section-cat.jpg)
- [Desktop volunteer integration](1440-volunteers.jpg)
- [Mobile volunteer integration](390-volunteers.jpg)

## Known existing limitation

The existing animal list archive/unarchive action still writes `retired_at` directly through the browser. Migration `20260913071632_animal_public_column_boundary.sql` revokes authenticated UPDATE, so that legacy action is currently rejected. The publication API supports read/save/preview/copy/publish but has no audited retirement command; unpublishing is not equivalent to retirement. This navigation candidate does not widen grants or claim the archive action is repaired. Creating the corresponding audited server command remains a separate functional repair. Existing edit links lead to the authorized publication read/save workflow.

No production records, payments, messages or attendance were used as mutation fixtures. No application identity, photography, canonical IDs or history were replaced.

## Migration, release and rollback

**No migration, grant change or migration-ledger operation.** The suspected local grant issue was checked against the authoritative migration; no grant repair was performed. Existing migration history remains intact.

This branch adds UI/navigation/read compatibility changes only. Rollback is a source revert of this PR, followed by the normal reviewed deployment; there is no data rollback or migration replay. Reverting would also restore the prior wildcard-read incompatibility, so keep the explicit-column fix if reverting navigation independently. Production merge/deployment requires separate release approval. The linked Vercel project automatically deploys merges to main.
