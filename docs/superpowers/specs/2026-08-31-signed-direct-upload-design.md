# Signed Direct-to-Storage Upload for Adoption Photos & Sponsorship Payment Proof

**Date:** 2026-08-31
**Status:** Approved in conversation; awaiting written-spec review
**Priority:** Urgent — likely fixes an active production bug, not just a planned improvement

## Summary

Replaces the current server-relayed file upload for two public forms — adoption application photos and sponsorship pledge payment proof — with a signed direct-to-Storage upload flow. This is BP-5 work per `docs/superpowers/plans/2026-08-27-public-layout-integration-v4.md` §8 ("signed direct-to-Storage adoption photo upload"), but investigation found it isn't just a planned efficiency improvement: the current implementation is very likely actively broken in production for real submissions.

## Current Context and the Bug

Both `src/lib/publicAdoption/submission.server.ts` and `src/lib/sponsorship/submission.server.ts` accept a single `multipart/form-data` POST containing a JSON `payload` field plus raw file bytes (up to 6 photos for adoption, one proof image for sponsorship), then relay those bytes through the server to Supabase Storage via `client.storage.from(bucket).upload(path, file)`.

Both domains cap individual files at 8 MiB (`MAX_PHOTO_BYTES` / `MAX_PROOF_BYTES = 8 * 1024 * 1024`). This repo deploys to Vercel (`vercel.json`, Nitro `vercel` preset, confirmed Node.js serverless functions, Hobby plan). **Vercel serverless functions have a hard, non-configurable 4.5 MB request body limit** — a request exceeding it never reaches application code; Vercel returns `413 FUNCTION_PAYLOAD_TOO_LARGE` at the platform level ([Vercel docs](https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE), [limits](https://vercel.com/docs/functions/limitations)).

A single adoption photo or sponsorship proof image at or near the allowed 8 MiB maximum — an entirely ordinary size for a modern phone camera photo — exceeds that 4.5 MB limit on its own, before accounting for the JSON payload or any additional photos. **This means real users submitting realistically-sized photos are very likely hitting silent submission failures today.** This was not verified by actually submitting a test application to production (that would pollute the real adoption/sponsorship pipeline with fake data), but the combination of Vercel's documented hard platform limit and this codebase's own size constants is strong evidence.

## Approved Decisions

- **One shared mechanism, both flows.** Adoption photos and sponsorship payment proof have the identical underlying bug (multipart relay through a body-size-limited serverless function) and the identical fix shape. Building this once as a small shared module and applying it to both, rather than fixing adoption alone and leaving sponsorship broken.
- **Signed upload URLs, not RLS policy changes.** Supabase Storage's `createSignedUploadUrl()` authorizes a specific write via the token itself, not a standing RLS grant. Both buckets (`adoption-application-photos`, `sponsorship-payment-proof`) stay exactly as locked-down as they are today (private, staff-only read policy, no public write policy) — nothing gets broadened.
- **A fresh, server-minted ID stands in for the not-yet-created row.** Since the real `adoption_applications`/sponsorship pledge row doesn't exist until final submission, the upload-URL-minting endpoint generates a fresh random UUID (`crypto.randomUUID()`, never client-supplied) used both as the Storage path prefix and later as the explicit primary key on the final insert. A client can't target another draft's folder because it never gets to choose this ID.
- **Verify, don't trust, at final submission.** Before inserting `adoption_application_photo`/the sponsorship proof metadata row, the server confirms each referenced Storage object actually exists (path, size, content-type) instead of trusting the client's claim that upload succeeded. This is stricter than today's flow and, as a side benefit, means a failed/missing upload is caught before any database row is created — no post-insert cleanup needed for this failure mode (unlike today's `cleanupFailedPersistence`, which exists to unwind a partially-completed multi-table insert).
- **Existing multi-step wizard UX and field validation are unchanged.** Only the transport mechanism for file bytes changes — from "attached to the final multipart POST" to "uploaded directly to Storage as soon as selected, tracked with per-file pending/uploading/done/failed state, submitted-by-reference at the end."
- **Cleanup of abandoned uploads is explicitly out of scope.** A user who uploads photos and never finishes the form leaves orphaned objects in a private bucket at negligible cost. A scheduled cleanup job can be added later without touching this flow's contract — not built now, to ship the actual bug fix quickly.

## Architecture

Two new small, rate-limited, Turnstile-verified endpoints (matching every other public POST that accepts user-triggered input, per `CLAUDE.md`'s security invariants):

- `POST /api/adoption/applications/photo-upload-urls` — accepts up to 6 photo descriptors (`{ category, fileName, mimeType, sizeBytes }`, same shape `validatePhotoDescriptor` already validates today), returns a fresh `applicationId` plus one signed upload URL/token per descriptor.
- `POST /api/sponsorships/pledges/proof-upload-url` — sponsorship's proof is optional and singular (confirmed: it only ever attaches at initial pledge creation via `POST /api/sponsorships/pledges`; there is no separate "add proof later" public endpoint), so this mints exactly one signed URL plus a fresh `pledgeId`.

A new shared module, `src/lib/publicUploads/signedUpload.server.ts`, holds the bucket-agnostic Storage interaction so it isn't duplicated between the two domains:

```ts
export async function createSignedUploadUrls(
  client: SupabaseClient,
  bucket: string,
  draftId: string,
  descriptors: Array<{ category: string; fileName: string }>,
): Promise<Array<{ category: string; path: string; signedUrl: string; token: string }>>

export async function verifyUploadedObjects(
  client: SupabaseClient,
  bucket: string,
  expected: Array<{ path: string; sizeBytes: number; mimeType: string }>,
): Promise<{ ok: true } | { ok: false; missing: string[] }>
```

Each domain keeps its own descriptor validation (`validatePhotoDescriptor` for adoption, `validateProofDescriptor` for sponsorship) and calls this shared helper rather than reimplementing Storage calls twice.

The browser uploads directly to Supabase Storage using the returned signed URL/token via the Supabase JS client (`uploadToSignedUrl`) — this traffic goes straight to Supabase, never touching the Vercel function, so the 4.5 MB limit is structurally irrelevant to it regardless of file size (up to the bucket's own 8 MiB `file_size_limit`, unchanged).

Both existing submission endpoints (`POST /api/adoption/applications`, `POST /api/sponsorships/pledges`) drop multipart parsing entirely for a plain JSON body: `{ payload: {...}, applicationId/pledgeId: <from step 1>, photos/proof: [{ category, fileName, mimeType, sizeBytes, storagePath }] }` — no file bytes, comfortably under 4.5 MB regardless of how many photos or how large the originals were. `persistPublicAdoptionJourney` and the sponsorship equivalent replace their `.upload()` calls with `verifyUploadedObjects()`, then proceed with the explicit pre-allocated ID on the row insert instead of letting Postgres default it.

## Error Handling

Signed upload tokens get an explicit ~2-hour expiry (generous for a multi-step form). If an upload fails (network error, expired token), the client re-requests a fresh signed URL for just that one file and retries — no need to restart the whole flow or re-upload files that already succeeded. If final submission references a photo/proof that isn't actually present in Storage, the pre-insert verification step rejects the submission with a clear validation error (reusing the existing `SubmissionValidationError` pattern) before any database row is created.

Abuse of the upload-URL-minting endpoints (requesting many signed URLs without ever submitting) is bounded by the existing rate-limit convention and the bucket's file-size/MIME-type limits; true cleanup of long-abandoned orphaned objects is the explicitly-deferred follow-up noted above.

## Testing

- Unit tests for `createSignedUploadUrls`/`verifyUploadedObjects` against a fake Storage client (missing object, size/content-type mismatch, happy path).
- Updated tests for `persistPublicAdoptionJourney` and the sponsorship equivalent reflecting verify-instead-of-upload, including the pre-allocated-ID insert path.
- New tests for both upload-url endpoints: rate-limit behavior, Turnstile verification, descriptor validation, correct response shape.
- Updated client-side tests for `PhotoUploader`/`photoUploaderLogic.ts` (adoption) and the sponsorship pledge form's proof-upload UI, covering per-file upload state and retry.
- Given this touches real file storage, a real end-to-end check against the actual `adoption-application-photos`/`sponsorship-payment-proof` buckets in a local dev session (mint a real signed URL, upload a real test file, confirm it lands correctly with the right path/metadata, clean it up afterward) — not just unit tests against fakes, matching this repo's established real-infrastructure-verification standard for anything touching Postgres/Storage directly.

## Out of Scope

- Cleanup of abandoned/orphaned uploaded objects (flagged as a follow-up).
- Any redesign of the wizard's steps, fields, or visual layout — only the file-upload transport changes.
- The admin-side sponsorship payment-proof review flow (`sponsorshipAdmin`, already a separate, working, already-shipped system) — untouched.
- Any change to the 8 MiB per-file size cap or bucket MIME-type restrictions — those stay as they are.
