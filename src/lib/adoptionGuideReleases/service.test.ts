import { describe, expect, mock, test } from "bun:test";

import type { DocumentAsset } from "../documents/types";
import type {
  AdoptionGuideReleaseRepository,
  AdoptionGuideAdminQuery,
} from "./repository.server";
import { AdoptionGuideReleaseError, createAdoptionGuideReleaseService } from "./service";
import type { AdoptionGuideActor, AdoptionGuideDraftInput } from "./service";
import type { AdoptionGuideRelease } from "./types";

const releaseId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const zhAssetId = "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b";
const enAssetId = "21e42e2a-5d0e-4778-97ba-4e2c3ac3b594";
const authUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";
const adminUserId = "cc928a80-ff73-4a9a-935a-a05c02fa0758";

const staff: AdoptionGuideActor = { adminUserId, authUserId, role: "staff" };
const admin: AdoptionGuideActor = { adminUserId, authUserId, role: "admin" };

const draftInput: AdoptionGuideDraftInput = {
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: zhAssetId,
  enAssetId,
  knowledgeTitle: "Caring for your cat after adoption",
  knowledgeTopic: "Post adoption care",
  knowledgeShortIntro: "A practical guide for the first weeks at home.",
  knowledgeSourceName: null,
  sortOrder: 0,
};

const release: AdoptionGuideRelease = {
  id: releaseId,
  ...draftInput,
  knowledgePostId: null,
  state: "draft",
  version: 2,
  createdBy: adminUserId,
  updatedBy: adminUserId,
  submittedBy: null,
  submittedAt: null,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const zhAsset: DocumentAsset = {
  id: zhAssetId,
  kind: "adoption_guide",
  title: "Cat adoption guide",
  language: "zh-HK",
  bucketName: "site-documents",
  objectPath: "adoption-guides/cat-zh.pdf",
  fileUrl: null,
  mimeType: "application/pdf",
  byteSize: 10,
  checksumSha256: null,
  isPublished: false,
  sortOrder: 0,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};
const enAsset: DocumentAsset = {
  ...zhAsset,
  id: enAssetId,
  language: "en",
  objectPath: "adoption-guides/cat-en.pdf",
};

function createRepository(overrides: Partial<AdoptionGuideReleaseRepository> = {}) {
  const repository: AdoptionGuideReleaseRepository = {
    list: mock(async (query: AdoptionGuideAdminQuery) => ({
      items: [release],
      total: 1,
      page: query.page,
      pageSize: query.pageSize,
    })),
    getById: mock(async () => release),
    getAssets: mock(async () => ({
      zhHk: { asset: zhAsset, objectVerified: true },
      en: { asset: enAsset, objectVerified: true },
    })),
    create: mock(async (input) => ({ ...release, ...input })),
    update: mock(async (_id, input) => ({ ...release, ...input })),
    transition: mock(async ({ operation }) => ({
      ...release,
      state: (operation === "submit" ? "in_review" : "draft") as AdoptionGuideRelease["state"],
      version: release.version + 1,
    })),
    previewAssetUrl: mock(async (asset) => `https://private.example/${asset.objectPath}`),
    publish: mock(async () => ({
      releaseId,
      releaseVersion: 3,
      knowledgePostId: enAssetId,
      zhHkAssetId: zhAssetId,
      enAssetId,
      slotKey: "post_adoption_guide_cat",
    })),
    ...overrides,
  };
  return repository;
}

async function captureError(action: () => Promise<unknown>) {
  return action().catch((reason) => reason);
}

describe("createAdoptionGuideReleaseService", () => {
  test("allows staff to create and update incomplete drafts", async () => {
    const incomplete = {
      ...draftInput,
      zhHkAssetId: null,
      enAssetId: null,
      knowledgeTitle: "",
      knowledgeTopic: "",
      knowledgeShortIntro: "",
    };
    const repository = createRepository({
      getById: mock(async () => ({ ...release, ...incomplete })),
    });
    const service = createAdoptionGuideReleaseService(repository);

    await service.createDraft({ actor: staff, input: incomplete });
    await service.updateDraft({
      actor: staff,
      id: releaseId,
      input: { ...incomplete, expectedVersion: 2 },
    });

    expect(repository.create).toHaveBeenCalledWith(incomplete, authUserId);
    expect(repository.update).toHaveBeenCalledWith(
      releaseId,
      { ...incomplete, expectedVersion: 2 },
      authUserId,
    );
    expect(repository.getAssets).not.toHaveBeenCalled();
  });

  test("rejects submission when selected release assets are not ready", async () => {
    const repository = createRepository({
      getAssets: mock(async () => ({
        zhHk: { asset: zhAsset, objectVerified: true },
        en: { asset: enAsset, objectVerified: false },
      })),
    });
    const service = createAdoptionGuideReleaseService(repository);

    const error = await captureError(() =>
      service.submit({ actor: staff, id: releaseId, expectedVersion: 2 }),
    );

    expect(repository.getAssets).toHaveBeenCalledWith(zhAssetId, enAssetId);
    expect(error).toBeInstanceOf(AdoptionGuideReleaseError);
    expect(error).toMatchObject({ code: "invalid", status: 422 });
    expect((error as AdoptionGuideReleaseError).issues).toContainEqual(
      expect.objectContaining({ code: "english_asset_unverified" }),
    );
    expect(repository.transition).not.toHaveBeenCalled();
  });

  test("allows staff to submit and withdraw through repository transitions", async () => {
    const repository = createRepository();
    const service = createAdoptionGuideReleaseService(repository);

    await service.submit({ actor: staff, id: releaseId, expectedVersion: 2 });
    repository.getById = mock(async () => ({ ...release, state: "in_review" as const }));
    await service.withdraw({ actor: staff, id: releaseId, expectedVersion: 2 });

    expect(repository.transition).toHaveBeenNthCalledWith(1, {
      id: releaseId,
      expectedVersion: 2,
      operation: "submit",
      actorUserId: authUserId,
    });
    expect(repository.transition).toHaveBeenNthCalledWith(2, {
      id: releaseId,
      expectedVersion: 2,
      operation: "withdraw",
      actorUserId: authUserId,
    });
  });

  test("requires admin approval to return or publish", async () => {
    const repository = createRepository();
    const service = createAdoptionGuideReleaseService(repository);

    const returnError = await captureError(() =>
      service.returnToDraft({ actor: staff, id: releaseId, expectedVersion: 2 }),
    );
    const publishError = await captureError(() =>
      service.publish({
        actor: staff,
        id: releaseId,
        expectedVersion: 2,
        idempotencyKey: "publish-cat-guide-0001",
      }),
    );

    expect(returnError).toMatchObject({
      code: "forbidden",
      status: 403,
      message: "Admin approval is required.",
    });
    expect(publishError).toMatchObject({
      code: "forbidden",
      status: 403,
      message: "Admin approval is required.",
    });
    expect(repository.getById).not.toHaveBeenCalled();
    expect(repository.transition).not.toHaveBeenCalled();
    expect(repository.publish).not.toHaveBeenCalled();
  });

  test("allows an admin to return and publish ready in-review releases", async () => {
    const repository = createRepository({
      getById: mock(async () => ({ ...release, state: "in_review" as const })),
    });
    const service = createAdoptionGuideReleaseService(repository);

    await service.returnToDraft({ actor: admin, id: releaseId, expectedVersion: 2 });
    await service.publish({
      actor: admin,
      id: releaseId,
      expectedVersion: 2,
      idempotencyKey: "publish-cat-guide-0001",
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: releaseId,
      expectedVersion: 2,
      operation: "return_to_draft",
      actorUserId: authUserId,
    });
    expect(repository.getAssets).toHaveBeenCalledWith(zhAssetId, enAssetId);
    expect(repository.publish).toHaveBeenCalledWith({
      id: releaseId,
      expectedVersion: 2,
      actorUserId: authUserId,
      idempotencyKey: "publish-cat-guide-0001",
    });
  });

  test("rejects edits to non-draft releases before mutation", async () => {
    const repository = createRepository({
      getById: mock(async () => ({ ...release, state: "in_review" as const })),
    });
    const service = createAdoptionGuideReleaseService(repository);

    const error = await captureError(() =>
      service.updateDraft({
        actor: staff,
        id: releaseId,
        input: { ...draftInput, expectedVersion: 2 },
      }),
    );

    expect(error).toMatchObject({ code: "conflict", status: 409 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  test("turns an expected-version mismatch into a conflict before mutation", async () => {
    const repository = createRepository({
      getById: mock(async () => ({ ...release, version: 3 })),
    });
    const service = createAdoptionGuideReleaseService(repository);

    const error = await captureError(() =>
      service.submit({ actor: staff, id: releaseId, expectedVersion: 2 }),
    );

    expect(error).toBeInstanceOf(AdoptionGuideReleaseError);
    expect(error).toMatchObject({ code: "conflict", status: 409 });
    expect(repository.getAssets).not.toHaveBeenCalled();
    expect(repository.transition).not.toHaveBeenCalled();
  });

  test("returns signed private preview URLs only after authenticated authorization", async () => {
    const repository = createRepository();
    const service = createAdoptionGuideReleaseService(repository);

    const unauthorized = await captureError(() =>
      service.preview({
        actor: { ...staff, authUserId: "" } as AdoptionGuideActor,
        id: releaseId,
      }),
    );
    expect(unauthorized).toMatchObject({ code: "unauthorized", status: 401 });
    expect(repository.getById).not.toHaveBeenCalled();
    expect(repository.previewAssetUrl).not.toHaveBeenCalled();

    const preview = await service.preview({ actor: staff, id: releaseId });
    expect(preview.adoptionPanel).toMatchObject({
      zhHkUrl: "https://private.example/adoption-guides/cat-zh.pdf",
      enUrl: "https://private.example/adoption-guides/cat-en.pdf",
    });
    expect(preview.knowledgeCard.zhHkUrl).toBe(preview.adoptionPanel.zhHkUrl);
    expect(preview.readiness).toEqual({ ready: true, issues: [] });
    expect(repository.previewAssetUrl).toHaveBeenCalledTimes(2);
  });
});
