import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

import { adoptionGuideMutationSchema } from "./schemas";
import {
  AdoptionGuideReleaseError,
  createAdoptionGuideReleaseService,
  type AdoptionGuideActor,
} from "./service";
import type { AdoptionGuideRelease } from "./types";
import { createAdoptionGuideReleaseHandlers } from "./http.server";

const releaseId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const authUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";
const adminUserId = "cc928a80-ff73-4a9a-935a-a05c02fa0758";
const staffActor: AdoptionGuideActor = { adminUserId, authUserId, role: "staff" };
const adminActor: AdoptionGuideActor = { adminUserId, authUserId, role: "admin" };

const release: AdoptionGuideRelease = {
  id: releaseId,
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b",
  enAssetId: "21e42e2a-5d0e-4778-97ba-4e2c3ac3b594",
  knowledgePostId: null,
  knowledgeTitle: "Caring for your cat after adoption",
  knowledgeTopic: "Post adoption care",
  knowledgeShortIntro: "A practical guide for the first weeks at home.",
  knowledgeSourceName: null,
  sortOrder: 0,
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

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`https://test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createService() {
  return {
    list: mock(async () => ({ items: [release], total: 1, page: 1, pageSize: 20 })),
    createDraft: mock(async () => release),
    get: mock(async () => release),
    updateDraft: mock(async ({ input }: { input: unknown }) => {
      adoptionGuideMutationSchema.parse(input);
      return release;
    }),
    submit: mock(async () => ({ ...release, state: "in_review" as const, version: 3 })),
    withdraw: mock(async () => ({ ...release, version: 3 })),
    returnToDraft: mock(async () => ({ ...release, version: 3 })),
    preview: mock(async () => ({
      release,
      readiness: { ready: true, issues: [] },
      adoptionPanel: {
        heading: release.knowledgeTitle,
        zhHkUrl: "https://private.test/zh.pdf",
        enUrl: "https://private.test/en.pdf",
      },
      knowledgeCard: {
        title: release.knowledgeTitle,
        topic: release.knowledgeTopic,
        shortIntro: release.knowledgeShortIntro,
        sourceName: null,
        zhHkUrl: "https://private.test/zh.pdf",
        enUrl: "https://private.test/en.pdf",
      },
    })),
    publish: mock(async () => ({
      releaseId,
      releaseVersion: 3,
      knowledgePostId: "9eb81053-d84c-4d1b-903c-cd8a184fa13f",
      zhHkAssetId: release.zhHkAssetId!,
      enAssetId: release.enAssetId!,
      slotKey: "cat:post_adoption",
    })),
  };
}

function createHandlers(
  service = createService(),
  requireActor: (request: Request) => Promise<AdoptionGuideActor> = async () => staffActor,
) {
  return {
    handlers: createAdoptionGuideReleaseHandlers({
      requireActor,
      service: service as unknown as ReturnType<typeof createAdoptionGuideReleaseService>,
    }),
    service,
  };
}

beforeEach(() => {
  mock.restore();
});

describe("createAdoptionGuideReleaseHandlers", () => {
  test("returns 401 before unauthenticated requests reach the service", async () => {
    const { handlers, service } = createHandlers(createService(), async () => {
      throw new Response("provider token detail", { status: 401 });
    });

    const response = await handlers.list(
      new Request("https://test/api/admin/adoption-guide-releases"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Authentication is required.",
      },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  test("returns 403 before staff publication reaches the service", async () => {
    const service = createService();
    const requireActor = mock(async () => staffActor);
    const { handlers } = createHandlers(service, requireActor);
    const response = await handlers.publish(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/publish`, {
        expectedVersion: 2,
        idempotencyKey: "publish-cat-guide-0001",
      }),
      { id: releaseId },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
    expect(service.publish).not.toHaveBeenCalled();
  });

  test("returns stable no-store validation errors", async () => {
    const { handlers } = createHandlers();
    const response = await handlers.update(
      jsonRequest(
        `/api/admin/adoption-guide-releases/${releaseId}`,
        { expectedVersion: 0 },
        "PATCH",
      ),
      { id: releaseId },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
        fields: {
          expectedVersion: [expect.any(String)],
          topic: [expect.any(String)],
        },
      },
    });
  });

  test("groups readiness validation issues by stable field path", async () => {
    const service = createService();
    service.submit.mockImplementation(async () => {
      throw new AdoptionGuideReleaseError("invalid", 422, "provider readiness detail", [
        {
          field: "enAssetId",
          code: "required",
          message: "English PDF is required before submission.",
        },
        {
          field: "enAssetId",
          code: "storage_missing",
          message: "English PDF could not be verified.",
        },
      ]);
    });
    const { handlers } = createHandlers(service);

    const response = await handlers.submit(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/submit`, {
        expectedVersion: 2,
      }),
      { id: releaseId },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
        fields: {
          enAssetId: [
            "English PDF is required before submission.",
            "English PDF could not be verified.",
          ],
        },
      },
    });
  });

  test("maps missing releases and conflicts without leaking provider detail", async () => {
    const service = createService();
    service.get.mockImplementation(async () => {
      throw new AdoptionGuideReleaseError(
        "not_found",
        404,
        "SQL: release row 73cc7721 provider detail",
      );
    });
    service.withdraw.mockImplementation(async () => {
      throw new AdoptionGuideReleaseError(
        "conflict",
        409,
        "SQLSTATE 40001: provider transaction detail",
      );
    });
    const { handlers } = createHandlers(service);

    const missing = await handlers.get(
      new Request(`https://test/api/admin/adoption-guide-releases/${releaseId}`),
      { id: releaseId },
    );
    const conflict = await handlers.withdraw(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/withdraw`, {
        expectedVersion: 2,
      }),
      { id: releaseId },
    );

    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.json()).toEqual({
      error: {
        code: "not_found",
        message: "Adoption guide release not found.",
      },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("cache-control")).toBe("no-store");
    expect(await conflict.json()).toEqual({
      error: {
        code: "conflict",
        message: "This adoption guide release changed or cannot make that transition.",
      },
    });
  });

  test("uses boundary-owned messages for unstructured domain failures", async () => {
    const service = createService();
    service.list.mockImplementation(async () => {
      throw new AdoptionGuideReleaseError(
        "forbidden",
        403,
        "policy adoption_guide_internal leaked detail",
      );
    });
    service.submit.mockImplementation(async () => {
      throw new AdoptionGuideReleaseError("invalid", 422, "storage provider object secret");
    });
    const { handlers } = createHandlers(service);

    const forbidden = await handlers.list(
      new Request("https://test/api/admin/adoption-guide-releases"),
    );
    const invalid = await handlers.submit(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/submit`, {
        expectedVersion: 2,
      }),
      { id: releaseId },
    );

    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("cache-control")).toBe("no-store");
    expect(await forbidden.json()).toEqual({
      error: {
        code: "forbidden",
        message: "You do not have permission to perform this action.",
      },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    expect(await invalid.json()).toEqual({
      error: {
        code: "invalid",
        message: "The adoption guide release is not ready for this action.",
      },
    });
  });

  test("redacts unexpected internal and provider errors", async () => {
    const service = createService();
    service.createDraft.mockImplementation(async () => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY=secret provider failure");
    });
    const { handlers } = createHandlers(service);

    const response = await handlers.create(
      jsonRequest("/api/admin/adoption-guide-releases", {
        topic: "post_adoption",
        species: "cat",
        zhHkAssetId: release.zhHkAssetId,
        enAssetId: release.enAssetId,
        knowledgeTitle: release.knowledgeTitle,
        knowledgeTopic: release.knowledgeTopic,
        knowledgeShortIntro: release.knowledgeShortIntro,
        knowledgeSourceName: null,
        sortOrder: 0,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: {
        code: "internal",
        message: "The adoption guide release request could not be completed.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("provider");
  });

  test("passes parsed list filters and returns no-store success responses", async () => {
    const { handlers, service } = createHandlers();

    const response = await handlers.list(
      new Request(
        "https://test/api/admin/adoption-guide-releases?page=2&pageSize=10&q=cat&species=cat&state=draft",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.list).toHaveBeenCalledWith({
      actor: staffActor,
      query: {
        page: 2,
        pageSize: 10,
        q: "cat",
        species: "cat",
        state: "draft",
      },
    });
    expect(await response.json()).toEqual({
      items: [release],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  test("routes create, get, update, and authenticated preview", async () => {
    const { handlers, service } = createHandlers();
    const draftInput = {
      topic: "post_adoption",
      species: "cat",
      zhHkAssetId: release.zhHkAssetId,
      enAssetId: release.enAssetId,
      knowledgeTitle: release.knowledgeTitle,
      knowledgeTopic: release.knowledgeTopic,
      knowledgeShortIntro: release.knowledgeShortIntro,
      knowledgeSourceName: null,
      sortOrder: 0,
    };

    const created = await handlers.create(
      jsonRequest("/api/admin/adoption-guide-releases", draftInput),
    );
    const fetched = await handlers.get(
      new Request(`https://test/api/admin/adoption-guide-releases/${releaseId}`),
      { id: releaseId },
    );
    const updated = await handlers.update(
      jsonRequest(
        `/api/admin/adoption-guide-releases/${releaseId}`,
        { ...draftInput, expectedVersion: 2 },
        "PATCH",
      ),
      { id: releaseId },
    );
    const previewed = await handlers.preview(
      new Request(`https://test/api/admin/adoption-guide-releases/${releaseId}/preview`),
      { id: releaseId },
    );

    expect(created.status).toBe(201);
    expect(fetched.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(previewed.status).toBe(200);
    for (const response of [created, fetched, updated, previewed]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(await previewed.json()).toMatchObject({
      release: { id: releaseId },
      adoptionPanel: { enUrl: "https://private.test/en.pdf" },
    });
    expect(service.createDraft).toHaveBeenCalledWith({
      actor: staffActor,
      input: draftInput,
    });
    expect(service.get).toHaveBeenCalledWith({ actor: staffActor, id: releaseId });
    expect(service.updateDraft).toHaveBeenCalledWith({
      actor: staffActor,
      id: releaseId,
      input: { ...draftInput, expectedVersion: 2 },
    });
    expect(service.preview).toHaveBeenCalledWith({
      actor: staffActor,
      id: releaseId,
    });
  });

  test("routes every state transition and blocks staff return before service work", async () => {
    const service = createService();
    const { handlers } = createHandlers(service);
    const transitionBody = { expectedVersion: 2 };

    await handlers.submit(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/submit`, transitionBody),
      { id: releaseId },
    );
    await handlers.withdraw(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/withdraw`, transitionBody),
      { id: releaseId },
    );
    const forbiddenReturn = await handlers.returnToDraft(
      jsonRequest(
        `/api/admin/adoption-guide-releases/${releaseId}/return-to-draft`,
        transitionBody,
      ),
      { id: releaseId },
    );

    expect(service.submit).toHaveBeenCalledWith({
      actor: staffActor,
      id: releaseId,
      expectedVersion: 2,
    });
    expect(service.withdraw).toHaveBeenCalledWith({
      actor: staffActor,
      id: releaseId,
      expectedVersion: 2,
    });
    expect(forbiddenReturn.status).toBe(403);
    expect(service.returnToDraft).not.toHaveBeenCalled();

    const adminHandlers = createHandlers(service, async () => adminActor).handlers;
    await adminHandlers.returnToDraft(
      jsonRequest(
        `/api/admin/adoption-guide-releases/${releaseId}/return-to-draft`,
        transitionBody,
      ),
      { id: releaseId },
    );
    await adminHandlers.publish(
      jsonRequest(`/api/admin/adoption-guide-releases/${releaseId}/publish`, {
        expectedVersion: 2,
        idempotencyKey: "publish-cat-guide-0001",
      }),
      { id: releaseId },
    );

    expect(service.returnToDraft).toHaveBeenCalledWith({
      actor: adminActor,
      id: releaseId,
      expectedVersion: 2,
    });
    expect(service.publish).toHaveBeenCalledWith({
      actor: adminActor,
      id: releaseId,
      expectedVersion: 2,
      idempotencyKey: "publish-cat-guide-0001",
    });
  });

  test("maps malformed JSON to a stable validation response without service work", async () => {
    const { handlers, service } = createHandlers();
    const response = await handlers.create(
      new Request("https://test/api/admin/adoption-guide-releases", {
        method: "POST",
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
        fields: { body: ["Request body must be valid JSON."] },
      },
    });
    expect(service.createDraft).not.toHaveBeenCalled();
  });

  test("maps root Zod issues to a stable request field", async () => {
    const service = createService();
    service.get.mockImplementation(async () => {
      throw new z.ZodError([{ code: "custom", path: [], message: "Invalid release identifier." }]);
    });
    const { handlers } = createHandlers(service);

    const response = await handlers.get(
      new Request(`https://test/api/admin/adoption-guide-releases/${releaseId}`),
      { id: releaseId },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        fields: { request: ["Invalid release identifier."] },
      },
    });
  });
});
