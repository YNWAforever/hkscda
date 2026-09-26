import { describe, expect, mock, test } from "bun:test";

import { initialAdoptionInstructionContent } from "./content";
import { createAdoptionInstructionHandlers } from "./http.server";
import {
  AdoptionInstructionConflictError,
  AdoptionInstructionError,
  createAdoptionInstructionService,
  type AdoptionInstructionActor,
} from "./service";
import type { AdoptionInstructionAdminPage } from "./repository.server";

const staff: AdoptionInstructionActor = { authUserId: "staff-auth-user", role: "staff" };
const admin: AdoptionInstructionActor = { authUserId: "admin-auth-user", role: "admin" };
const revisionId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";

function page(): AdoptionInstructionAdminPage {
  const published = {
    id: revisionId,
    pageKey: "adoption-instructions" as const,
    revisionNumber: 1,
    state: "published" as const,
    content: structuredClone(initialAdoptionInstructionContent),
    sourceRevisionId: null,
    version: 1,
    createdBy: null,
    updatedBy: null,
    publishedBy: null,
    publishedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
  const draft = {
    ...published,
    id: draftId,
    revisionNumber: 2,
    state: "draft" as const,
    content: {
      ...structuredClone(initialAdoptionInstructionContent),
      hero: { ...initialAdoptionInstructionContent.hero, title: "草稿領養需知" },
    },
    sourceRevisionId: revisionId,
    version: 2,
    publishedAt: null,
  };
  return {
    page: {
      pageKey: "adoption-instructions",
      publishedRevisionId: revisionId,
      draftRevisionId: draftId,
      version: 2,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
    published,
    draft,
    history: [draft, published],
  };
}

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`https://test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createService() {
  const adminPage = page();
  return {
    getAdminPage: mock(async () => adminPage),
    ensureDraft: mock(async () => adminPage.draft!),
    updateDraft: mock(async () => ({ ...adminPage.draft!, version: 3 })),
    preview: mock(async () => adminPage.draft!),
    publish: mock(async () => ({
      pageKey: "adoption-instructions",
      revisionId: draftId,
      revisionVersion: 3,
    })),
    restore: mock(async () => ({
      ...adminPage.draft!,
      id: "33333333-3333-4333-8333-333333333333",
    })),
  };
}

function createHandlers(
  service = createService(),
  requireActor: (request: Request) => Promise<AdoptionInstructionActor> = async () => staff,
) {
  return {
    handlers: createAdoptionInstructionHandlers({
      requireActor,
      service: service as unknown as ReturnType<typeof createAdoptionInstructionService>,
    }),
    service,
  };
}

describe("createAdoptionInstructionHandlers", () => {
  test("returns 401 for unauthenticated requests", async () => {
    const { handlers, service } = createHandlers(createService(), async () => {
      throw new Response("provider authorization detail", { status: 401 });
    });

    const response = await handlers.get(
      new Request("https://test/api/admin/adoption-instructions"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "Authentication is required." },
    });
    expect(service.getAdminPage).not.toHaveBeenCalled();
  });

  test("allows staff to get, create a draft, update it, and preview it", async () => {
    const { handlers, service } = createHandlers();
    const content = structuredClone(initialAdoptionInstructionContent);

    const responses = await Promise.all([
      handlers.get(new Request("https://test/api/admin/adoption-instructions")),
      handlers.ensureDraft(
        jsonRequest("/api/admin/adoption-instructions/draft", { expectedPageVersion: 2 }),
      ),
      handlers.updateDraft(
        jsonRequest(
          "/api/admin/adoption-instructions/draft",
          { expectedVersion: 2, content },
          "PUT",
        ),
      ),
      handlers.preview(new Request("https://test/api/admin/adoption-instructions/preview")),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(service.getAdminPage).toHaveBeenCalledWith({ actor: staff });
    expect(service.ensureDraft).toHaveBeenCalledWith({ actor: staff, expectedPageVersion: 2 });
    expect(service.updateDraft).toHaveBeenCalledWith({ actor: staff, expectedVersion: 2, content });
    expect(service.preview).toHaveBeenCalledWith({ actor: staff });
  });

  test("blocks staff from publishing or restoring before service work", async () => {
    const { handlers, service } = createHandlers();
    const publish = await handlers.publish(
      jsonRequest("/api/admin/adoption-instructions/publish", {
        expectedVersion: 2,
        idempotencyKey: "publish-adoption-instructions-0001",
      }),
    );
    const restore = await handlers.restore(
      jsonRequest("/api/admin/adoption-instructions/restore", { revisionId }),
    );

    for (const response of [publish, restore]) {
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: { code: "forbidden", message: "You do not have permission to perform this action." },
      });
    }
    expect(service.publish).not.toHaveBeenCalled();
    expect(service.restore).not.toHaveBeenCalled();
  });

  test("returns field paths when content is malformed", async () => {
    const { handlers, service } = createHandlers();
    const response = await handlers.updateDraft(
      jsonRequest(
        "/api/admin/adoption-instructions/draft",
        {
          expectedVersion: 2,
          content: {
            ...initialAdoptionInstructionContent,
            hero: { ...initialAdoptionInstructionContent.hero, title: "<script>" },
          },
        },
        "PUT",
      ),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: { code: "validation", fields: { "content.hero.title": [expect.any(String)] } },
    });
    expect(service.updateDraft).not.toHaveBeenCalled();
  });

  test("maps stale draft updates to 409", async () => {
    const service = createService();
    service.updateDraft.mockImplementation(async () => {
      throw new AdoptionInstructionConflictError();
    });
    const { handlers } = createHandlers(service);
    const response = await handlers.updateDraft(
      jsonRequest(
        "/api/admin/adoption-instructions/draft",
        { expectedVersion: 1, content: initialAdoptionInstructionContent },
        "PUT",
      ),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "This adoption instruction draft has changed." },
    });
  });

  test("returns draft preview content without changing the public content", async () => {
    const { handlers } = createHandlers();
    const publicContent = structuredClone(initialAdoptionInstructionContent);

    const response = await handlers.preview(
      new Request("https://test/api/admin/adoption-instructions/preview"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).content.hero.title).toBe("草稿領養需知");
    expect(publicContent).toEqual(initialAdoptionInstructionContent);
  });

  test("allows an administrator to publish and restore", async () => {
    const { handlers, service } = createHandlers(createService(), async () => admin);
    const publish = await handlers.publish(
      jsonRequest("/api/admin/adoption-instructions/publish", {
        expectedVersion: 2,
        idempotencyKey: "publish-adoption-instructions-0001",
      }),
    );
    const restore = await handlers.restore(
      jsonRequest("/api/admin/adoption-instructions/restore", { revisionId }),
    );

    expect(publish.status).toBe(200);
    expect(restore.status).toBe(200);
    expect(publish.headers.get("cache-control")).toBe("no-store");
    expect(restore.headers.get("cache-control")).toBe("no-store");
    expect(service.publish).toHaveBeenCalledWith({
      actor: admin,
      expectedVersion: 2,
      idempotencyKey: "publish-adoption-instructions-0001",
    });
    expect(service.restore).toHaveBeenCalledWith({ actor: admin, revisionId });
  });
});
