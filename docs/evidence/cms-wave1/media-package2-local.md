# CMS Package 2 local checkpoint

Implementation checkpoint, not database/storage execution proof. No migration applied and no external object copied/deleted. No commit or deployment.

## Implemented

- Migration `20260905155426_content_private_media_sessions.sql`: server-owned private upload sessions, parent-version locking, active child ownership, finalize payload replay conflict, immutable SHA-256 reference, draft revision and audit in the same transaction. Internal attachments remain private and cannot be covers.
- `mediaLifecycle.server.ts` and `mediaLifecycle.repository.server.ts`: signed private targets; actual downloaded byte length, allowed MIME signature, SHA-256 verification; authorized five-minute previews; selected-revision public-copy preparation and deterministic non-overwriting copy recovery; pointer update last.
- Shared `private.validate_content_publication_snapshot` in lifecycle migration is called by preparation and final publication. Failed content/profile/map validation precedes all preparation rows and public copy. Preparation uses the publication idempotency lock, rejects changed payload and stale unfinished retries, and avoids recopies for completed replay.
- `service.ts`, `http.server.ts`, `repository.server.ts`, admin handlers and new media-preview/media-finalize routes wire the private service. Admin hydration signs private media; public snapshot reads materialize ready copies without mutating saved snapshots.
- `ContentEditor.tsx` sends expectedVersion for authoring, selected revision plus stable publish key, private session IDs for finalization, and caches a successfully uploaded file's session while metadata finalization is retried. Full dirty/conflict/revision UX and bounded revision pagination remain Package 3/4.
- `scripts/reconcile-content-media.ts`: inventory-only, count-only dry run. Protects all revision references, publication assets, active sessions and objects younger than 24 hours. No live inventory collected; apply is explicitly rejected pending separately authorized remediation.

## Evidence

- Preparation safeguard red: 9 pass / 1 fail (shared validation absent); green: 18 pass / 0 fail / 5 skipped across lifecycle SQL safeguards, media SQL safeguards, DI media tests and gated media integration.
- Broader CMS/editor/reconciliation run: 145 pass / 20 skipped / 1 fail. Failure was existing `adultCatCopy.test.ts` tracked-file scan timeout (25.39 seconds against five-second limit), not an observed media assertion regression.
- `bunx tsc --noEmit`: exit 0 after root route generation.
- CMS/editor/reconciliation ESLint: zero errors, one existing component-export fast-refresh warning in ContentEditor.
- `mediaLifecycle.integration.test.ts` requires explicit loopback SQL+Storage URLs without query/hash routing overrides, service key and opt-in disposable fixtures. Cases include known private URL anonymous denial, signed preview, finalize replay/conflict, invalid preparation creating zero assets, and pre-copy publish denial. Not executed: local database/storage configuration absent. No concurrency, RLS or Storage runtime claim.
- Migration source search for `on storage.objects` found only bucket-scoped receipt/adoption/sponsorship policies; none grants broad anonymous/authenticated CMS-private access. Actual deployed policies remain an execution gate.

## Limits and review scope

Image verification is length, signature and immutable hash; it does not fully decode/re-encode pixels. Public object creation is an explicitly requested valid selected-revision publication step; a later copy/readiness failure retains the old database pointer. Prepared successful copies may remain publicly reachable and are retained by reconciliation. No cleanup applies automatically.

Independent backend review is required before Package 3. Generated routes remain root-owned. Exact Package 2 additions: mediaLifecycle.server.ts, mediaLifecycle.repository.server.ts, mediaLifecycle.test.ts, mediaLifecycle.sql.test.ts, mediaLifecycle.integration.test.ts, reconcile-content-media.ts/.test.ts, private-media migration, two media routes, this evidence file. Shared CMS file changes are listed above and lifecycle.sql.test.ts was adjusted to inspect the shared validator.


Actual integrated browser acceptance completed on 2026-09-05T19:20:39Z:11 scenarios passed, zero pageerrors, synthetic fixtures cleaned. See `browser-acceptance-local.md` for executed coverage, prior red/green findings, and explicitly scoped local CSP/network transport accommodations.
