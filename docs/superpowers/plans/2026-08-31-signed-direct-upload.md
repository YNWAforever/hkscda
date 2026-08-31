# Signed Direct-to-Storage Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a very likely-active production bug — adoption application photos and sponsorship payment-proof uploads exceed Vercel's hard 4.5MB serverless function body limit — by replacing server-relayed multipart uploads with signed direct-to-Supabase-Storage uploads for both flows.

**Architecture:** A new shared module mints signed Storage upload URLs and verifies uploaded objects exist; the browser uploads file bytes directly to Supabase Storage (never touching the Vercel function); both submission endpoints switch from multipart to plain JSON bodies referencing already-uploaded paths.

**Tech Stack:** TanStack Start (SSR React 19 + TanStack Router), Supabase Storage + Postgres, Zod, Bun test runner.

---

## Reference: source spec

Full rationale in `docs/superpowers/specs/2026-08-31-signed-direct-upload-design.md`. Read it if anything below is unclear.

**One deliberate simplification from the spec, noted here for transparency:** the spec's error-handling section describes retrying just the one failed file with a freshly-minted URL. This plan implements a coarser but simpler and equally-working retry: `uploadAllPhotos`/`uploadProofDirectly` throw on the first failure, and the existing "click submit again" path re-requests fresh signed URLs and re-uploads everything (not just the failed file). Given the urgency of shipping this fix, per-file retry granularity is not built now — it's a real UX polish opportunity, not a correctness gap, and can be added later without changing this plan's contracts.

---

### Task 1: Shared signed-upload module

**Files:**
- Create: `src/lib/publicUploads/signedUpload.server.ts`
- Create: `src/lib/publicUploads/signedUpload.server.test.ts`

- [ ] **Step 1: Write `signedUpload.server.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type SignedUploadDescriptor = {
  category: string;
  fileName: string;
};

export type SignedUploadResult = {
  category: string;
  path: string;
  signedUrl: string;
  token: string;
};

export type ExpectedUploadedObject = {
  category: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
};

export type VerifyUploadResult = { ok: true } | { ok: false; missing: string[] };

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "file";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function createSignedUploadUrls(
  client: SupabaseClient,
  bucket: string,
  draftId: string,
  descriptors: SignedUploadDescriptor[],
): Promise<SignedUploadResult[]> {
  const results: SignedUploadResult[] = [];
  for (const descriptor of descriptors) {
    const path = `${draftId}/${descriptor.category}/${safeFileName(descriptor.fileName)}`;
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;
    if (!data) throw new Error(`Missing signed upload data for ${path}`);
    results.push({
      category: descriptor.category,
      path: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  }
  return results;
}

export async function verifyUploadedObjects(
  client: SupabaseClient,
  bucket: string,
  expected: ExpectedUploadedObject[],
): Promise<VerifyUploadResult> {
  const missing: string[] = [];
  for (const item of expected) {
    const lastSlash = item.path.lastIndexOf("/");
    const folder = lastSlash === -1 ? "" : item.path.slice(0, lastSlash);
    const fileName = lastSlash === -1 ? item.path : item.path.slice(lastSlash + 1);

    const { data, error } = await client.storage.from(bucket).list(folder, { search: fileName });
    if (error) {
      missing.push(item.path);
      continue;
    }

    const match = (data ?? []).find((entry) => entry.name === fileName);
    if (!match) {
      missing.push(item.path);
      continue;
    }

    const metadata = match.metadata as { size?: number; mimetype?: string } | null;
    if (metadata?.size !== item.sizeBytes || metadata?.mimetype !== item.mimeType) {
      missing.push(item.path);
    }
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}
```

- [ ] **Step 2: Write `signedUpload.server.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import { createSignedUploadUrls, verifyUploadedObjects } from "./signedUpload.server";

function fakeStorageClient({
  signedUrlData,
  signedUrlError,
  listData,
  listError,
}: {
  signedUrlData?: { path: string; signedUrl: string; token: string };
  signedUrlError?: unknown;
  listData?: Array<{ name: string; metadata: { size: number; mimetype: string } | null }>;
  listError?: unknown;
} = {}) {
  return {
    storage: {
      from: () => ({
        createSignedUploadUrl: mock(async () => ({
          data: signedUrlData ?? null,
          error: signedUrlError ?? null,
        })),
        list: mock(async () => ({ data: listData ?? [], error: listError ?? null })),
      }),
    },
  } as never;
}

describe("createSignedUploadUrls", () => {
  test("builds a path per descriptor and returns the signed URL data", async () => {
    const client = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    });
    const results = await createSignedUploadUrls(client, "adoption-application-photos", "draft-1", [
      { category: "home", fileName: "photo.jpg" },
    ]);
    expect(results).toEqual([
      { category: "home", path: "draft-1/home/photo.jpg", signedUrl: "https://x/y", token: "tok" },
    ]);
  });

  test("sanitizes unsafe characters out of the file name", async () => {
    const client = fakeStorageClient({
      signedUrlData: { path: "draft-1/home/weird_name.jpg", signedUrl: "u", token: "t" },
    });
    await createSignedUploadUrls(client, "bucket", "draft-1", [
      { category: "home", fileName: "weird name!@#.jpg" },
    ]);
    const fromMock = client.storage.from("bucket");
    expect(fromMock.createSignedUploadUrl).toHaveBeenCalledWith("draft-1/home/weird_name.jpg");
  });

  test("throws when the signed URL request errors", async () => {
    const client = fakeStorageClient({ signedUrlError: new Error("boom") });
    await expect(
      createSignedUploadUrls(client, "bucket", "draft-1", [{ category: "home", fileName: "a.jpg" }]),
    ).rejects.toThrow("boom");
  });
});

describe("verifyUploadedObjects", () => {
  test("returns ok when every object exists with matching metadata", async () => {
    const client = fakeStorageClient({
      listData: [{ name: "photo.jpg", metadata: { size: 100, mimetype: "image/jpeg" } }],
    });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: true });
  });

  test("reports a path as missing when list returns no matching entry", async () => {
    const client = fakeStorageClient({ listData: [] });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });

  test("reports a path as missing when size or mimetype don't match", async () => {
    const client = fakeStorageClient({
      listData: [{ name: "photo.jpg", metadata: { size: 999, mimetype: "image/jpeg" } }],
    });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });

  test("reports a path as missing when the list call itself errors", async () => {
    const client = fakeStorageClient({ listError: new Error("network") });
    const result = await verifyUploadedObjects(client, "bucket", [
      { category: "home", path: "draft-1/home/photo.jpg", sizeBytes: 100, mimeType: "image/jpeg" },
    ]);
    expect(result).toEqual({ ok: false, missing: ["draft-1/home/photo.jpg"] });
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/lib/publicUploads/signedUpload.server.test.ts` — expect PASS, all 7 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/publicUploads/signedUpload.server.ts src/lib/publicUploads/signedUpload.server.test.ts
git commit -m "feat: add shared signed-upload helper for direct-to-storage uploads"
```

---

### Task 2: Adoption — upload-URL endpoint

**Files:**
- Create: `src/routes/api/adoption/applications/photo-upload-urls.ts`
- Create: `src/routes/api/adoption/applications/photo-upload-urls.test.ts`

- [ ] **Step 1: Write the route**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validatePhotoDescriptor } from "../../../../lib/publicAdoption/schemas";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../../lib/security/turnstile.server";

export const ADOPTION_PHOTO_BUCKET = "adoption-application-photos";
const MAX_PHOTOS_PER_REQUEST = 6;

const requestSchema = z.object({
  turnstileToken: z.string().optional(),
  photos: z
    .array(
      z.object({
        category: z.unknown(),
        fileName: z.unknown(),
        mimeType: z.unknown(),
        sizeBytes: z.unknown(),
      }),
    )
    .min(1)
    .max(MAX_PHOTOS_PER_REQUEST),
});

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/adoption/applications/photo-upload-urls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "adoption-photo-upload-urls",
          max: 10,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
        }

        try {
          const parsed = requestSchema.parse(body);
          if (!(await verifyTurnstile(parsed.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const descriptors = parsed.photos.map((photo) => validatePhotoDescriptor(photo));
          const applicationId = crypto.randomUUID();
          const client = createSupabaseServiceClient();
          const uploads = await createSignedUploadUrls(
            client,
            ADOPTION_PHOTO_BUCKET,
            applicationId,
            descriptors,
          );

          return jsonNoStore({ applicationId, uploads }, { status: 201 });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return jsonNoStore({ error: "Invalid photo upload request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore({ error: "Could not create upload URLs" }, { status: 500 });
        }
      },
    },
  },
});
```

- [ ] **Step 2: Write the test**

```ts
import { describe, expect, mock, test } from "bun:test";

describe("photo-upload-urls route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./photo-upload-urls");
    expect(Route.options.server?.handlers?.POST).toBeDefined();
  });
});
```

Note: this route wires real dependencies (`createSupabaseServiceClient`, `enforceRateLimit`, `verifyTurnstile`) directly rather than through an injectable factory, matching the existing `/api/adoption/applications` route's own convention (see `src/routes/api/adoption/applications.ts`) — no `createHandlers()` factory exists there either. Deeper behavioral testing of the request-validation/signed-URL-minting logic happens indirectly through `signedUpload.server.test.ts` (Task 1) and the manual end-to-end verification (Task 8). If you want deeper route-level coverage without a real database, extract the handler body into a testable function first — but that's a larger refactor than this bug-fix plan's scope; don't do it unless asked.

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/routes/api/adoption/applications/photo-upload-urls.test.ts` — expect PASS.
Run: `bunx tsc --noEmit` — if it complains the new route isn't in `routeTree.gen.ts`, run `bun run dev` briefly to regenerate it, stop it, re-check.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/adoption/applications/photo-upload-urls.ts src/routes/api/adoption/applications/photo-upload-urls.test.ts src/routeTree.gen.ts
git commit -m "feat: add adoption photo signed-upload-URL endpoint"
```

---

### Task 3: Adoption — submission endpoint switches to JSON + verify

**Files:**
- Modify: `src/lib/publicAdoption/submission.server.ts`
- Modify: `src/lib/publicAdoption/submission.server.test.ts`
- Modify: `src/routes/api/adoption/applications.ts`

- [ ] **Step 1: Replace multipart parsing with JSON parsing in `submission.server.ts`**

Read the current file first (`src/lib/publicAdoption/submission.server.ts`) — you're replacing `validateAdoptionSubmissionRequestHeaders`, `parseAdoptionMultipart`, and the upload portion of `persistPublicAdoptionJourney`, while keeping everything else (`cleanupFailedPersistence`, `sendAdoptionConfirmationEmail`, `isSubmissionValidationError`, the various `to*Insert` imports from `./schemas`) untouched.

Remove `validateAdoptionSubmissionRequestHeaders` and `parseAdoptionMultipart` entirely (JSON bodies don't need multipart content-type/size header validation the same way — `ADOPTION_MULTIPART_MAX_BYTES`/`isFile` become dead code, remove them too). Replace with:

```ts
export type UploadedPhotoReference = {
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type AdoptionSubmissionRequestBody = {
  payload: unknown;
  applicationId: string;
  photos: UploadedPhotoReference[];
  turnstileToken?: string;
};

export function parseAdoptionSubmission(body: unknown): ParsedAdoptionMultipart & {
  applicationId: string;
} {
  if (typeof body !== "object" || body === null) {
    throw new SubmissionValidationError("Invalid adoption application request body");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.applicationId !== "string" || !raw.applicationId) {
    throw new SubmissionValidationError("Missing adoption application id");
  }

  const parsed = expandedAdoptionApplicationSchema.parse(raw.payload);
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined;

  if (!Array.isArray(raw.photos) || raw.photos.length === 0) {
    throw new SubmissionValidationError("At least one adoption photo is required");
  }
  if (raw.photos.length > MAX_ADOPTION_PHOTOS) {
    throw new SubmissionValidationError("No more than 6 adoption photos can be uploaded");
  }

  const photos: ParsedAdoptionPhoto[] = raw.photos.map((entry) => {
    const descriptor = validatePhotoDescriptor(entry as never);
    const storagePath = (entry as { storagePath?: unknown }).storagePath;
    if (typeof storagePath !== "string" || !storagePath) {
      throw new SubmissionValidationError("Missing storage path for an adoption photo");
    }
    return { ...descriptor, storagePath } as unknown as ParsedAdoptionPhoto;
  });

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    photos,
    applicationId: raw.applicationId,
  };
}
```

`ParsedAdoptionPhoto` changes shape — it used to carry `file: File`, now it carries `storagePath: string` instead. Update its type definition near the top of the file:

```ts
export type ParsedAdoptionPhoto = AdoptionPhotoDescriptor & {
  storagePath: string;
};
```

(Remove the old `file: File` field from this type entirely — nothing after this task needs it.)

- [ ] **Step 2: Replace the upload loop in `persistPublicAdoptionJourney` with a verify call**

Add the import at the top:

```ts
import { verifyUploadedObjects } from "../publicUploads/signedUpload.server";
```

Replace the photo-upload loop (the `for (const photo of parsed.photos) { ... client.storage.from(ADOPTION_PHOTO_BUCKET).upload(...) ... }` block) with:

```ts
    const verification = await verifyUploadedObjects(
      client,
      ADOPTION_PHOTO_BUCKET,
      parsed.photos.map((photo) => ({
        category: photo.category,
        path: photo.storagePath,
        sizeBytes: photo.sizeBytes,
        mimeType: photo.mimeType,
      })),
    );
    if (!verification.ok) {
      throw new SubmissionValidationError(
        `Uploaded photo not found: ${verification.missing.join(", ")}`,
      );
    }

    const photoRows = parsed.photos.map((photo) => ({
      public_application_id: applicationId,
      storage_bucket: ADOPTION_PHOTO_BUCKET,
      storage_path: photo.storagePath,
      file_name: photo.fileName,
      mime_type: photo.mimeType,
      size_bytes: photo.sizeBytes,
      photo_category: photo.category,
    }));
```

Since verification now happens *before* any row is inserted, `uploadedPaths`/the storage-cleanup half of `cleanupFailedPersistence` is no longer reachable for this failure mode — but leave `cleanupFailedPersistence` and the `uploadedPaths` array as they are (harmless, `uploadedPaths` will just always stay empty from this code path now — removing it is unnecessary scope creep for a bug-fix plan). Do NOT remove `cleanupFailedPersistence`'s storage-removal branch; it stays dead-but-harmless infrastructure, not a regression.

- [ ] **Step 3: Use the pre-allocated `applicationId` on insert**

Find where `persistPublicAdoptionJourney` inserts into `adoption_applications`:

```ts
    const summaryInsert = toAdoptionApplicationSummaryInsert(parsed.payload);
    const application = requireNoError(
      await client.from("adoption_applications").insert(summaryInsert).select("id").single(),
      "Failed to save adoption application",
    ) as { id: string } | null;
    if (!application?.id) throw new Error("Missing adoption application id");
    applicationId = application.id;
```

Replace with:

```ts
    const summaryInsert = { id: parsed.applicationId, ...toAdoptionApplicationSummaryInsert(parsed.payload) };
    requireNoError(
      await client.from("adoption_applications").insert(summaryInsert).select("id").single(),
      "Failed to save adoption application",
    );
    applicationId = parsed.applicationId;
```

`PersistPublicAdoptionJourneyInput`'s `parsed: ParsedAdoptionMultipart` field type needs widening to include `applicationId` — change it to `parsed: ParsedAdoptionMultipart & { applicationId: string }` in the type definition near the top of the file.

- [ ] **Step 4: Update `submission.server.test.ts`**

Read the current test file first. Every test that builds a `FormData`/multipart request and calls `parseAdoptionMultipart` needs to instead build a plain object and call `parseAdoptionSubmission`. Every test that mocks `client.storage.from(...).upload(...)` for `persistPublicAdoptionJourney` needs to instead mock `client.storage.from(...).list(...)` (matching `verifyUploadedObjects`'s shape from Task 1) to return a matching object, and pass `parsed.photos` entries with `storagePath` instead of `file`. Add a new test: `persistPublicAdoptionJourney` throws `SubmissionValidationError` when `verifyUploadedObjects` reports a missing photo, and that no `adoption_applications` row insert is attempted in that case (assert the insert mock was never called). Add a test for `parseAdoptionSubmission`: rejects a body missing `applicationId`, rejects more than 6 photos, rejects a photo missing `storagePath`, accepts a valid body.

- [ ] **Step 5: Update the route**

Rewrite `src/routes/api/adoption/applications.ts`'s POST handler:

```ts
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "adoption",
          max: 5,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
        }

        try {
          const parsed = parseAdoptionSubmission(body);
          if (!(await verifyTurnstile(parsed.payload.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const client = createSupabaseServiceClient();
          const coordinatorRepo = createSupabaseAdoptionCoordinatorRepository(client);
          const coordinatorService = createAdoptionCoordinatorService({ repo: coordinatorRepo });
          const result = await persistPublicAdoptionJourney({
            client,
            parsed,
            coordinatorService,
          });

          await sendAdoptionConfirmationEmail(client, parsed.payload, result);

          return jsonNoStore(
            {
              applicationId: result.applicationId,
              reference: result.reference,
              statusUrl: result.statusUrl,
            },
            { status: 201 },
          );
        } catch (error) {
          if (isSubmissionValidationError(error)) {
            return jsonNoStore({ error: "Invalid adoption application request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore(
            { error: "Adoption application could not be created" },
            { status: 500 },
          );
        }
      },
```

Update the import line to bring in `parseAdoptionSubmission` instead of `parseAdoptionMultipart`/`validateAdoptionSubmissionRequestHeaders`. The header-validation call and its `if (!headerValidation.ok)` branch are removed entirely — there's no multipart size/content-type header to check anymore, `request.json()` failing is the only header/body-shape failure mode now, handled by the try/catch above.

- [ ] **Step 6: Run tests, typecheck**

Run: `bun test src/lib/publicAdoption/submission.server.test.ts src/routes/api/adoption/applications.test.ts` — expect PASS. Run `bunx tsc --noEmit` — expect no errors, this specifically catches any leftover reference to removed types/functions (`parseAdoptionMultipart`, `ParsedAdoptionMultipart`'s old `file` field shape, `validateAdoptionSubmissionRequestHeaders`, `ADOPTION_MULTIPART_MAX_BYTES`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/publicAdoption/submission.server.ts src/lib/publicAdoption/submission.server.test.ts src/routes/api/adoption/applications.ts
git commit -m "feat: switch adoption application submission to JSON with pre-uploaded photo references"
```

---

### Task 4: Adoption — client-side direct upload

**Files:**
- Modify: `src/components/site/adoption/photoUploaderLogic.ts`
- Modify: `src/components/site/adoption/PhotoUploader.tsx`
- Modify: `src/components/site/adoption/ApplicationWizard.tsx`
- Modify (or create, check first): `src/components/site/adoption/PhotoUploader.test.tsx` / `photoUploaderLogic.test.ts`

- [ ] **Step 1: Add an upload-state type and a direct-upload function to `photoUploaderLogic.ts`**

Read the current file first. Add:

```ts
export type PhotoUploadStatus = "idle" | "uploading" | "done" | "error";

export type SelectedPhoto = {
  id: string;
  category: AdoptionPhotoCategory;
  file: File;
  status: PhotoUploadStatus;
  storagePath?: string;
  errorMessage?: string;
};
```

(This widens the existing `SelectedPhoto` type with upload-tracking fields — update `validateSelectedFile`'s returned `photo` object to include `status: "idle" as const`.)

Add a new function that requests one signed URL and uploads one file, to be called per-photo from the wizard:

```ts
import { getSupabaseClient } from "../../../lib/supabase";

export async function uploadPhotoDirectly(
  photo: SelectedPhoto,
  applicationId: string,
  signedUrl: { path: string; token: string },
): Promise<{ ok: true; storagePath: string } | { ok: false; message: string }> {
  const client = getSupabaseClient();
  const { error } = await client.storage
    .from("adoption-application-photos")
    .uploadToSignedUrl(signedUrl.path, signedUrl.token, photo.file, {
      contentType: photo.file.type,
    });
  if (error) {
    return { ok: false, message: "上傳失敗，請重試。" };
  }
  return { ok: true, storagePath: signedUrl.path };
}
```

- [ ] **Step 2: Add an orchestration function that requests URLs then uploads all photos**

Still in `photoUploaderLogic.ts`:

```ts
export type PhotoUploadUrlsResponse = {
  applicationId: string;
  uploads: Array<{ category: string; path: string; signedUrl: string; token: string }>;
};

export async function requestPhotoUploadUrls(
  photos: SelectedPhoto[],
  turnstileToken: string | null,
): Promise<PhotoUploadUrlsResponse> {
  const response = await fetch("/api/adoption/applications/photo-upload-urls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      turnstileToken: turnstileToken ?? undefined,
      photos: photos.map((photo) => ({
        category: photo.category,
        fileName: photo.file.name,
        mimeType: photo.file.type,
        sizeBytes: photo.file.size,
      })),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "無法準備相片上傳。");
  }
  return result as PhotoUploadUrlsResponse;
}

export async function uploadAllPhotos(
  photos: SelectedPhoto[],
  turnstileToken: string | null,
): Promise<{
  applicationId: string;
  uploaded: Array<{ category: string; fileName: string; mimeType: string; sizeBytes: number; storagePath: string }>;
}> {
  const { applicationId, uploads } = await requestPhotoUploadUrls(photos, turnstileToken);

  const uploaded = [];
  for (const photo of photos) {
    const signedUrl = uploads.find((u) => u.category === photo.category);
    if (!signedUrl) throw new Error(`Missing signed upload URL for ${photo.category}`);
    const result = await uploadPhotoDirectly(photo, applicationId, signedUrl);
    if (!result.ok) throw new Error(result.message);
    uploaded.push({
      category: photo.category,
      fileName: photo.file.name,
      mimeType: photo.file.type,
      sizeBytes: photo.file.size,
      storagePath: result.storagePath,
    });
  }

  return { applicationId, uploaded };
}
```

- [ ] **Step 3: Update `PhotoUploader.tsx`'s call to `validateSelectedFile`**

No structural change needed here — `validateSelectedFile`'s return shape gains `status: "idle"` per Step 1, which is additive and doesn't break the existing rendering logic. Confirm `bunx tsc --noEmit` doesn't flag anything in this file after Step 1's type change (if it does, add the missing `status` field to wherever a `SelectedPhoto` literal is constructed).

- [ ] **Step 4: Update `ApplicationWizard.tsx`'s `submitAdoptionApplication`**

Replace the whole function body:

```ts
async function submitAdoptionApplication(
  payload: unknown,
  photos: SelectedPhoto[],
  turnstileToken: string | null,
) {
  const payloadObject =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const { applicationId, uploaded } = await uploadAllPhotos(photos, turnstileToken);

  const response = await fetch("/api/adoption/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payload: payloadObject,
      applicationId,
      photos: uploaded,
      turnstileToken: turnstileToken ?? undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "提交失敗，請稍後再試。");
  }
  return result as { applicationId: string; reference: string; statusUrl: string };
}
```

Add `uploadAllPhotos` to the existing import from `./photoUploaderLogic`.

- [ ] **Step 5: Update/add tests**

Check whether `src/components/site/adoption/photoUploaderLogic.test.ts` already exists. If it does, extend it; if not, create it. Test `uploadPhotoDirectly` (mock `getSupabaseClient` via `mock.module("../../../lib/supabase", ...)`, assert `uploadToSignedUrl` called with the right path/token/file, assert error mapping), `requestPhotoUploadUrls` (mock `fetch`, assert request shape and error handling), and `uploadAllPhotos` (assert it calls both in sequence and returns the combined result, and that a missing signed URL for a category throws).

- [ ] **Step 6: Run tests, typecheck**

Run: `bun test src/components/site/adoption/` — expect PASS. Run `bunx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/components/site/adoption/photoUploaderLogic.ts src/components/site/adoption/PhotoUploader.tsx src/components/site/adoption/ApplicationWizard.tsx
git add src/components/site/adoption/photoUploaderLogic.test.ts
git commit -m "feat: upload adoption photos directly to storage instead of relaying through the server"
```

---

### Task 5: Sponsorship — upload-URL endpoint

> **Why this endpoint does not verify Turnstile:** an earlier version of this
> plan's Task 2 (the adoption equivalent, `photo-upload-urls.ts`) had the
> client send the *same* Turnstile token to both the upload-URL endpoint and
> the final submission endpoint. Cloudflare Turnstile tokens are single-use,
> so the second `siteverify` call fails with `timeout-or-duplicate` once
> `TURNSTILE_SECRET_KEY` is actually configured — turning a payload-size bug
> fix into a worse bug that breaks every real submission. That was caught and
> fixed post-merge (see the `fix: verify Turnstile only at final submission,
> not at the upload-URL step, to avoid double-consuming a single-use token`
> commit). This upload-URL endpoint mints a signed URL and nothing else — it
> creates no database row and sends no email, and a real pledge can't
> complete without later passing through `POST /api/sponsorships/pledges`
> (which verifies Turnstile) and `verifyUploadedObjects` (which confirms a
> genuinely-uploaded file exists) — so rate limiting alone (already below) is
> the correct control here. Do **not** add a `turnstileToken` field or a
> `verifyTurnstile` call to this route; keep Turnstile verification solely at
> the final `POST /api/sponsorships/pledges` submission step (Task 6), which
> already covers both the with-proof and no-proof pledge paths uniformly.

**Files:**
- Create: `src/routes/api/sponsorships/pledges/proof-upload-url.ts`
- Create: `src/routes/api/sponsorships/pledges/proof-upload-url.test.ts`

- [ ] **Step 1: Write the route**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../lib/sponsorship/schemas";
import { createSignedUploadUrls } from "../../../../lib/publicUploads/signedUpload.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../../lib/security/rate-limit.server";

export const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

const requestSchema = z.object({
  proof: z.object({
    fileName: z.unknown(),
    mimeType: z.unknown(),
    sizeBytes: z.unknown(),
  }),
});

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/sponsorships/pledges/proof-upload-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "sponsorship-proof-upload-url",
          max: 10,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
        }

        try {
          const parsed = requestSchema.parse(body);

          const descriptor = validateProofDescriptor(parsed.proof);
          const pledgeId = crypto.randomUUID();
          const client = createSupabaseServiceClient();
          const [upload] = await createSignedUploadUrls(
            client,
            SPONSORSHIP_PROOF_BUCKET,
            pledgeId,
            [{ category: "proof", fileName: descriptor.fileName }],
          );

          return jsonNoStore({ pledgeId, upload }, { status: 201 });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return jsonNoStore({ error: "Invalid proof upload request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore({ error: "Could not create upload URL" }, { status: 500 });
        }
      },
    },
  },
});
```

(Sponsorship proof has no category concept in its schema — `"proof"` is a fixed literal here purely so the shared `createSignedUploadUrls` helper's path-building convention (`${draftId}/${category}/${fileName}`) stays consistent between both domains, giving a final path of `<pledgeId>/proof/<fileName>`. This is a cosmetic path-naming detail, not a schema change.)

- [ ] **Step 2: Write the test**

```ts
import { describe, expect, test } from "bun:test";

describe("proof-upload-url route", () => {
  test("module exports a Route with a POST handler", async () => {
    const { Route } = await import("./proof-upload-url");
    expect(Route.options.server?.handlers?.POST).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/routes/api/sponsorships/pledges/proof-upload-url.test.ts`. Run `bunx tsc --noEmit`, regenerating `routeTree.gen.ts` via `bun run dev` if needed.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/sponsorships/pledges/proof-upload-url.ts src/routes/api/sponsorships/pledges/proof-upload-url.test.ts src/routeTree.gen.ts
git commit -m "feat: add sponsorship payment-proof signed-upload-URL endpoint"
```

---

### Task 6: Sponsorship — submission endpoint switches to JSON + verify

**Files:**
- Modify: `src/lib/sponsorship/submission.server.ts`
- Modify: `src/lib/sponsorship/submission.server.test.ts`
- Modify: `src/routes/api/sponsorships/pledges.ts`

This mirrors Task 3 exactly, applied to the sponsorship domain. Read the current `src/lib/sponsorship/submission.server.ts` in full first.

- [ ] **Step 1: Replace multipart parsing with JSON parsing**

Remove `validateSponsorshipSubmissionRequestHeaders` and `parseSponsorshipMultipart` entirely (and `SPONSORSHIP_MULTIPART_MAX_BYTES`, `isFile`). Replace with:

```ts
export type UploadedProofReference = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  metadata: SponsorshipPaymentProofMetadata;
};

export function parseSponsorshipSubmission(body: unknown): ParsedSponsorshipMultipart & {
  pledgeId: string;
} {
  if (typeof body !== "object" || body === null) {
    throw new SubmissionValidationError("Invalid sponsorship pledge request body");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.pledgeId !== "string" || !raw.pledgeId) {
    throw new SubmissionValidationError("Missing sponsorship pledge id");
  }

  const parsed = sponsorshipPledgeSubmissionSchema.parse(raw.payload);
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined;

  const rawProof = raw.proof;
  if (parsed.proofMetadata && !rawProof) {
    throw new SubmissionValidationError("Payment proof metadata was provided without a file reference");
  }
  if (!parsed.proofMetadata && rawProof) {
    throw new SubmissionValidationError("Payment proof file reference was provided without metadata");
  }

  let proof: ParsedSponsorshipProof | undefined;
  if (rawProof && parsed.proofMetadata) {
    const entry = rawProof as Record<string, unknown>;
    const descriptor = validateProofDescriptor(entry);
    if (typeof entry.storagePath !== "string" || !entry.storagePath) {
      throw new SubmissionValidationError("Missing storage path for the payment proof");
    }
    proof = {
      ...descriptor,
      storagePath: entry.storagePath,
      metadata: parsed.proofMetadata,
    } as unknown as ParsedSponsorshipProof;
  }

  return {
    payload: turnstileToken ? { ...parsed, turnstileToken } : parsed,
    proof,
    pledgeId: raw.pledgeId,
  };
}
```

Update `ParsedSponsorshipProof`'s type near the top of the file (remove `file: File`, add `storagePath: string`):

```ts
export type ParsedSponsorshipProof = SponsorshipProofDescriptor & {
  storagePath: string;
  metadata: SponsorshipPaymentProofMetadata;
};
```

- [ ] **Step 2: Replace the upload call in `persistSponsorshipPledge` with a verify call**

Add the import:

```ts
import { verifyUploadedObjects } from "../publicUploads/signedUpload.server";
```

Replace the `if (parsed.proof) { ... client.storage.from(SPONSORSHIP_PROOF_BUCKET).upload(...) ... }` block with:

```ts
    if (parsed.proof) {
      const verification = await verifyUploadedObjects(client, SPONSORSHIP_PROOF_BUCKET, [
        {
          category: "proof",
          path: parsed.proof.storagePath,
          sizeBytes: parsed.proof.sizeBytes,
          mimeType: parsed.proof.mimeType,
        },
      ]);
      if (!verification.ok) {
        throw new SubmissionValidationError(
          `Uploaded payment proof not found: ${verification.missing.join(", ")}`,
        );
      }

      requireNoError(
        await client
          .from("sponsorship_payment_proof")
          .insert(
            toPaymentProofInsert(
              pledgeId,
              parsed.proof.storagePath,
              parsed.proof,
              parsed.proof.metadata,
            ),
          ),
        "Failed to save sponsorship payment proof",
      );
    }
```

- [ ] **Step 3: Use the pre-allocated `pledgeId` on insert**

Find:

```ts
    const pledge = requireNoError(
      await client
        .from("sponsorship_pledge")
        .insert(toPledgeInsert(supporterId, status, parsed.payload))
        .select("id")
        .single(),
      "Failed to save sponsorship pledge",
    ) as { id: string } | null;
    if (!pledge?.id) throw new Error("Missing sponsorship pledge id");
    pledgeId = pledge.id;
```

Replace with:

```ts
    requireNoError(
      await client
        .from("sponsorship_pledge")
        .insert({ id: parsed.pledgeId, ...toPledgeInsert(supporterId, status, parsed.payload) })
        .select("id")
        .single(),
      "Failed to save sponsorship pledge",
    );
    pledgeId = parsed.pledgeId;
```

Widen `PersistSponsorshipPledgeInput`'s `parsed: ParsedSponsorshipMultipart` to `parsed: ParsedSponsorshipMultipart & { pledgeId: string }`.

- [ ] **Step 4: Update `submission.server.test.ts`**

Same treatment as Task 3 Step 4, applied to the sponsorship test file: replace multipart-building test setup with plain objects and `parseSponsorshipSubmission`, replace `.upload()` mocks with `.list()` mocks, add a test for the missing-proof-object-rejects-before-insert case, add `parseSponsorshipSubmission` validation tests (missing `pledgeId`, proof metadata without a proof reference and vice versa, missing `storagePath`).

- [ ] **Step 5: Update the route**

Rewrite `src/routes/api/sponsorships/pledges.ts`'s POST handler the same way as Task 3 Step 5 — JSON body parsing via `request.json()`, `parseSponsorshipSubmission(body)` instead of `parseSponsorshipMultipart`/header validation, everything else (rate limit, Turnstile check, `persistSponsorshipPledge`, `sendPledgeConfirmationEmail`, response shape, error handling) unchanged.

- [ ] **Step 6: Run tests, typecheck**

Run: `bun test src/lib/sponsorship/submission.server.test.ts src/routes/api/sponsorships/pledges.test.ts`. Run `bunx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sponsorship/submission.server.ts src/lib/sponsorship/submission.server.test.ts src/routes/api/sponsorships/pledges.ts
git commit -m "feat: switch sponsorship pledge submission to JSON with pre-uploaded proof reference"
```

---

### Task 7: Sponsorship — client-side direct upload

**Files:**
- Modify: `src/components/site/sponsorship/PledgeWizard.tsx`
- Modify (or create, check first): `src/components/site/sponsorship/PledgeWizard.test.tsx`

- [ ] **Step 1: Read the current file in full**, focusing on the `handleSubmit` function (around line 150-220) and the `proofFile`/`includeProof`/`proofMethod`/`proofReference`/`proofAmount`/`proofDate` state.

- [ ] **Step 2: Add a direct-upload helper near the top of the file (or in a new small `pledgeProofUpload.ts` if the component file is already large — check its line count first; if over ~400 lines, extract to a sibling file, otherwise keep it local)**

```ts
async function uploadProofDirectly(
  proofFile: File,
): Promise<{ pledgeId: string; storagePath: string }> {
  const urlResponse = await fetch("/api/sponsorships/pledges/proof-upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      proof: { fileName: proofFile.name, mimeType: proofFile.type, sizeBytes: proofFile.size },
    }),
  });
  const urlResult = await urlResponse.json().catch(() => ({}));
  if (!urlResponse.ok) {
    throw new Error(typeof urlResult.error === "string" ? urlResult.error : "無法準備付款證明上傳。");
  }
  const { pledgeId, upload } = urlResult as {
    pledgeId: string;
    upload: { path: string; token: string };
  };

  const { getSupabaseClient } = await import("../../../lib/supabase");
  const client = getSupabaseClient();
  const { error } = await client.storage
    .from("sponsorship-payment-proof")
    .uploadToSignedUrl(upload.path, upload.token, proofFile, { contentType: proofFile.type });
  if (error) throw new Error("付款證明上傳失敗，請重試。");

  return { pledgeId, storagePath: upload.path };
}
```

- [ ] **Step 3: Update `handleSubmit`**

Replace the block from `const formData = new FormData();` through the `fetch("/api/sponsorships/pledges", ...)` call:

```ts
      let pledgeId: string | undefined;
      let proofReference_: { storagePath: string } | undefined;
      if (includeProof && proofFile) {
        const uploadResult = await uploadProofDirectly(proofFile);
        pledgeId = uploadResult.pledgeId;
        proofReference_ = { storagePath: uploadResult.storagePath };
      }
      pledgeId ??= crypto.randomUUID();

      const response = await fetch("/api/sponsorships/pledges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payload,
          pledgeId,
          proof:
            includeProof && proofFile && proofReference_
              ? {
                  fileName: proofFile.name,
                  mimeType: proofFile.type,
                  sizeBytes: proofFile.size,
                  storagePath: proofReference_.storagePath,
                }
              : undefined,
          turnstileToken,
        }),
      });
```

Note the `payload` object built just above this block already includes `turnstileToken` as one of its own fields (see the existing code around line 175) — leave that as-is; the JSON body's top-level `turnstileToken` field here is what the new route actually reads (matching how Task 6's `parseSponsorshipSubmission` reads `raw.turnstileToken`, not `raw.payload.turnstileToken`, for consistency with Task 3's adoption equivalent). Don't remove `turnstileToken` from inside `payload` — `sponsorshipPledgeSubmissionSchema` doesn't declare that field so Zod will simply ignore it there; removing it risks an unrelated diff for no benefit.

Everything after `if (!response.ok) throw new Error(...)` in the existing `handleSubmit` stays unchanged.

- [ ] **Step 4: Update/add tests**

Check `src/components/site/sponsorship/PledgeWizard.test.tsx` for existing submit-flow tests. Update any that mock `fetch` for `/api/sponsorships/pledges` with a `FormData` body assertion to instead assert a JSON body shape. Add a test for `uploadProofDirectly` covering the happy path and the "upload URL request fails" / "direct storage upload fails" error paths (mock `fetch` and `getSupabaseClient` as needed, following the same `mock.module` pattern used elsewhere in this plan).

- [ ] **Step 5: Run tests, typecheck**

Run: `bun test src/components/site/sponsorship/PledgeWizard.test.tsx`. Run `bunx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/sponsorship/PledgeWizard.tsx
git add src/components/site/sponsorship/PledgeWizard.test.tsx
git commit -m "feat: upload sponsorship payment proof directly to storage instead of relaying through the server"
```

---

### Task 8: Full verification gate, real end-to-end check, and draft PR

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun test` — all tests pass, including everything from Tasks 1-7.

- [ ] **Step 2: Full lint**

Run: `bun run lint` — 0 errors. Use scoped `bunx eslint <file> --fix` for any formatting issues; do NOT run `bun run format` on the whole repo (it reformats unrelated files — a mistake made and caught earlier in this same repo's history).

- [ ] **Step 3: Full typecheck**

Run: `bunx tsc --noEmit` — no errors. This specifically catches any leftover reference to removed exports (`parseAdoptionMultipart`, `parseSponsorshipMultipart`, `validateAdoptionSubmissionRequestHeaders`, `validateSponsorshipSubmissionRequestHeaders`, the old `file: File`-shaped `ParsedAdoptionPhoto`/`ParsedSponsorshipProof`).

- [ ] **Step 4: Build**

Run: `bun run build` — succeeds.

- [ ] **Step 5: Real end-to-end check against actual Supabase Storage**

This is the most important verification in this plan — it's the only step that actually proves the fix works, since unit tests use fakes. Using the `.env.local` credentials already present in the repo's main worktree (copy into this worktree temporarily if needed, delete afterward — do not commit it), write a small one-off script (in the scratchpad directory, not committed) that:

1. Creates a Supabase client with the service-role key.
2. Calls `createSignedUploadUrls` for a test file in `adoption-application-photos` under a throwaway draft ID like `plan-verification-<timestamp>`.
3. Does a real `fetch(signedUrl, { method: "PUT", headers: {...}, body: <a small real JPEG buffer> })` — or use the Supabase JS client's `uploadToSignedUrl` directly — to actually upload a small test image.
4. Calls `verifyUploadedObjects` and confirms it reports `{ ok: true }`.
5. Repeats for `sponsorship-payment-proof`.
6. Deletes both test objects afterward (`client.storage.from(bucket).remove([path])`) so no test data lingers in the real bucket.

Report the exact output of each step. If verification fails at any point, stop and fix the underlying code — do not proceed to opening the PR with an unverified fix for what is explicitly an urgent bug.

- [ ] **Step 6: Manually verify both wizards still complete successfully in local dev**

Run `bun run dev` (with `.env.local` present in this worktree), open `/adoption/apply` and `/sponsors/pledge` in a browser, and step through each wizard far enough to reach the photo/proof upload step, select a real small test image, and confirm the upload succeeds with no console errors (Turnstile may block full submission in local dev if not configured — getting through the upload step itself, before final submit, is enough to prove the direct-upload path works; if `turnstileEnabled` is false in this environment, completing the full submission is possible and preferred).

- [ ] **Step 7: Push and open a PR**

Given this fixes a likely-active production bug, do NOT mark it draft — but per this repo's release process (`CLAUDE.md`: "merge only after explicit release approval"), still wait for the tech lead's review before merging.

```bash
git push -u origin fix/signed-direct-upload-adoption-sponsorship
gh pr create --title "fix: upload adoption photos and sponsorship proof directly to storage, bypassing Vercel's 4.5MB body limit" --body "$(cat <<'EOF'
## Summary
- **Likely-active production bug fix, not just an efficiency improvement.** Both adoption application photos and sponsorship payment-proof images allow files up to 8MB, while Vercel serverless functions (this repo's deploy target) have a hard, non-configurable 4.5MB request body limit. A single realistically-sized phone photo very likely fails today with a 413 FUNCTION_PAYLOAD_TOO_LARGE error before ever reaching application code.
- Replaces server-relayed multipart uploads with signed direct-to-Supabase-Storage uploads for both flows: the browser requests a signed upload URL, uploads the file bytes directly to Storage (never touching the Vercel function), then submits the rest of the form as plain JSON referencing the already-uploaded path.
- New shared module (`src/lib/publicUploads/signedUpload.server.ts`) avoids duplicating the Storage-interaction logic between the two domains.
- Neither Storage bucket's RLS/access policy changed — signed upload tokens authorize the write directly, no new standing grant needed.
- Server-side verification (`verifyUploadedObjects`) confirms each referenced file actually exists before creating any database row — stricter than before, and means a failed upload is caught pre-insert instead of requiring post-insert cleanup.

Spec: docs/superpowers/specs/2026-08-31-signed-direct-upload-design.md
Plan: docs/superpowers/plans/2026-08-31-signed-direct-upload.md

## Test plan
- [x] `bun test` — full suite passes
- [x] `bun run lint` — 0 errors
- [x] `bunx tsc --noEmit` — clean
- [x] `bun run build` — succeeds
- [x] Real end-to-end verification against the actual `adoption-application-photos` and `sponsorship-payment-proof` Storage buckets (signed URL minted, real file uploaded, existence verified, test objects cleaned up)
- [x] Manually verified both wizards' upload steps in local dev

Out of scope (flagged as follow-ups, not blocking): cleanup of abandoned/orphaned uploads if a user never finishes the form.

Wait for the tech lead's review before merging, per this repo's release process — but given this fixes a likely-active production bug, please prioritize review.
EOF
)"
```

- [ ] **Step 8: Report the PR URL and stop**

Do not merge — wait for tech lead review, matching this repo's established release process.
