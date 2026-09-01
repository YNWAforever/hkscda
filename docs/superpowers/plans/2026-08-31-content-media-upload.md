# Content Media Upload (BP-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the `content-media` Storage bucket that the CMS media code already assumes exists, and replace the admin's manual "type a bucket name and storage path" form with a real signed-upload-to-Storage flow.

**Architecture:** Mirrors the `documents` domain's existing admin-authenticated signed-upload pattern exactly (repository `createSignedUploadUrl` → service `createUploadTarget` → HTTP handler behind `requireContentAdmin` → new route) instead of the public anonymous upload module used for adoption/sponsorship photos. The admin's browser requests a signed upload URL, uploads the file directly to Supabase Storage (never through the server body), then calls the existing `createContentMedia` mutation with the real uploaded path.

**Tech Stack:** TanStack Start (React 19 + TanStack Router), Supabase Storage + Postgres, Zod, Bun test, `@tanstack/react-query`.

---

## File Structure

**Create:**
- `supabase/migrations/20260831160000_content_media_storage_bucket.sql` — provisions the `content-media` bucket.
- `src/routes/api/admin/content/$id/media-upload-target.ts` — new API route.
- `src/components/admin/content/contentMediaUpload.ts` — client-side upload helper (validates the file, requests the upload target, uploads to Storage). Kept as its own file, mirroring `documentUpload.ts`, so `ContentEditor.tsx` doesn't grow with unrelated upload-plumbing logic.
- `src/components/admin/content/contentMediaUpload.test.ts` — unit tests for the helper above.

**Modify:**
- `src/lib/content/schemas.ts` — drop `storageBucket` from `contentMediaInputSchema`; add `CONTENT_MEDIA_BUCKET`, `MAX_CONTENT_MEDIA_BYTES`, `CONTENT_MEDIA_MIME_TYPES`, `contentMediaUploadTargetSchema`.
- `src/lib/content/repository.server.ts` — hardcode `storage_bucket` in `toContentMediaInsert`; add `createSignedUploadUrl`.
- `src/lib/content/service.ts` — add `createSignedUploadUrl` to the `ContentRepository` interface; add `createUploadTarget`; fix `createContentMedia`'s audit detail to reference the hardcoded bucket constant instead of the now-removed input field.
- `src/lib/content/http.server.ts` — add the `createUploadTarget` handler.
- `src/lib/content/service.test.ts` — add `createSignedUploadUrl` to the `createRepo()` fixture; remove `storageBucket` from the existing `createContentMedia` test input; add tests for `createUploadTarget`.
- `src/lib/content/http.test.ts` — add `createUploadTarget` to the fake service; add a routing test for the new handler.
- `src/lib/supabaseMigrations.test.ts` — add a bespoke content-assertion test for the new migration, matching this file's existing per-migration convention.
- `src/components/admin/content/ContentEditor.tsx` — replace `ContentMediaPanel`'s "Storage bucket"/"Storage path" text inputs with a file picker; move the upload orchestration into the `createContentMedia` mutation's `mutationFn`.
- `src/components/admin/content/ContentEditor.test.tsx` — extend the existing authoring-controls test to confirm the manual path-typing fields are gone and a file input is present.

---

### Task 1: Provision the `content-media` Storage bucket

**Files:**
- Create: `supabase/migrations/20260831160000_content_media_storage_bucket.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Provisions the content-media Storage bucket that
-- src/lib/content/repository.server.ts's mediaPublicUrl() already assumes
-- exists (it unconditionally calls
-- client.storage.from(row.storage_bucket).getPublicUrl(...)). Mirrors the
-- site-documents bucket's exact shape
-- (20260718100000_public_documents_and_donation_purpose.sql): a public
-- bucket, with no explicit storage.objects RLS policy needed. storage.objects
-- has row level security enabled by default with no permissive policy for
-- anon/authenticated, so direct writes are already denied for those roles;
-- uploads go through signed upload URLs, which Supabase Storage authorizes
-- via the URL's own token rather than storage.objects RLS, and are issued
-- only by the service-role client (src/lib/content/repository.server.ts's
-- createSignedUploadUrl, called from an admin-authenticated API route).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 2: Write the migration-content test**

Open `src/lib/supabaseMigrations.test.ts` and add this test inside the existing `describe("supabase migration safety", ...)` block, near the other bucket-provisioning tests (e.g. after the `"adds publish-safe public documents and bounded donation purpose notes"` test):

```typescript
  test("provisions the public content-media bucket for CMS image uploads", () => {
    const sql = readMigration("20260831160000_content_media_storage_bucket.sql");
    expect(sql).toContain(
      "values (\n  'content-media',\n  'content-media',\n  true,\n  8388608,",
    );
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']");
    expect(sql).toContain("on conflict (id) do update set");
  });
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `bun test src/lib/supabaseMigrations.test.ts -t "content-media bucket"`
Expected before Step 1's file exists: FAIL with `Migration not found: 20260831160000_content_media_storage_bucket.sql`.
After Step 1's file is saved: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260831160000_content_media_storage_bucket.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: provision the content-media Storage bucket"
```

---

### Task 2: Tighten the content-media input schema; add the upload-target schema

**Files:**
- Modify: `src/lib/content/schemas.ts`
- Modify: `src/lib/content/service.test.ts`

The current `contentMediaInputSchema` (in `src/lib/content/schemas.ts`) accepts a free-text `storageBucket` field, letting an admin point a row at an arbitrary bucket. This task removes it (the bucket becomes a hardcoded server-side constant, wired in Task 3) and adds the schema the new upload-target endpoint will use.

- [ ] **Step 1: Update the failing test fixture first**

`src/lib/content/service.test.ts` has an existing test, `"creates story updates, media, and linked records with audit logs"`, whose `service.createContentMedia(...)` call passes `storageBucket: "content-media"` as part of its `input`. Find this block (search for `storageBucket: "content-media"` in that file) and remove that line, since `contentMediaInputSchema` will no longer accept it:

```typescript
    await expect(
      service.createContentMedia({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          storyUpdateId,
          storagePath: "stories/siu-bak/checkup.jpg",
          altText: "小白覆診照片",
          caption: "覆診完成",
          sortOrder: 1,
          isCover: true,
        },
      }),
    ).resolves.toEqual({ id: "media-2" });
```

(This test will still pass either way today, since Zod strips unrecognized keys by default rather than rejecting them — but leaving the stale field in would make the test lie about what the real API accepts, so remove it now.)

- [ ] **Step 2: Run the full content test suite to confirm nothing else references `storageBucket` as input**

Run: `bun test src/lib/content/`
Expected: all tests PASS (this step is establishing a clean baseline before the schema change; no test should reference `storageBucket` as an admin-input field after Step 1).

- [ ] **Step 3: Edit `contentMediaInputSchema` and add the new constants/schema**

In `src/lib/content/schemas.ts`, find:

```typescript
export const contentMediaInputSchema = z.object({
  storyUpdateId: z.string().uuid().nullable().optional().default(null),
  storageBucket: trimmed.min(1).max(120).default("content-media"),
  storagePath: trimmed.min(1).max(400),
  altText: trimmed.min(1).max(180),
  caption: optionalTrimmed,
  sortOrder: numberFromInput(z.number().int().min(0)).optional().default(0),
  isCover: z.boolean().default(false),
});
```

Replace it with:

```typescript
export const CONTENT_MEDIA_BUCKET = "content-media";
export const MAX_CONTENT_MEDIA_BYTES = 8 * 1024 * 1024;
export const CONTENT_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const contentMediaPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine((path) => !path.startsWith("/"), "Storage paths cannot start with a slash")
  .refine((path) => !path.includes(".."), "Storage paths cannot include parent traversal")
  .refine(
    (path) => /\.(jpe?g|png|webp)$/i.test(path),
    "Storage paths must end in .jpg, .jpeg, .png, or .webp",
  );

export const contentMediaInputSchema = z.object({
  storyUpdateId: z.string().uuid().nullable().optional().default(null),
  storagePath: contentMediaPathSchema,
  altText: trimmed.min(1).max(180),
  caption: optionalTrimmed,
  sortOrder: numberFromInput(z.number().int().min(0)).optional().default(0),
  isCover: z.boolean().default(false),
});

export const contentMediaUploadTargetSchema = z.object({
  objectPath: contentMediaPathSchema,
  mimeType: z.enum(CONTENT_MEDIA_MIME_TYPES),
  byteSize: z.coerce.number().int().min(1).max(MAX_CONTENT_MEDIA_BYTES),
});
```

Then find the type-export block near the bottom of the same file (it already has `export type ContentMediaInput = z.infer<typeof contentMediaInputSchema>;`) and add a new line directly after it:

```typescript
export type ContentMediaUploadTargetInput = z.infer<typeof contentMediaUploadTargetSchema>;
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/content/`
Expected: PASS. (`contentMediaPathSchema`'s stricter `storagePath` validation — no leading slash, no `..`, must end in an image extension — is a superset of what every existing test's `storagePath` fixture already satisfies, e.g. `"stories/siu-bak/checkup.jpg"`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/schemas.ts src/lib/content/service.test.ts
git commit -m "refactor: tighten content-media storagePath validation, drop admin-editable bucket"
```

---

### Task 3: Repository layer — hardcode the bucket, add `createSignedUploadUrl`

**Files:**
- Modify: `src/lib/content/repository.server.ts`

- [ ] **Step 1: Hardcode the bucket in `toContentMediaInsert`**

In `src/lib/content/repository.server.ts`, find:

```typescript
import {
  isSafePublicHref,
  type ContentInput,
  type ContentLinkInput,
  type ContentMediaInput,
  type StoryProfileInput,
  type StoryUpdateInput,
} from "./schemas";
```

Add `CONTENT_MEDIA_BUCKET` to that import:

```typescript
import {
  CONTENT_MEDIA_BUCKET,
  isSafePublicHref,
  type ContentInput,
  type ContentLinkInput,
  type ContentMediaInput,
  type StoryProfileInput,
  type StoryUpdateInput,
} from "./schemas";
```

Then find:

```typescript
export function toContentMediaInsert(contentId: string, input: ContentMediaInput) {
  return {
    content_item_id: contentId,
    story_update_id: input.storyUpdateId,
    storage_bucket: input.storageBucket,
    storage_path: input.storagePath,
    alt_text: input.altText,
    caption: input.caption,
    sort_order: input.sortOrder,
    is_cover: input.isCover,
  };
}
```

Replace the `storage_bucket` line:

```typescript
export function toContentMediaInsert(contentId: string, input: ContentMediaInput) {
  return {
    content_item_id: contentId,
    story_update_id: input.storyUpdateId,
    storage_bucket: CONTENT_MEDIA_BUCKET,
    storage_path: input.storagePath,
    alt_text: input.altText,
    caption: input.caption,
    sort_order: input.sortOrder,
    is_cover: input.isCover,
  };
}
```

- [ ] **Step 2: Fix the stale `toContentMediaInsert` test fixture**

`src/lib/content/repositoryMapping.test.ts` calls `toContentMediaInsert` directly with a `storageBucket` field in its input object (around line 173-181):

```typescript
    expect(
      toContentMediaInsert("content-1", {
        storyUpdateId: "22222222-2222-4333-8444-555555555555",
        storageBucket: "content-media",
        storagePath: "stories/siu-bak/checkup.jpg",
        altText: "小白覆診照片",
        caption: "覆診完成",
        sortOrder: 1,
        isCover: true,
      }),
    ).toMatchObject({
```

Since `ContentMediaInput` (Task 2) no longer has a `storageBucket` field, this object literal now has an excess property TypeScript will reject at the call site. Remove that line:

```typescript
    expect(
      toContentMediaInsert("content-1", {
        storyUpdateId: "22222222-2222-4333-8444-555555555555",
        storagePath: "stories/siu-bak/checkup.jpg",
        altText: "小白覆診照片",
        caption: "覆診完成",
        sortOrder: 1,
        isCover: true,
      }),
    ).toMatchObject({
```

The `toMatchObject` expectation on the following lines doesn't assert on `storage_bucket` at all (it's a partial match checking `content_item_id`, `story_update_id`, `storage_path`, `alt_text`, `is_cover`), so no change is needed there — the hardcoded `CONTENT_MEDIA_BUCKET` value doesn't need a new assertion to keep this specific test green, though Task 1/8 already verify the bucket name elsewhere.

- [ ] **Step 3: Run the mapping test and typecheck to confirm the fix**

Run: `bunx tsc --noEmit && bun test src/lib/content/repositoryMapping.test.ts`
Expected: both PASS.

- [ ] **Step 4: Add `createSignedUploadUrl` to the `ContentRepository` interface**

In `src/lib/content/service.ts`, find:

```typescript
  createStoryUpdate(contentId: string, input: StoryUpdateInput): Promise<string>;
  createContentMedia(contentId: string, input: ContentMediaInput): Promise<string>;
  createContentLink(contentId: string, input: ContentLinkInput): Promise<string>;
```

Add a new line after `createContentMedia`:

```typescript
  createStoryUpdate(contentId: string, input: StoryUpdateInput): Promise<string>;
  createContentMedia(contentId: string, input: ContentMediaInput): Promise<string>;
  createSignedUploadUrl(objectPath: string): Promise<{ token: string; path: string }>;
  createContentLink(contentId: string, input: ContentLinkInput): Promise<string>;
```

- [ ] **Step 5: Implement `createSignedUploadUrl` in the repository**

In `src/lib/content/repository.server.ts`, find the `createContentMedia` implementation (it ends with `return mediaId; },`) and add the new method directly after it, inside the same returned object:

```typescript
    async createContentMedia(contentId, input) {
      const { data, error } = await client
        .from("content_media")
        .insert(toContentMediaInsert(contentId, input))
        .select("id")
        .single();
      if (error) throw error;

      const mediaId = data.id as string;
      if (input.isCover) {
        const { error: coverError } = await client
          .from("content_item")
          .update({ cover_media_id: mediaId })
          .eq("id", contentId)
          .select("id")
          .single();
        if (coverError) throw coverError;
      }

      return mediaId;
    },

    async createSignedUploadUrl(objectPath: string) {
      const { data, error } = await client.storage
        .from(CONTENT_MEDIA_BUCKET)
        .createSignedUploadUrl(objectPath);
      if (error) throw error;
      if (!data?.token || !data.path) throw new Error("Storage did not return an upload target");
      return { token: data.token, path: data.path };
    },
```

- [ ] **Step 6: Write a repository-layer test for `createSignedUploadUrl`**

There is no existing `src/lib/content/repository.server.test.ts` file — this domain's repository layer is exercised only through `repositoryMapping.test.ts`'s pure-function tests and through the service layer's fake `ContentRepository` (see Task 4). Do **not** create a new `repository.server.test.ts` file here; that would introduce an inconsistent testing convention for this one domain. `createSignedUploadUrl`'s actual Supabase Storage interaction is covered instead by Task 8's real-Postgres/Storage verification and by Task 4's service-layer test against a fake repository.

- [ ] **Step 7: Run typecheck and the content test suite**

Run: `bunx tsc --noEmit && bun test src/lib/content/`
Expected: typecheck passes with no errors (the `ContentRepository` interface change is additive — every existing implementer needs the new method, which Step 5 just added to the one real implementer; Task 4 will add it to the test fixture). `bun test` may fail at this point because `service.test.ts`'s `createRepo()` fixture doesn't yet satisfy the widened interface — that's expected and fixed in Task 4, Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content/repository.server.ts src/lib/content/service.ts
git commit -m "feat: hardcode the content-media bucket, add createSignedUploadUrl to the repository"
```

---

### Task 4: Service layer — `createUploadTarget`

**Files:**
- Modify: `src/lib/content/service.ts`
- Modify: `src/lib/content/service.test.ts`

- [ ] **Step 1: Fix the `createRepo()` test fixture to satisfy the widened interface**

In `src/lib/content/service.test.ts`, find the `createRepo()` function and add a default `createSignedUploadUrl` implementation, matching the existing style (a plain async arrow, not a `mock()` — this file's other repo methods aren't wrapped in `mock()` either):

```typescript
  const repo: ContentRepository = {
    listPublicContent: async () => ({ items: [detail], total: 1 }),
    listPublicStoriesPage: async () => ({ items: [detail], total: 1, points: [] }),
    getPublicContentBySlug: async () => detail,
    listPublicMapStories: async () => [],
    listAdminContent: async () => ({ items: [detail], total: 1 }),
    getAdminContent: async () => detail,
    createContent: async () => "content-1",
    updateContent: async () => detail,
    publishContent: async () => ({ ...detail, status: "published" }),
    archiveContent: async () => ({ ...detail, status: "archived" }),
    upsertStoryProfile: async () => detail,
    createStoryUpdate: async () => storyUpdateId,
    createContentMedia: async () => "media-2",
    createSignedUploadUrl: async (objectPath) => ({ token: "upload-token", path: objectPath }),
    createContentLink: async () => "link-1",
    insertSocialCopies: async (rows) => {
      socialCopies.push(...rows);
    },
    getStoryUpdate: async (id) => (id === storyUpdateId ? publicStoryUpdate : null),
    resolveAdopterRecipients: async () => [
      {
        adoptionCaseId: "case-1",
        supporterId: "supporter-1",
        name: "陳小姐",
        email: "ada@example.com",
        phone: "91234567",
      },
    ],
    insertNotificationDrafts: async (rows) => {
      notificationDrafts.push(...rows);
    },
    updateNotificationDraftStatus: async () => undefined,
    updateSocialCopyStatus: async () => undefined,
    insertAuditLog: async (row) => {
      auditLogs.push(row);
    },
    ...overrides,
  };
```

- [ ] **Step 2: Run the test suite to confirm it's back to green**

Run: `bun test src/lib/content/service.test.ts`
Expected: PASS (this confirms Task 3's interface change is now fully satisfied; `createUploadTarget` doesn't exist on the service yet, so no test references it yet).

- [ ] **Step 3: Write the failing tests for `createUploadTarget`**

Add this new `describe` block to `src/lib/content/service.test.ts` (place it after the `describe("createContentService", ...)` block's closing `});`):

```typescript
describe("createContentService createUploadTarget", () => {
  test("requests a signed upload target for a path under the content item", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
        },
      }),
    ).resolves.toEqual({ token: "upload-token", path: "content-1/checkup.jpg" });
  });

  test("rejects an upload path that does not belong to the content item", async () => {
    const { repo } = createRepo();
    let calledCreateSignedUploadUrl = false;
    const spyRepo: ContentRepository = {
      ...repo,
      createSignedUploadUrl: async (objectPath) => {
        calledCreateSignedUploadUrl = true;
        return { token: "upload-token", path: objectPath };
      },
    };
    const spyService = createContentService({ repo: spyRepo, publicBaseUrl: "https://example.test" });

    await expect(
      spyService.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "some-other-content-item/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
        },
      }),
    ).rejects.toThrow("Upload path does not belong to this content item");
    expect(calledCreateSignedUploadUrl).toBe(false);
  });

  test("rejects a disallowed mime type", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.gif",
          mimeType: "image/gif",
          byteSize: 1024,
        },
      }),
    ).rejects.toThrow();
  });

  test("rejects an oversized file", async () => {
    const { repo } = createRepo();
    const service = createContentService({ repo, publicBaseUrl: "https://example.test" });

    await expect(
      service.createUploadTarget({
        actorUserId: "admin-user",
        contentId: "content-1",
        input: {
          objectPath: "content-1/checkup.jpg",
          mimeType: "image/jpeg",
          byteSize: 9 * 1024 * 1024,
        },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun test src/lib/content/service.test.ts -t "createUploadTarget"`
Expected: FAIL with `service.createUploadTarget is not a function`.

- [ ] **Step 5: Implement `createUploadTarget`**

In `src/lib/content/service.ts`, find the import from `./schemas` near the top:

```typescript
import {
  contentLinkInputSchema,
  contentMediaInputSchema,
  contentInputSchema,
  contentSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
  storyProfileInputSchema,
  storyUpdateInputSchema,
} from "./schemas";
```

Replace it with (adding the two new imports):

```typescript
import {
  CONTENT_MEDIA_BUCKET,
  contentLinkInputSchema,
  contentMediaInputSchema,
  contentMediaUploadTargetSchema,
  contentInputSchema,
  contentSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
  storyProfileInputSchema,
  storyUpdateInputSchema,
} from "./schemas";
```

Then find the `type CreateContentMediaArgs = ActorInput & { contentId: string; input: unknown; };` block and add a new type directly after it:

```typescript
type CreateContentMediaArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type CreateUploadTargetArgs = ActorInput & {
  contentId: string;
  input: unknown;
};
```

Then find the `createContentMedia` method inside `createContentService`'s returned object (it ends with `return { id }; },`) and add the new method directly after it:

```typescript
    async createContentMedia({ actorUserId, contentId, input }: CreateContentMediaArgs) {
      const parsed = contentMediaInputSchema.parse(input);
      const id = await repo.createContentMedia(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.media.create",
        entity: "content_media",
        entity_id: id,
        detail: {
          contentId,
          storyUpdateId: parsed.storyUpdateId,
          storageBucket: CONTENT_MEDIA_BUCKET,
          storagePath: parsed.storagePath,
          isCover: parsed.isCover,
        },
      });

      return { id };
    },

    async createUploadTarget({ contentId, input }: CreateUploadTargetArgs) {
      const parsed = contentMediaUploadTargetSchema.parse(input);
      if (!parsed.objectPath.startsWith(`${contentId}/`)) {
        throw new Error("Upload path does not belong to this content item");
      }
      return repo.createSignedUploadUrl(parsed.objectPath);
    },
```

(Note the `storageBucket: parsed.storageBucket` line in the existing `createContentMedia` audit detail is now `storageBucket: CONTENT_MEDIA_BUCKET` — `parsed` no longer has a `storageBucket` field after Task 2.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/lib/content/service.test.ts`
Expected: PASS, all `createUploadTarget` tests included.

- [ ] **Step 7: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content/service.ts src/lib/content/service.test.ts
git commit -m "feat: add createUploadTarget to the content service"
```

---

### Task 5: HTTP handler and route

**Files:**
- Modify: `src/lib/content/http.server.ts`
- Modify: `src/lib/content/http.test.ts`
- Create: `src/routes/api/admin/content/$id/media-upload-target.ts`

- [ ] **Step 1: Add `createUploadTarget` to the fake service in `http.test.ts`**

In `src/lib/content/http.test.ts`, find:

```typescript
    async createContentMedia() {
      calls.push("createContentMedia");
      return { id: "media-1" };
    },
```

Add a new method directly after it:

```typescript
    async createContentMedia() {
      calls.push("createContentMedia");
      return { id: "media-1" };
    },
    async createUploadTarget() {
      calls.push("createUploadTarget");
      return { token: "upload-token", path: "content-1/checkup.jpg" };
    },
```

- [ ] **Step 2: Write the failing routing test**

Add this test to `src/lib/content/http.test.ts`, placed after the `"routes authoring mutations to content service methods"` test:

```typescript
  test("routes the upload-target request behind admin auth", async () => {
    const service = createService();
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service,
    });
    const contentParams = { id: "99999999-aaaa-4333-8444-555555555555" };

    const response = await handlers.createUploadTarget({
      request: new Request(
        "https://example.test/api/admin/content/99999999-aaaa-4333-8444-555555555555/media-upload-target",
        {
          method: "POST",
          body: JSON.stringify({
            objectPath: "99999999-aaaa-4333-8444-555555555555/checkup.jpg",
            mimeType: "image/jpeg",
            byteSize: 1024,
          }),
        },
      ),
      params: contentParams,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ token: "upload-token", path: "content-1/checkup.jpg" });
    expect(service.calls).toEqual(["createUploadTarget"]);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/content/http.test.ts -t "upload-target"`
Expected: FAIL with `handlers.createUploadTarget is not a function`.

- [ ] **Step 4: Implement the handler**

In `src/lib/content/http.server.ts`, find the `createContentMedia` handler (it ends with `});` `},`) and add the new handler directly after it, inside the object returned by `createContentHandlers`:

```typescript
    createContentMedia({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createContentMedia({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    createUploadTarget({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createUploadTarget({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/content/http.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the route file**

Create `src/routes/api/admin/content/$id/media-upload-target.ts`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/media-upload-target")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createUploadTarget({ request, params }),
    },
  },
});
```

- [ ] **Step 7: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (This also regenerates `src/routeTree.gen.ts` to include the new route the next time `bun run dev` or `bun run build` runs — do not hand-edit that file.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/content/http.server.ts src/lib/content/http.test.ts src/routes/api/admin/content/\$id/media-upload-target.ts
git commit -m "feat: add the content-media upload-target API route"
```

---

### Task 6: Client-side upload helper

**Files:**
- Create: `src/components/admin/content/contentMediaUpload.ts`
- Create: `src/components/admin/content/contentMediaUpload.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/content/contentMediaUpload.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import { uploadContentMediaImage } from "./contentMediaUpload";

function fakeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("uploadContentMediaImage", () => {
  test("rejects a non-image file before requesting an upload target", async () => {
    const calls: string[] = [];
    await expect(
      uploadContentMediaImage({
        file: fakeFile("notes.pdf", "application/pdf", 1024),
        contentId: "content-1",
        requestUploadTarget: async (input) => {
          calls.push("requestUploadTarget");
          return { token: "t", path: input.objectPath };
        },
        uploadToSignedUrl: async () => {
          calls.push("uploadToSignedUrl");
        },
      }),
    ).rejects.toThrow("請選擇 JPG、PNG 或 WEBP 圖片");
    expect(calls).toEqual([]);
  });

  test("rejects a file larger than 8 MiB before requesting an upload target", async () => {
    const calls: string[] = [];
    await expect(
      uploadContentMediaImage({
        file: fakeFile("big.jpg", "image/jpeg", 9 * 1024 * 1024),
        contentId: "content-1",
        requestUploadTarget: async (input) => {
          calls.push("requestUploadTarget");
          return { token: "t", path: input.objectPath };
        },
        uploadToSignedUrl: async () => {
          calls.push("uploadToSignedUrl");
        },
      }),
    ).rejects.toThrow("圖片不可超過 8 MiB");
    expect(calls).toEqual([]);
  });

  test("uploads a valid image under the content item's own folder and returns the resulting path", async () => {
    const calls: Array<{ step: string; arg: unknown }> = [];
    const path = await uploadContentMediaImage({
      file: fakeFile("Checkup Photo.jpg", "image/jpeg", 2048),
      contentId: "content-1",
      requestUploadTarget: async (input) => {
        calls.push({ step: "requestUploadTarget", arg: input });
        return { token: "upload-token", path: input.objectPath };
      },
      uploadToSignedUrl: async (uploadPath, token, file) => {
        calls.push({ step: "uploadToSignedUrl", arg: { uploadPath, token, fileName: file.name } });
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].step).toBe("requestUploadTarget");
    const requestArg = calls[0].arg as { objectPath: string; mimeType: string; byteSize: number };
    expect(requestArg.objectPath.startsWith("content-1/")).toBe(true);
    expect(requestArg.objectPath.endsWith("-Checkup_Photo.jpg")).toBe(true);
    expect(requestArg.mimeType).toBe("image/jpeg");
    expect(requestArg.byteSize).toBe(2048);
    expect(calls[1].step).toBe("uploadToSignedUrl");
    expect(path).toBe(requestArg.objectPath);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/admin/content/contentMediaUpload.test.ts`
Expected: FAIL — the module `./contentMediaUpload` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/components/admin/content/contentMediaUpload.ts`. `src/lib/content/schemas.ts` is a plain shared module (no `.server` suffix, no server-only imports — it only imports from `zod`), so its `MAX_CONTENT_MEDIA_BYTES`/`CONTENT_MEDIA_MIME_TYPES` constants (added in Task 2) can be imported directly here instead of being re-declared:

```typescript
import { CONTENT_MEDIA_MIME_TYPES, MAX_CONTENT_MEDIA_BYTES } from "../../../lib/content/schemas";

type UploadContentMediaImageArgs = {
  file: File;
  contentId: string;
  requestUploadTarget(input: {
    objectPath: string;
    mimeType: string;
    byteSize: number;
  }): Promise<{ token: string; path: string }>;
  uploadToSignedUrl(path: string, token: string, file: File): Promise<void>;
};

// Mirrors src/lib/publicUploads/signedUpload.server.ts's safeFileName(), kept
// as a separate copy here rather than imported: that module is a .server.ts
// file and this helper runs in the browser, so it cannot be imported from
// client code (this repo's *.server.ts files never reach the client bundle).
function safeFileName(fileName: string) {
  let baseName = fileName.split(/[\\/]/).pop()?.trim() || "file";
  if (/^\.+$/.test(baseName)) baseName = "file";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function uploadContentMediaImage({
  file,
  contentId,
  requestUploadTarget,
  uploadToSignedUrl,
}: UploadContentMediaImageArgs): Promise<string> {
  // CONTENT_MEDIA_MIME_TYPES is declared `as const` in schemas.ts, so
  // .includes() only accepts its exact literal union -- cast file.type the
  // same way src/components/site/adoption/photoUploaderLogic.ts's
  // validateSelectedFile() already does for the equivalent PHOTO_MIME_TYPES
  // check.
  if (!CONTENT_MEDIA_MIME_TYPES.includes(file.type as (typeof CONTENT_MEDIA_MIME_TYPES)[number])) {
    throw new Error("請選擇 JPG、PNG 或 WEBP 圖片");
  }
  if (file.size < 1 || file.size > MAX_CONTENT_MEDIA_BYTES) {
    throw new Error("圖片不可超過 8 MiB");
  }

  const objectPath = `${contentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const target = await requestUploadTarget({
    objectPath,
    mimeType: file.type,
    byteSize: file.size,
  });
  await uploadToSignedUrl(target.path, target.token, file);
  return target.path;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/admin/content/contentMediaUpload.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/content/contentMediaUpload.ts src/components/admin/content/contentMediaUpload.test.ts
git commit -m "feat: add the content-media client upload helper"
```

---

### Task 7: Rewrite `ContentMediaPanel`'s form to use the file picker

**Files:**
- Modify: `src/components/admin/content/ContentEditor.tsx`
- Modify: `src/components/admin/content/ContentEditor.test.tsx`

- [ ] **Step 1: Write the failing test first**

In `src/components/admin/content/ContentEditor.test.tsx`, find the existing test `"renders authoring controls for story profile, updates, media, and links"` and extend its assertions (do not remove the existing ones):

```typescript
  test("renders authoring controls for story profile, updates, media, and links", async () => {
    const { ContentAuthoringPanels } = await import("./ContentEditor");
    const markup = renderToStaticMarkup(
      <ContentAuthoringPanels
        content={content}
        pending={false}
        onCreateLink={async () => undefined}
        onSaveStoryProfile={async () => undefined}
        onCreateStoryUpdate={async () => undefined}
        onCreateMedia={async () => undefined}
      />,
    );

    expect(markup).toContain("儲存故事設定");
    expect(markup).toContain("新增故事更新");
    expect(markup).toContain("新增媒體");
    expect(markup).toContain("新增關聯紀錄");
    // The manual bucket/path text-entry fields must be gone, replaced by a
    // real file picker.
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="image/*"');
    expect(markup).not.toContain("Storage bucket");
    expect(markup).not.toContain("Storage path");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/admin/content/ContentEditor.test.tsx -t "renders authoring controls"`
Expected: FAIL — `markup` still contains `"Storage bucket"` and has no `type="file"` input.

- [ ] **Step 3: Update the imports**

In `src/components/admin/content/ContentEditor.tsx`, find:

```typescript
import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
```

Replace it with (adding the Storage client and the new upload helper; `getAdminAccessToken` was already unused by anything shown in this file's `ContentMediaPanel`/mutation code — leave it as-is if other code in the file still uses it):

```typescript
import { fetchAdminJson, getAdminAccessToken } from "../../../lib/admin/http";
import { getSupabaseClient } from "../../../lib/supabase";
import { uploadContentMediaImage } from "./contentMediaUpload";
```

- [ ] **Step 4: Rewrite the `createContentMedia` mutation to orchestrate the upload**

Find:

```typescript
  const createContentMedia = useMutation({
    mutationFn: (body: ContentMediaFormState) =>
      fetchAdminJson<{ id: string }>(`/api/admin/content/${contentId}/media`, {
        method: "POST",
        body: JSON.stringify(normalizeContentMediaForm(body)),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });
```

Replace it with:

```typescript
  const createContentMedia = useMutation({
    mutationFn: async (body: ContentMediaFormState) => {
      if (!body.file) throw new Error("請選擇圖片");
      const storagePath = await uploadContentMediaImage({
        file: body.file,
        contentId,
        requestUploadTarget: (input) =>
          fetchAdminJson(`/api/admin/content/${contentId}/media-upload-target`, {
            method: "POST",
            body: JSON.stringify(input),
          }),
        uploadToSignedUrl: async (path, token, uploadedFile) => {
          const { error } = await getSupabaseClient()
            .storage.from("content-media")
            .uploadToSignedUrl(path, token, uploadedFile, { contentType: uploadedFile.type });
          if (error) throw error;
        },
      });
      return fetchAdminJson<{ id: string }>(`/api/admin/content/${contentId}/media`, {
        method: "POST",
        body: JSON.stringify(normalizeContentMediaForm({ ...body, storagePath })),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    },
  });
```

- [ ] **Step 5: Update `ContentMediaFormState` and `normalizeContentMediaForm`**

Find:

```typescript
type ContentMediaFormState = {
  storyUpdateId: string;
  storageBucket: string;
  storagePath: string;
  altText: string;
  caption: string;
  sortOrder: string;
  isCover: boolean;
};
```

Replace it with:

```typescript
type ContentMediaFormState = {
  file: File | null;
  storyUpdateId: string;
  altText: string;
  caption: string;
  sortOrder: string;
  isCover: boolean;
};
```

Find:

```typescript
function normalizeContentMediaForm(form: ContentMediaFormState) {
  return {
    ...form,
    storyUpdateId: emptyToNull(form.storyUpdateId),
    caption: emptyToNull(form.caption),
    sortOrder: Number(form.sortOrder || 0),
  };
}
```

Replace it with (explicitly listing fields rather than spreading `form`, so the non-serializable `file` never leaks into the JSON body sent to `createContentMedia`):

```typescript
function normalizeContentMediaForm(form: ContentMediaFormState & { storagePath: string }) {
  return {
    storyUpdateId: emptyToNull(form.storyUpdateId),
    storagePath: form.storagePath,
    altText: form.altText,
    caption: emptyToNull(form.caption),
    sortOrder: Number(form.sortOrder || 0),
    isCover: form.isCover,
  };
}
```

- [ ] **Step 6: Rewrite the `ContentMediaPanel` form**

Find the whole `ContentMediaPanel` function:

```typescript
function ContentMediaPanel({
  content,
  pending,
  onCreate,
}: {
  content: ContentDetail;
  pending: boolean;
  onCreate: (form: ContentMediaFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ContentMediaFormState>({
    storyUpdateId: "",
    storageBucket: "content-media",
    storagePath: "",
    altText: "",
    caption: "",
    sortOrder: "0",
    isCover: false,
  });

  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-panel)]">媒體與相片</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          使用 Supabase Storage 路徑新增封面或故事更新相片。
        </p>
      </div>
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await onCreate(form);
          setForm({
            storyUpdateId: "",
            storageBucket: "content-media",
            storagePath: "",
            altText: "",
            caption: "",
            sortOrder: "0",
            isCover: false,
          });
        }}
      >
        <Field label="Storage bucket">
          <input
            required
            value={form.storageBucket}
            onChange={(event) =>
              setForm((current) => ({ ...current, storageBucket: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="Storage path">
          <input
            required
            value={form.storagePath}
            onChange={(event) =>
              setForm((current) => ({ ...current, storagePath: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="關聯更新">
          <select
            value={form.storyUpdateId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storyUpdateId: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            <option value="">整篇內容</option>
            {content.updates.map((update) => (
              <option key={update.id} value={update.id}>
                {update.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alt text">
          <input
            required
            value={form.altText}
            onChange={(event) =>
              setForm((current) => ({ ...current, altText: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="說明">
          <input
            value={form.caption}
            onChange={(event) =>
              setForm((current) => ({ ...current, caption: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="排序">
          <input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({ ...current, sortOrder: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-panel)] md:col-span-2">
          <input
            type="checkbox"
            checked={form.isCover}
            onChange={(event) =>
              setForm((current) => ({ ...current, isCover: event.target.checked }))
            }
          />
          設為封面
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          新增媒體
        </button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        {content.media.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">尚未有媒體。</p>
        ) : (
          content.media.map((item) => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}
```

Replace it with:

```typescript
function ContentMediaPanel({
  content,
  pending,
  onCreate,
}: {
  content: ContentDetail;
  pending: boolean;
  onCreate: (form: ContentMediaFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ContentMediaFormState>({
    file: null,
    storyUpdateId: "",
    altText: "",
    caption: "",
    sortOrder: "0",
    isCover: false,
  });

  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-panel)]">媒體與相片</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          上傳圖片作為封面或故事更新相片（JPG、PNG 或 WEBP，8 MiB 以內）。
        </p>
      </div>
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await onCreate(form);
          setForm({
            file: null,
            storyUpdateId: "",
            altText: "",
            caption: "",
            sortOrder: "0",
            isCover: false,
          });
        }}
      >
        <Field label="圖片檔案">
          <input
            required
            type="file"
            accept="image/*"
            onChange={(event) =>
              setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="關聯更新">
          <select
            value={form.storyUpdateId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storyUpdateId: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            <option value="">整篇內容</option>
            {content.updates.map((update) => (
              <option key={update.id} value={update.id}>
                {update.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alt text">
          <input
            required
            value={form.altText}
            onChange={(event) =>
              setForm((current) => ({ ...current, altText: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="說明">
          <input
            value={form.caption}
            onChange={(event) =>
              setForm((current) => ({ ...current, caption: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <Field label="排序">
          <input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({ ...current, sortOrder: event.target.value }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-panel)] md:col-span-2">
          <input
            type="checkbox"
            checked={form.isCover}
            onChange={(event) =>
              setForm((current) => ({ ...current, isCover: event.target.checked }))
            }
          />
          設為封面
        </label>
        <button
          type="submit"
          disabled={pending || !form.file}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          新增媒體
        </button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        {content.media.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">尚未有媒體。</p>
        ) : (
          content.media.map((item) => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun test src/components/admin/content/ContentEditor.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors (per this repo's `AGENTS.md`/`CLAUDE.md` convention, run the full — not scoped — gates before committing a UI-touching change).

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/content/ContentEditor.tsx src/components/admin/content/ContentEditor.test.tsx
git commit -m "feat: replace ContentMediaPanel's manual path entry with a real file upload"
```

---

### Task 8: Migration-syntax verification and disclosure of the real Storage/RLS verification gap

**Files:** none (verification only).

**Important — this task is narrower than a full real-Postgres RLS check, and that narrowing is deliberate.** This repo's established "verify against a real `postgres:16-alpine` container" standard (used successfully for BP-1's `successful_adoption` table and BP-2's `payment_public_config` table) has only ever been proven for plain `public`-schema tables. It does **not** transfer cleanly to this migration, because:
- No migration in `supabase/migrations/` and no prior plan in `docs/superpowers/plans/` ever creates the `anon`, `authenticated`, or `service_role` Postgres roles, or the `storage` schema itself (`storage.buckets`/`storage.objects`) — confirmed by grepping both directories before writing this task. Every existing migration's `insert into storage.buckets (...)` statement silently assumes that schema already exists, which is true on the real hosted Supabase platform but not on a vanilla `postgres:16-alpine` container.
- This repo has no `supabase/config.toml` and the Supabase CLI is not installed in this environment (checked: `command -v supabase` found nothing) — so `supabase start` (which would spin up the real local Storage service, GoTrue, and the `anon`/`service_role` roles faithfully) is not available either.

Attempting to hand-roll a hand-built imitation of Supabase's internal `storage.objects` RLS/role model risks producing a check that passes or fails for reasons that don't reflect the real platform at all, which is worse than not checking. So this task verifies only what a bare Postgres container can honestly prove — the migration's own SQL is syntactically valid and idempotent — and explicitly hands off the rest as a disclosed, undone gap for a human with access to the real Supabase project, matching how this session's BP-2 work disclosed its own equivalent real-Supabase-project gap rather than silently assuming it away.

- [ ] **Step 1: Start a disposable Postgres container**

```bash
docker run --rm -d --name content-media-verify -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine
```

If Docker is unavailable in this environment, stop here and tell the user explicitly — do not skip this step silently.

- [ ] **Step 2: Build a minimal stand-in for the `storage.buckets` table**

This creates just enough of Supabase's real `storage.buckets` shape to exercise the new migration's `insert` statement — it is a deliberately minimal stand-in, not a full Storage schema, and is not meant to validate RLS or any other Storage behavior:

```bash
psql "postgresql://postgres:postgres@localhost:5433/postgres" -c "
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
"
```

- [ ] **Step 3: Apply the new migration's bucket statement directly**

Rather than replaying the full migration history (which would fail immediately on the first pre-existing bucket migration, for the same schema-doesn't-exist reason described above), extract and run just the new migration file against this minimal stand-in:

```bash
psql "postgresql://postgres:postgres@localhost:5433/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831160000_content_media_storage_bucket.sql
```

Expected: applies with no SQL errors.

- [ ] **Step 4: Confirm the resulting row is correct**

```bash
psql "postgresql://postgres:postgres@localhost:5433/postgres" -c \
  "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'content-media';"
```

Expected: one row, `public = t`, `file_size_limit = 8388608`, `allowed_mime_types = {image/jpeg,image/png,image/webp}`.

- [ ] **Step 5: Confirm the migration is idempotent (re-running it doesn't error or change the row)**

```bash
psql "postgresql://postgres:postgres@localhost:5433/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831160000_content_media_storage_bucket.sql
psql "postgresql://postgres:postgres@localhost:5433/postgres" -c \
  "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'content-media';"
```

Expected: the second run succeeds (the `on conflict (id) do update set` clause handles re-application) and the row is unchanged.

- [ ] **Step 6: Tear down the container**

```bash
docker stop content-media-verify
```

- [ ] **Step 7: Explicitly disclose the remaining verification gap**

Record, in the PR description or task handoff, that the following are **not** verified by this plan and require a human with access to the real Supabase project (staging or production) before this feature can be trusted end-to-end:
1. That `storage.objects` RLS actually denies `anon`/`authenticated` writes and allows `service_role` writes for the `content-media` bucket, on the real platform.
2. That a file uploaded via a real signed upload URL is actually retrievable through its `getPublicUrl()` URL without authentication.
3. That the migration has been applied to the live project (project ref `iihqjzilgawhfdhdevam`) — this repo's own recurring failure mode, per its documented history, is a merged migration not yet applied live.

---

### Task 9: Final full-suite verification

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: every test passes, including every new/modified test from Tasks 1–7.

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Remember: `bun run build` does not typecheck — this step is not optional.)

- [ ] **Step 3: Run the full lint**

Run: `bun run lint`
Expected: 0 errors (pre-existing warnings elsewhere in the tree, e.g. `react-refresh/only-export-components`, are expected and not this feature's concern).

- [ ] **Step 4: Manually verify in a browser**

Start the dev server (`bun run dev`), open an existing content item's admin editor (`/admin/content/<id>`), and:
1. Confirm the "媒體與相片" panel now shows a file picker, not "Storage bucket"/"Storage path" text fields.
2. Pick a real JPG/PNG/WEBP image, fill in alt text, submit.
3. Confirm the new media item appears in the list below with a working image preview (its `<img src>` should load, not 404 — this is the actual end-to-end proof that the bucket is real and public, complementing Task 8's database-level checks).
4. Try picking a non-image file (e.g. a `.txt` renamed `.jpg`, or actually pick a PDF) and confirm the client-side error message appears without a network request.

This step requires a real Supabase project with the new migration applied — this repo's own established pattern is that a merged migration is not automatically applied to the live project; apply it via the Supabase Dashboard SQL editor (or `supabase db push` if using the CLI against the linked project) before this manual check, exactly as done for every prior migration in this session's history.

- [ ] **Step 5: No further commit needed**

This task is verification-only; if any check in Steps 1–4 fails, fix the issue in the relevant task above and re-run the full suite before considering the feature done.
