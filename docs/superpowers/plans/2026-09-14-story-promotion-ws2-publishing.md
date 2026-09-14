# Story & Promotion Center — WS2 Publishing Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make publishing return field-level validation errors and make a story update with `shouldGenerateAdopterDrafts` create adopter notification drafts automatically (or a non-blocking warning).

**Architecture:** Keep the existing layered content domain. The field-level validator already exists in `src/lib/content/rules.ts` but is bypassed by the wired lifecycle/media lifecycle publish path; run it there before the RPC. Extract one reusable adopter-draft helper in `src/lib/content/service.ts` and call it from both the manual endpoint and the update-save path.

**Tech Stack:** TypeScript (strict), Zod, React 19, TanStack Query, `bun:test`. Repo gates: `bun test`, `bunx tsc --noEmit`, `bun run lint`.

## Global Constraints

- Hand-written code has zero `any`.
- Admin mutations write an `audit_log` row; match the existing audit shape in `service.ts`.
- The SQL publish RPC remains authoritative; the app-layer check is a UX gate that mirrors it.
- Adopter-draft generation must never roll back a saved story update, and must not regenerate a draft that already exists for the same update/channel/contact.
- No new content types; no editor redesign; no public cache changes.
- Tests live beside the source as `*.test.ts(x)`, use `bun:test`, and inject fakes.

---

### Task 1: Field-level publish rules

**Files:**
- Modify: `src/lib/content/rules.ts` (`validatePublishableContent`)
- Test: `src/lib/content/rules.test.ts`

**Interfaces:**
- Consumes: `ContentDetail`, `PublishValidationIssue` from `./types`.
- Produces: `validatePublishableContent(content: ContentDetail): PublishValidationIssue[]` (unchanged signature). New: explicitly flags rescue `animalType` and `publicStatus`; no longer requires `publishedAt` (the RPC sets it).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/content/rules.test.ts` (reuse the file's existing `baseContent`/`detail` helpers; if none exist, build a minimal `ContentDetail`):

```ts
import { describe, expect, test } from "bun:test";
import { validatePublishableContent } from "./rules";
import type { ContentDetail } from "./types";

function content(over: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: "c1",
    slug: "a-slug",
    type: "event",
    title: "Title",
    subtitle: null,
    summary: "Summary",
    coverMediaId: "11111111-1111-1111-1111-111111111111",
    coverImageUrl: "https://example.test/c.jpg",
    status: "draft",
    publishedAt: null,
    ctaLabel: null,
    ctaUrl: null,
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: null,
    seoTitle: null,
    seoDescription: null,
    ogTitle: null,
    ogDescription: null,
    links: [],
    media: [],
    updates: [],
    socialCopies: [],
    notificationDrafts: [],
    ...over,
  } as ContentDetail;
}

describe("validatePublishableContent type coverage", () => {
  test("accepts a complete event/market/report and does not require publishedAt", () => {
    for (const type of ["event", "charity_market", "report"] as const) {
      expect(validatePublishableContent(content({ type }))).toEqual([]);
    }
  });

  test("requires the shared fields for every type", () => {
    const issues = validatePublishableContent(
      content({ title: "", slug: "", summary: "", coverMediaId: null, coverImageUrl: null }),
    );
    expect(issues.map((i) => i.field).sort()).toEqual([
      "coverMediaId",
      "slug",
      "summary",
      "title",
    ]);
  });

  test("requires rescue animalType and publicStatus", () => {
    const issues = validatePublishableContent(
      content({
        type: "rescue_story",
        storyProfile: {
          contentItemId: "c1",
          animalType: "" as never,
          publicStatus: "" as never,
          rescueRegion: "Sha Tin",
          rescueDate: null,
          showOnMap: false,
          publicMapLabel: null,
          publicLat: null,
          publicLng: null,
          internalAddress: null,
          internalLocationNotes: null,
          isFeatured: false,
        },
      }),
    );
    expect(issues.map((i) => i.field)).toContain("animalType");
    expect(issues.map((i) => i.field)).toContain("publicStatus");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/content/rules.test.ts`
Expected: FAIL — the rescue case does not report `animalType`/`publicStatus`; the shared-field case currently includes `publishedAt`.

- [ ] **Step 3: Update the validator**

In `src/lib/content/rules.ts`, replace `validatePublishableContent` with:

```ts
export function validatePublishableContent(content: ContentDetail): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  if (blank(content.title))
    issues.push({ field: "title", message: "Title is required before publishing" });
  if (blank(content.slug))
    issues.push({ field: "slug", message: "Slug is required before publishing" });
  if (blank(content.summary))
    issues.push({ field: "summary", message: "Summary is required before publishing" });
  if (blank(content.coverMediaId) && blank(content.coverImageUrl)) {
    issues.push({ field: "coverMediaId", message: "Cover image is required before publishing" });
  }
  // publishedAt is intentionally not required: the publish function sets it.
  if (content.type === "rescue_story") {
    if (!content.storyProfile) {
      issues.push({
        field: "storyProfile",
        message: "Rescue stories need Story Wall settings before publishing",
      });
    } else {
      if (blank(content.storyProfile.animalType)) {
        issues.push({
          field: "animalType",
          message: "Animal type is required before publishing",
        });
      }
      if (blank(content.storyProfile.publicStatus)) {
        issues.push({
          field: "publicStatus",
          message: "Public status is required before publishing",
        });
      }
      if (blank(content.storyProfile.rescueRegion)) {
        issues.push({
          field: "rescueRegion",
          message: "Rescue region is required before publishing",
        });
      }
      issues.push(...validateStoryMapVisibility(content.storyProfile));
    }
  }
  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/content/rules.test.ts`
Expected: PASS. Also run `bun test src/lib/content` to confirm no other rule test regressed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/rules.ts src/lib/content/rules.test.ts
git commit -m "feat(content): validate animal type and status before publishing"
```

---

### Task 2: Enforce field-level validation on the publish path

**Files:**
- Modify: `src/lib/content/service.ts` (`publishContent`)
- Test: `src/lib/content/service.test.ts`, `src/lib/content/http.test.ts`

**Interfaces:**
- Consumes: `validatePublishableContent` (Task 1), `ContentValidationError`, `repo.getAdminContent`.
- Produces: `publishContent` throws `ContentValidationError(issues)` before calling `mediaLifecycle.publish`, `lifecycle.publish`, or `repo.publishContent`; the HTTP layer already maps that to `400 { error: "Content item cannot be published", issues }`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/content/service.test.ts` (use the file's existing fake `repo`/`mediaLifecycle` builders):

```ts
test("publishContent returns field-level issues for an incomplete draft", async () => {
  const { service } = buildService({
    content: { summary: "", coverMediaId: null, coverImageUrl: null },
    mediaLifecycle: { publish: async () => ({ version: 1, revisionId: "r1" }) },
  });
  await expect(service.publishContent({ actorUserId: "u1", contentId: "c1", input: {} }))
    .rejects.toMatchObject({
      name: "ContentValidationError",
      issues: expect.arrayContaining([expect.objectContaining({ field: "summary" })]),
    });
});

test("publishContent publishes a complete draft", async () => {
  const publish = mock(async () => ({ version: 2, revisionId: "r2" }));
  const { service } = buildService({
    content: {},
    mediaLifecycle: { publish },
  });
  await service.publishContent({ actorUserId: "u1", contentId: "c1", input: {} });
  expect(publish).toHaveBeenCalled();
});
```

If `service.test.ts` has no `buildService`, add one near the top that assembles `createContentService` from the file's existing fakes and lets the test override the admin content + `mediaLifecycle`. Import `mock` from `bun:test`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/content/service.test.ts -t "field-level issues"`
Expected: FAIL — `publishContent` currently calls `mediaLifecycle.publish` without validation.

- [ ] **Step 3: Add the pre-check**

In `src/lib/content/service.ts`, change `publishContent` to validate first (this unifies all three branches):

```ts
    async publishContent({ actorUserId, contentId, input }: ContentActionArgs) {
      const draft = await repo.getAdminContent(contentId);
      if (!draft) throw new Error("Content item not found");

      const issues = validatePublishableContent(draft);
      if (issues.length > 0) throw new ContentValidationError(issues);

      if (mediaLifecycle) {
        const result = await mediaLifecycle.publish({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }
      if (lifecycle) {
        const result = await lifecycle.publish({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }

      const published = await repo.publishContent(contentId);
      await audit({
        actor_user_id: actorUserId,
        action: "content.publish",
        entity: "content_item",
        entity_id: contentId,
        detail: { slug: published.slug },
      });

      return published;
    },
```

- [ ] **Step 4: Add the HTTP test and run**

Add to `src/lib/content/http.test.ts` a publish case where the fake service throws `new ContentValidationError([{ field: "summary", message: "…" }])`; assert the response is `400` and `body.issues[0].field === "summary"` (follow the file's existing handler-fake pattern).

Run: `bun test src/lib/content/service.test.ts src/lib/content/http.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/service.ts src/lib/content/service.test.ts src/lib/content/http.test.ts
git commit -m "feat(content): enforce field-level publish validation on the lifecycle path"
```

---

### Task 3: Auto-generate adopter drafts on update save

**Files:**
- Modify: `src/lib/content/service.ts` (`createStoryUpdate`, `generateNotificationDrafts`, new helper)
- Test: `src/lib/content/service.test.ts`, `src/lib/content/repository.server.test.ts`

**Interfaces:**
- Consumes: `buildAdopterNotificationDrafts`, `repo.resolveAdopterRecipients`, `repo.getStoryUpdate`, `repo.getAdminContent`, `repo.insertNotificationDrafts`.
- Produces: `createStoryUpdate` returns `{ id: string, notificationDrafts: { created: number, warning: string | null } }`. The manual `generateNotificationDrafts` keeps returning `{ count: number }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/content/service.test.ts`:

```ts
test("saving an update with the toggle creates adopter drafts", async () => {
  const inserted: unknown[] = [];
  const { service } = buildService({
    content: {},
    storyUpdate: { id: "u1", contentItemId: "c1", visibility: "public", title: "救起", body: "近況", shouldGenerateAdopterDrafts: true },
    recipients: [{ adoptionCaseId: "a1", supporterId: "s1", name: "陳太", email: "adopter@example.test", phone: null }],
    insertNotificationDrafts: async (rows) => { inserted.push(...rows); },
  });
  const result = await service.createStoryUpdate({
    actorUserId: "u1",
    contentId: "c1",
    input: { kind: "care", title: "救起", occurredAt: "2026-09-14T00:00:00.000Z", visibility: "public", shouldGenerateAdopterDrafts: true },
  });
  expect(result.notificationDrafts.created).toBe(1);
  expect(result.notificationDrafts.warning).toBeNull();
  expect(inserted).toHaveLength(1);
});

test("no resolvable recipients still saves the update and warns", async () => {
  const { service } = buildService({
    content: {},
    storyUpdate: { id: "u1", contentItemId: "c1", visibility: "public", title: "救起", body: null, shouldGenerateAdopterDrafts: true },
    recipients: [],
  });
  const result = await service.createStoryUpdate({
    actorUserId: "u1",
    contentId: "c1",
    input: { kind: "care", title: "救起", occurredAt: "2026-09-14T00:00:00.000Z", visibility: "public", shouldGenerateAdopterDrafts: true },
  });
  expect(result.id).toBeTruthy();
  expect(result.notificationDrafts.created).toBe(0);
  expect(result.notificationDrafts.warning).toBeTruthy();
});

test("a generation failure does not throw and the update is saved", async () => {
  const { service, repo } = buildService({
    content: {},
    storyUpdate: { id: "u1", contentItemId: "c1", visibility: "public", title: "救起", body: null, shouldGenerateAdopterDrafts: true },
    recipientsError: new Error("boom"),
  });
  const result = await service.createStoryUpdate({
    actorUserId: "u1",
    contentId: "c1",
    input: { kind: "care", title: "救起", occurredAt: "2026-09-14T00:00:00.000Z", visibility: "public", shouldGenerateAdopterDrafts: true },
  });
  expect(result.notificationDrafts.created).toBe(0);
  expect(result.notificationDrafts.warning).toBeTruthy();
  expect(repo.createStoryUpdate).toHaveBeenCalled();
});

test("an existing draft for the same update/contact is not regenerated", async () => {
  const { service } = buildService({
    content: { notificationDrafts: [{ storyUpdateId: "u1", channel: "email", recipientContact: "adopter@example.test" }] },
    storyUpdate: { id: "u1", contentItemId: "c1", visibility: "public", title: "救起", body: null, shouldGenerateAdopterDrafts: true },
    recipients: [{ adoptionCaseId: "a1", supporterId: "s1", name: "陳太", email: "adopter@example.test", phone: null }],
  });
  const result = await service.createStoryUpdate({
    actorUserId: "u1",
    contentId: "c1",
    input: { kind: "care", title: "救起", occurredAt: "2026-09-14T00:00:00.000Z", visibility: "public", shouldGenerateAdopterDrafts: true },
  });
  expect(result.notificationDrafts.created).toBe(0);
});
```

Add to `src/lib/content/repository.server.test.ts` (the currently-missing spec test) a case that `resolveAdopterRecipients` resolves a recipient from a linked `adoption_case` plus its `supporter`, using the file's fake Supabase client: expect one recipient with the supporter's name + email.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/content/service.test.ts src/lib/content/repository.server.test.ts`
Expected: FAIL — `createStoryUpdate` returns only `{ id }` and never generates drafts.

- [ ] **Step 3: Extract the helper and wire both paths**

In `src/lib/content/service.ts`, inside `createContentService`, add a helper before the returned object:

```ts
  async function draftAdopterNotifications(actorUserId: string | null, update: StoryUpdate) {
    assertPublicOutboundStoryUpdate(update);
    const content = await repo.getAdminContent(update.contentItemId);
    if (!content) throw new Error("Content item not found");

    const recipients = await repo.resolveAdopterRecipients(content.id);
    const publicUrl = publicStoryUrl(publicBaseUrl, content.slug);
    const alreadyDrafted = new Set(
      content.notificationDrafts
        .filter((draft) => draft.storyUpdateId === update.id)
        .map((draft) => `${draft.channel}:${draft.recipientContact}`),
    );

    const drafts = buildAdopterNotificationDrafts({
      contentItemId: content.id,
      storyUpdateId: update.id,
      storyTitle: content.title,
      updateTitle: update.title,
      updateBody: update.body,
      publicUrl,
      recipients,
    }).filter((draft) => !alreadyDrafted.has(`${draft.channel}:${draft.recipientContact}`));

    await repo.insertNotificationDrafts(drafts);
    await audit({
      actor_user_id: actorUserId,
      action: "content.notification_draft.generate",
      entity: "recipient_notification_draft",
      entity_id: update.id,
      detail: { count: drafts.length },
    });
    return drafts.length;
  }
```

Replace `generateNotificationDrafts`'s body with a call to it:

```ts
    async generateNotificationDrafts({ actorUserId, storyUpdateId }: GenerateNotificationDraftsArgs) {
      const update = await repo.getStoryUpdate(storyUpdateId);
      if (!update) throw new Error("Story update not found");
      const count = await draftAdopterNotifications(actorUserId, update);
      return { count };
    },
```

Replace `createStoryUpdate` with:

```ts
    async createStoryUpdate({ actorUserId, contentId, input }: CreateStoryUpdateArgs) {
      const parsed = storyUpdateInputSchema.parse(input);
      let id: string;

      if (lifecycle) {
        const result = await lifecycle.update({ actorUserId, contentId, input });
        if (!result.childId) throw new Error("Content lifecycle did not return a child id");
        id = result.childId;
      } else {
        id = await repo.createStoryUpdate(contentId, parsed);
        await audit({
          actor_user_id: actorUserId,
          action: "content.story_update.create",
          entity: "story_update",
          entity_id: id,
          detail: {
            contentId,
            kind: parsed.kind,
            visibility: parsed.visibility,
            shouldGenerateAdopterDrafts: parsed.shouldGenerateAdopterDrafts,
          },
        });
      }

      const notificationDrafts = { created: 0, warning: null as string | null };
      if (parsed.shouldGenerateAdopterDrafts) {
        if (parsed.visibility !== "public") {
          notificationDrafts.warning = "內部更新不會建立通知草稿。";
        } else {
          try {
            const update = await repo.getStoryUpdate(id);
            if (!update) throw new Error("Story update not found");
            notificationDrafts.created = await draftAdopterNotifications(actorUserId, update);
            if (notificationDrafts.created === 0) {
              notificationDrafts.warning = "沒有可聯絡的領養者，已略過通知草稿。";
            }
          } catch {
            notificationDrafts.warning = "通知草稿建立失敗，更新已儲存。";
          }
        }
      }

      return { id, notificationDrafts };
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/content/service.test.ts src/lib/content/repository.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/service.ts src/lib/content/service.test.ts src/lib/content/repository.server.test.ts
git commit -m "feat(content): auto-generate adopter drafts when saving a story update"
```

---

### Task 4: Surface draft results in the editor

**Files:**
- Modify: `src/components/admin/content/ContentEditor.tsx`
- Test: `src/components/admin/content/ContentEditor.test.tsx`

**Interfaces:**
- Consumes: the `createStoryUpdate` response `{ id, notificationDrafts }` (Task 3).
- Produces: a visible notice after saving an update: "已建立 N 份通知草稿" or the warning text.

- [ ] **Step 1: Write the failing test**

Add to `src/components/admin/content/ContentEditor.test.tsx` a test that renders the editor with a mocked `POST .../updates` returning `{ id: "u1", notificationDrafts: { created: 2, warning: null } }`, submits an update with the toggle on, and asserts `已建立 2 份通知草稿` appears. Follow the file's existing render/mock setup.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/admin/content/ContentEditor.test.tsx -t "通知草稿"`
Expected: FAIL — the response's `notificationDrafts` is ignored.

- [ ] **Step 3: Display the result**

In `src/components/admin/content/ContentEditor.tsx`:

1. Widen the mutation type and capture the result:

```ts
  const [updateDraftNotice, setUpdateDraftNotice] = useState<string | null>(null);

  const createStoryUpdate = useMutation({
    mutationFn: (body: StoryUpdateFormState) =>
      fetchAdminJson<{ id: string; notificationDrafts?: { created: number; warning: string | null } }>(
        `/api/admin/content/${contentId}/updates`,
        {
          method: "POST",
          body: JSON.stringify({
            ...normalizeStoryUpdateForm(body),
            expectedVersion: expectedFor("update"),
          }),
        },
      ),
    onSuccess: (result) => {
      setUpdateDraftNotice(
        result.notificationDrafts
          ? result.notificationDrafts.warning ?? `已建立 ${result.notificationDrafts.created} 份通知草稿`
          : null,
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-content-detail", contentId] });
    },
  });
```

2. Render the notice next to the timeline (near line 527, before `ContentRevisionPanel`), with `role="status"`:

```tsx
      {updateDraftNotice ? (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
        >
          {updateDraftNotice}
        </p>
      ) : null}
```

Reset `setUpdateDraftNotice(null)` when the content reloads (in the same effect that recalculates form state on `content` change).

- [ ] **Step 4: Run the tests and gates**

Run: `bun test src/components/admin/content/ContentEditor.test.tsx`
Expected: PASS.
Run: `bun test src/lib/content && bunx tsc --noEmit && bun run lint`
Expected: no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/ContentEditor.tsx src/components/admin/content/ContentEditor.test.tsx
git commit -m "feat(content): show adopter draft results after saving an update"
```

---

## Self-Review

**Spec coverage (WS2):**
- Field-level publish errors → Tasks 1, 2.
- Auto adopter drafts on save + non-blocking warning + no-rollback + idempotency → Task 3.
- Recipient resolution from linked adoption records (the spec's uncovered test) → Task 3.
- Editor surfaces the result → Task 4.

**Placeholder scan:** every code step contains full code; every command has expected output. Tests that depend on existing fakes say so explicitly rather than inventing a new harness.

**Type consistency:** `notificationDrafts: { created, warning }` is identical in the service (Task 3) and the editor (Task 4); `validatePublishableContent` keeps its `(content) => issues` signature across Tasks 1 and 2.

## Notes for the implementer

- `service.test.ts`, `http.test.ts`, and `ContentEditor.test.tsx` already have fake/harness patterns — extend them rather than creating new ones; where a new `buildService` is required, compose the file's existing fakes.
- Do not change the public cache headers, `ContentTimeline`, or any unrelated behaviour.
