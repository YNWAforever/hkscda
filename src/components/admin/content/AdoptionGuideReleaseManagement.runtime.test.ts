import { describe, expect, test } from "bun:test";
import { AdminApiError } from "../../../lib/admin/session";
import { uploadDocumentPdf } from "./documentUpload";

import type {
  AdoptionGuidePreview,
  AdoptionGuideRelease,
} from "../../../lib/adoptionGuideReleases/types";
import {
  buildAdoptionGuideUploadMetadata,
  getAdoptionGuidePublishAttempt,
  isAdoptionGuideReleaseContextLocked,
  evaluateAdoptionGuideReleaseWorkflow,
  fetchAllAdoptionGuideAssets,
  invalidateAdoptionGuidePublishQueries,
  resolveLinkedAdoptionGuideRelease,
  selectAdoptionGuideAssetsForLanguage,
  resolveMutationError,
} from "./adoptionGuideReleaseLogic";

const release: AdoptionGuideRelease = {
  id: "0c2a4b5d-4464-49f3-8fad-d6e1021f5214",
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: "94dd21e9-ac7d-4e77-a6e8-d85e5e5d21a0",
  enAssetId: "b71357d2-0656-4b85-a48a-cc53314e5cda",
  knowledgePostId: null,
  knowledgeTitle: "Cat guide",
  knowledgeTopic: "Post adoption",
  knowledgeShortIntro: "A complete guide.",
  knowledgeSourceName: null,
  sortOrder: 0,
  state: "draft",
  version: 2,
  createdBy: "df576625-487e-4c75-8d2f-0d45053b9d99",
  updatedBy: "df576625-487e-4c75-8d2f-0d45053b9d99",
  submittedBy: null,
  submittedAt: null,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const preview: AdoptionGuidePreview = {
  release,
  readiness: { ready: true, issues: [] },
  adoptionPanel: {
    heading: "Cat guide",
    zhHkUrl: "https://preview.test/zh",
    enUrl: "https://preview.test/en",
  },
  knowledgeCard: {
    title: "Cat guide",
    topic: "Post adoption",
    shortIntro: "A complete guide.",
    sourceName: null,
    zhHkUrl: "https://preview.test/zh",
    enUrl: "https://preview.test/en",
  },
};

const draft = {
  topic: release.topic,
  species: release.species,
  zhHkAssetId: release.zhHkAssetId,
  enAssetId: release.enAssetId,
  knowledgeTitle: release.knowledgeTitle,
  knowledgeTopic: release.knowledgeTopic,
  knowledgeShortIntro: release.knowledgeShortIntro,
  knowledgeSourceName: release.knowledgeSourceName,
  sortOrder: release.sortOrder,
};

describe("adoption guide release workspace runtime helpers", () => {
  test("selects the release referenced by an owner link even outside the current page", () => {
    const linked = { ...release, id: "linked-release" };
    expect(resolveLinkedAdoptionGuideRelease([release], linked.id, linked)).toBe(linked);
    expect(resolveLinkedAdoptionGuideRelease([release], release.id, linked)).toBe(release);
  });

  test("blocks stale previews and unsaved changes, then unlocks after save and a fresh preview", () => {
    expect(
      evaluateAdoptionGuideReleaseWorkflow({
        release,
        draft: { ...draft, knowledgeTitle: "Changed locally" },
        preview,
        previewSucceeded: true,
      }),
    ).toMatchObject({ dirty: true, canSubmit: false, message: "請先儲存變更，然後重新整理預覽。" });

    expect(
      evaluateAdoptionGuideReleaseWorkflow({
        release,
        draft,
        preview: { ...preview, release: { ...release, version: 1 } },
        previewSucceeded: true,
      }),
    ).toMatchObject({ previewFresh: false, canSubmit: false });

    expect(
      evaluateAdoptionGuideReleaseWorkflow({ release, draft, preview, previewSucceeded: true }),
    ).toMatchObject({ dirty: false, previewFresh: true, canSubmit: true });
    expect(
      evaluateAdoptionGuideReleaseWorkflow({
        release: { ...release, state: "in_review" },
        draft,
        preview: { ...preview, release: { ...release, state: "in_review" } },
        previewSucceeded: true,
      }),
    ).toMatchObject({ canPublish: true });
  });

  test("loads later asset pages, filters choices by language, and stamps upload metadata", async () => {
    const calls: number[] = [];
    const zhAsset = { id: "zh", kind: "adoption_guide", language: "zh-HK" };
    const enAsset = { id: "en", kind: "adoption_guide", language: "en" };
    const assets = await fetchAllAdoptionGuideAssets(async (page) => {
      calls.push(page);
      return page === 1
        ? { items: [zhAsset], total: 2, page: 1, pageSize: 1 }
        : { items: [enAsset], total: 2, page: 2, pageSize: 1 };
    });

    expect(calls).toEqual([1, 2]);
    expect(selectAdoptionGuideAssetsForLanguage(assets, "en")).toEqual([enAsset]);
    expect(buildAdoptionGuideUploadMetadata(release, "en")).toMatchObject({
      kind: "adoption_guide",
      language: "en",
    });
  });

  test("invalidates release, document, and knowledge queries after publication", async () => {
    const keys: unknown[] = [];
    await invalidateAdoptionGuidePublishQueries({
      invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
        keys.push(queryKey);
        return Promise.resolve();
      },
    });

    expect(keys).toEqual([["adoption-guide-releases"], ["documents"], ["knowledge"]]);
  });
  test("preserves conflict drafts, reuses a publish idempotency key, locks context, and validates uploads", async () => {
    const localDraft = { ...draft, knowledgeTitle: "Local title" };
    const conflict = resolveMutationError(
      new AdminApiError({ status: 409, code: "conflict", message: "Changed elsewhere" }),
      localDraft,
    );
    expect(conflict).toMatchObject({ kind: "conflict", preservedDraft: localDraft });

    const first = getAdoptionGuidePublishAttempt(null, release.id, release.version, () => ({
      idempotencyKey: "stable-key",
      payload: { expectedVersion: release.version, idempotencyKey: "stable-key" },
    }));
    const retry = getAdoptionGuidePublishAttempt(first, release.id, release.version);
    expect(retry.payload.idempotencyKey).toBe("stable-key");
    expect(isAdoptionGuideReleaseContextLocked("publish")).toBe(true);
    expect(isAdoptionGuideReleaseContextLocked()).toBe(false);

    await expect(
      uploadDocumentPdf({
        file: new File(["not a PDF"], "guide.txt", { type: "text/plain" }),
        objectPath: "adoption-guides/cat/en/guide.txt",
        metadata: { kind: "adoption_guide", title: "Guide", language: "en", sortOrder: 0 },
        requestUploadTarget: async () => ({ token: "unused", path: "unused" }),
        uploadToSignedUrl: async () => undefined,
        createAsset: async () => undefined,
      }),
    ).rejects.toThrow();
  });
  test("uses the production runtime controller for retry, effects, conflict retention, and upload metadata", async () => {
    const { createAdoptionGuideReleaseRuntimeController } =
      await import("./adoptionGuideReleaseLogic");
    expect(typeof createAdoptionGuideReleaseRuntimeController).toBe("function");

    const calls: Array<{ kind: "invalidate" | "refetch"; key: unknown }> = [];
    const errors: Array<string | undefined> = [];
    let keyNumber = 0;
    let uploadInput: unknown;
    const controller = createAdoptionGuideReleaseRuntimeController({
      queryClient: {
        invalidateQueries: async ({ queryKey }: { queryKey: unknown }) => {
          calls.push({ kind: "invalidate", key: queryKey });
        },
        refetchQueries: async ({ queryKey }: { queryKey: unknown }) => {
          calls.push({ kind: "refetch", key: queryKey });
        },
      },
      setLocalError: (message: string | undefined) => errors.push(message),
      createIdempotencyKey: () => `publish-${++keyNumber}`,
    });

    const localDraft = { ...draft, knowledgeTitle: "Kept locally" };
    const conflict = controller.onActionError(
      new AdminApiError({ status: 409, code: "conflict", message: "Changed elsewhere" }),
      localDraft,
    );
    expect(conflict).toMatchObject({ kind: "conflict", preservedDraft: localDraft });
    expect(errors.at(-1)).toBe("This release changed elsewhere. Reload before saving again.");

    const firstPublish = controller.getPublishPayload(release);
    controller.onActionError(new Error("publish failed"), firstPublish);
    expect(controller.getPublishPayload(release)).toEqual(firstPublish);
    await controller.onActionSuccess({ operation: "publish", releaseId: release.id });
    expect(controller.getPublishPayload(release).idempotencyKey).toBe("publish-2");

    await controller.onActionSuccess({ operation: "save", releaseId: release.id });
    expect(calls).toEqual([
      { kind: "invalidate", key: ["adoption-guide-releases"] },
      { kind: "invalidate", key: ["documents"] },
      { kind: "invalidate", key: ["knowledge"] },
      { kind: "invalidate", key: ["adoption-guide-releases", release.id, "preview"] },
      { kind: "invalidate", key: ["adoption-guide-releases"] },
      { kind: "invalidate", key: ["adoption-guide-releases", release.id, "preview"] },
      { kind: "refetch", key: ["adoption-guide-releases"] },
      { kind: "refetch", key: ["adoption-guide-releases", release.id, "preview"] },
    ]);

    const upload = await controller.upload({
      release,
      language: "en",
      file: new File(["pdf"], "guide.pdf", { type: "application/pdf" }),
      id: "asset-id",
      uploadPdf: async (input: unknown) => {
        uploadInput = input;
        return { id: "asset" };
      },
    });
    expect(uploadInput).toMatchObject({
      objectPath: "adoption-guides/cat/en/asset-id.pdf",
      metadata: { kind: "adoption_guide", language: "en" },
    });
    expect((uploadInput as { metadata: unknown }).metadata).toBe(upload.metadata);
  });
});
