# CMS Wave 1C baseline evidence

Date: 2026-09-05 (Asia/Hong_Kong)

Checkout: `codex/completion-20260905` at `20c168459a90c5c92093659a18b139a994451470`.

Scope: fake-only reproduction of the create-time publish bypass and internal-media/public-storage gap. No provider, production database, or production Storage access was used.

## Commands and results

~~~text
git status --short --branch
## codex/completion-20260905...origin/main

git rev-parse HEAD
20c168459a90c5c92093659a18b139a994451470

bun test docs/evidence/cms-baseline-wave1-reproduction.test.ts
bun test v1.3.14 (0d9b296a)
0 pass / 2 fail / exit 1
~~~

Failure 1: a fake repository captured `status: "published"` from `createContent()` for a rescue story with no cover image or story profile. The containment expectation was `draft`; actual was `published`.

Failure 2: after creating an `internal` story update in the fake repository, `createUploadTarget()` resolved a signed target for `content-1/internal-medical-note.jpg`. The containment expectation was rejection before signing; the promise resolved and the signing fake was called.

## Current source boundary

- `contentInputSchema` permits `draft | published | archived`, with `draft` only as the default when status is omitted (`src/lib/content/schemas.ts:71`).
- `createContent()` parses the request and forwards it directly to `repo.createContent()`; it never calls `validatePublishableContent()` (`src/lib/content/service.ts:218`).
- `updateContent()` and `publishContent()` do call `validatePublishableContent()` for a published candidate (`src/lib/content/service.ts:232`, `src/lib/content/service.ts:344`).
- `createUploadTarget()` validates MIME/size/path and the `${contentId}/` prefix only, then calls `repo.createSignedUploadUrl()` (`src/lib/content/service.ts:322`).
- The browser upload helper sends only `objectPath`, `mimeType`, and `byteSize`; it does not send the intended `storyUpdateId` (`src/components/admin/content/contentMediaUpload.ts:3`).
- `createContentMedia()` receives `storyUpdateId` only after the object upload and does not resolve or inspect the update visibility (`src/lib/content/service.ts:302`).
- `content-media` is explicitly public, and public reads bypass object retrieval access checks for a known URL (`supabase/migrations/20260831160000_content_media_storage_bucket.sql:14`).

## Proposed Wave 1C containment boundary

1. Enforce draft-only creation in `createContent()` after schema parsing and before the repository call. Normalize status to `draft` (and `publishedAt` to `null`) or reject an explicit non-draft status with a stable 400 response. The master plan says “require creation as a draft”; the missing CMS companion should choose normalize-versus-reject and the exact response contract before implementation.
2. Carry the intended nullable `storyUpdateId` in the upload-target request. In `createUploadTarget()`, resolve a supplied update with `repo.getStoryUpdate()`, require that it belongs to `contentId`, and reject `visibility === "internal"` before `createSignedUploadUrl()` can run.
3. Repeat the ownership/visibility check in `createContentMedia()` as defense in depth. This second check cannot replace the pre-signing check because registration happens after upload and would leave the internal object anonymously readable.
4. Keep `storyUpdateId: null` public/cover media working during containment. Do not change bucket privacy, move/delete existing objects, or attempt historical remediation in Wave 1C.
5. Map the new internal-media rejection to an explicit 400 in `withContentErrors()` and show a clear temporary limitation in `ContentEditor`; server rejection remains authoritative.

Implementation was initially deferred because `2026-09-05-hkscda-cms-completion.md` had not yet been supplied.

## Wave 1C implementation evidence

The CMS companion was subsequently supplied. The approved containment contract rejects explicit non-draft creation rather than silently normalizing it.

~~~text
bun test src/lib/content/service.test.ts src/components/admin/content/contentMediaUpload.test.ts docs/evidence/cms-baseline-wave1-reproduction.test.ts
25 pass / 7 fail / exit 1

bun test src/lib/content/service.test.ts src/lib/content/http.test.ts src/components/admin/content/contentMediaUpload.test.ts src/components/admin/content/ContentEditor.test.tsx docs/evidence/cms-baseline-wave1-reproduction.test.ts
51 pass / 0 fail / exit 0

bun test src/lib/content src/components/admin/content/ContentEditor.test.tsx src/components/admin/content/contentMediaUpload.test.ts
113 pass / 0 fail / exit 0
~~~

Implemented containment:

- `createContent()` rejects every explicit non-draft status before repository mutation; HTTP maps the error to 400. Omitted status still defaults to draft.
- Upload-target requests now carry the intended nullable story-update ID. The service resolves it before signing, verifies content ownership, and rejects internal updates.
- Media registration repeats the same visibility and ownership check before repository mutation.
- Content-level/public media (`storyUpdateId: null`) and public-update media remain supported.
- The editor disables internal updates in the attachment selector and explains the temporary limitation in Traditional Chinese.

Targeted ESLint initially found one Prettier layout error in `ContentEditor.tsx`; it was corrected. The pre-existing Fast Refresh warning for the exported upload helper remains. Full typecheck was attempted but was temporarily blocked by parse errors in the concurrently edited `src/components/site/Header.tsx`, outside CMS ownership; root integration verification must rerun it after frontend work stabilizes.

Containment does not make draft media private, retract existing public URLs, or implement recoverable upload sessions. Those remain Package 2 work behind the private-session/public-copy state machine and authorized migration allocation.
