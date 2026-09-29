import { describe, expect, test } from "bun:test";

import { initialAdoptionInstructionContent } from "./content";
import {
  AdoptionInstructionConflictError,
  createAdoptionInstructionService,
  type AdoptionInstructionActor,
} from "./service";
import type {
  AdoptionInstructionAdminPage,
  AdoptionInstructionRepository,
} from "./repository.server";
import type { AdoptionInstructionRevision } from "./types";

const now = () => new Date("2026-08-02T12:00:00.000Z");
const staff: AdoptionInstructionActor = { authUserId: "staff-auth-user", role: "staff" };
const admin: AdoptionInstructionActor = { authUserId: "admin-auth-user", role: "admin" };
const publishedRevisionId = "11111111-1111-4111-8111-111111111111";
const draftRevisionId = "22222222-2222-4222-8222-222222222222";
const restoredDraftRevisionId = "33333333-3333-4333-8333-333333333333";

function revision(
  overrides: Partial<AdoptionInstructionRevision> = {},
): AdoptionInstructionRevision {
  return {
    id: publishedRevisionId,
    pageKey: "adoption-instructions",
    revisionNumber: 1,
    state: "published",
    content: structuredClone(initialAdoptionInstructionContent),
    sourceRevisionId: null,
    version: 1,
    createdBy: null,
    updatedBy: null,
    publishedBy: null,
    publishedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function adminPage(
  overrides: Partial<AdoptionInstructionAdminPage> = {},
): AdoptionInstructionAdminPage {
  return {
    page: {
      pageKey: "adoption-instructions",
      publishedRevisionId,
      draftRevisionId: null,
      version: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
    published: revision(),
    draft: null,
    history: [revision()],
    ...overrides,
  };
}

function createRepository(page = adminPage()) {
  const calls = {
    ensureDraft: [] as unknown[],
    updateDraft: [] as unknown[],
    publish: [] as unknown[],
    restore: [] as unknown[],
  };
  const repository: AdoptionInstructionRepository = {
    getAdminPage: async () => page,
    getPublished: async () => page.published,
    getRevision: async (id) => {
      const match = page.history.find((item) => item.id === id);
      return match ? revision(match) : null;
    },
    ensureDraft: async (input) => {
      calls.ensureDraft.push(input);
      const draft = revision({
        id: draftRevisionId,
        revisionNumber: 2,
        state: "draft",
        sourceRevisionId: page.published?.id ?? null,
        publishedAt: null,
      });
      page = adminPage({
        page: { ...page.page, draftRevisionId: draft.id, version: page.page.version + 1 },
        draft,
        history: [draft, ...page.history],
      });
      return draft;
    },
    updateDraft: async (input) => {
      calls.updateDraft.push(input);
      const draft = revision({
        id: draftRevisionId,
        revisionNumber: 2,
        state: "draft",
        content: input.content,
        sourceRevisionId: publishedRevisionId,
        publishedAt: null,
        version: input.expectedVersion + 1,
      });
      page = adminPage({ ...page, draft, history: [draft, ...page.history] });
      return draft;
    },
    publish: async (input) => {
      calls.publish.push(input);
      return { pageKey: "adoption-instructions", revisionId: draftRevisionId, revisionVersion: 3 };
    },
    restore: async (input) => {
      calls.restore.push(input);
      return revision({
        id: restoredDraftRevisionId,
        revisionNumber: 3,
        state: "draft",
        sourceRevisionId: input.sourceRevisionId,
        publishedAt: null,
      });
    },
    archiveDraft: async () => revision({ state: "archived" }),
    listHistory: async () => ({ items: page.history, nextCursor: null }),
  };
  return { repository, calls, getPage: () => page };
}

describe("createAdoptionInstructionService", () => {
  test("ensureDraft clones the published content only when no draft exists", async () => {
    const { repository, calls, getPage } = createRepository();
    const service = createAdoptionInstructionService({ repository, now });

    const draft = await service.ensureDraft({ actor: staff, expectedPageVersion: 1 });
    const existingDraft = await service.ensureDraft({ actor: staff, expectedPageVersion: 2 });

    expect(draft.content).toEqual(initialAdoptionInstructionContent);
    expect(existingDraft.id).toBe(draft.id);
    expect(calls.ensureDraft).toEqual([
      {
        actorUserId: staff.authUserId,
        expectedPageVersion: 1,
        now: "2026-08-02T12:00:00.000Z",
      },
    ]);
    expect(getPage().published?.content).toEqual(initialAdoptionInstructionContent);
  });

  test("updateDraft passes expectedVersion and returns the incremented version", async () => {
    const { repository, calls } = createRepository(
      adminPage({
        page: { ...adminPage().page, draftRevisionId },
        draft: revision({
          id: draftRevisionId,
          state: "draft",
          revisionNumber: 2,
          version: 4,
          publishedAt: null,
        }),
      }),
    );
    const service = createAdoptionInstructionService({ repository, now });
    const content = {
      ...initialAdoptionInstructionContent,
      hero: { ...initialAdoptionInstructionContent.hero, title: "更新後的領養需知" },
    };

    const updated = await service.updateDraft({ actor: staff, expectedVersion: 4, content });

    expect(updated.version).toBe(5);
    expect(calls.updateDraft).toEqual([
      {
        actorUserId: staff.authUserId,
        expectedVersion: 4,
        content,
        now: "2026-08-02T12:00:00.000Z",
      },
    ]);
  });

  test("updateDraft rejects a stale version before repository mutation", async () => {
    const { repository, calls } = createRepository(
      adminPage({
        page: { ...adminPage().page, draftRevisionId },
        draft: revision({
          id: draftRevisionId,
          state: "draft",
          revisionNumber: 2,
          version: 4,
          publishedAt: null,
        }),
      }),
    );
    const service = createAdoptionInstructionService({ repository, now });

    await expect(
      service.updateDraft({
        actor: staff,
        expectedVersion: 3,
        content: initialAdoptionInstructionContent,
      }),
    ).rejects.toBeInstanceOf(AdoptionInstructionConflictError);
    expect(calls.updateDraft).toEqual([]);
  });

  test("publish blocks staff before repository work and passes an admin idempotency key", async () => {
    const { repository, calls } = createRepository(
      adminPage({
        page: { ...adminPage().page, draftRevisionId },
        draft: revision({
          id: draftRevisionId,
          state: "draft",
          revisionNumber: 2,
          version: 4,
          publishedAt: null,
        }),
      }),
    );
    const service = createAdoptionInstructionService({ repository, now });
    const idempotencyKey = "publish-adoption-instructions-0001";

    await expect(
      service.publish({ actor: staff, expectedVersion: 4, idempotencyKey }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await service.publish({ actor: admin, expectedVersion: 4, idempotencyKey });

    expect(calls.publish).toEqual([
      {
        actorUserId: admin.authUserId,
        expectedVersion: 4,
        idempotencyKey,
        now: "2026-08-02T12:00:00.000Z",
      },
    ]);
  });

  test("restore passes the source revision id without changing its historical revision", async () => {
    const source = revision({ id: publishedRevisionId, version: 7, state: "archived" });
    const { repository, calls, getPage } = createRepository(adminPage({ history: [source] }));
    const service = createAdoptionInstructionService({ repository, now });

    const restored = await service.restore({ actor: admin, revisionId: source.id });

    expect(restored.sourceRevisionId).toBe(source.id);
    expect(calls.restore).toEqual([
      {
        actorUserId: admin.authUserId,
        sourceRevisionId: source.id,
        expectedPageVersion: 1,
        now: "2026-08-02T12:00:00.000Z",
      },
    ]);
    expect(getPage().history[0]).toEqual(source);
  });
});

test("publish retry reaches the atomic idempotency lookup even after the draft is gone", async () => {
  const { repository, calls } = createRepository();
  const service = createAdoptionInstructionService({ repository, now });
  await expect(
    service.publish({ actor: admin, expectedVersion: 4, idempotencyKey: "retry-publish-00000001" }),
  ).resolves.toMatchObject({ revisionId: draftRevisionId });
  expect(calls.publish).toHaveLength(1);
});

test("only admins can archive a draft without publishing and the version is passed atomically", async () => {
  const { repository } = createRepository();
  let input: unknown;
  const repo = {
    ...repository,
    archiveDraft: async (value: unknown) => {
      input = value;
      return revision({ state: "archived" });
    },
  };
  const service = createAdoptionInstructionService({ repository: repo, now });
  await expect(service.archiveDraft({ actor: staff, expectedVersion: 4 })).rejects.toMatchObject({
    code: "forbidden",
  });
  await service.archiveDraft({ actor: admin, expectedVersion: 4 });
  expect(input).toEqual({
    actorUserId: admin.authUserId,
    expectedVersion: 4,
    now: "2026-08-02T12:00:00.000Z",
  });
});

test("restore resolves a revision outside the current history page by direct ID", async () => {
  const source = revision({ id: "44444444-4444-4444-8444-444444444444", state: "archived" });
  const { repository, calls } = createRepository(adminPage({ history: [] }));
  repository.getRevision = async (id) => (id === source.id ? source : null);
  const service = createAdoptionInstructionService({ repository, now });
  const restored = await service.restore({ actor: admin, revisionId: source.id });
  expect(restored.sourceRevisionId).toBe(source.id);
  expect(calls.restore).toHaveLength(1);
  await expect(service.restore({ actor: staff, revisionId: source.id })).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    service.restore({ actor: admin, revisionId: draftRevisionId }),
  ).rejects.toMatchObject({ status: 404 });
});

test("history and revision detail authorize before repository reads and bound page size", async () => {
  const { repository } = createRepository();
  const seen: unknown[] = [];
  repository.listHistory = async (input) => {
    seen.push(input);
    return { items: [], nextCursor: null };
  };
  const service = createAdoptionInstructionService({ repository, now });
  await expect(service.listHistory({ actor: null as never })).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    service.getRevision({ actor: null as never, revisionId: publishedRevisionId }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(service.listHistory({ actor: staff, limit: 101 })).rejects.toThrow();
  await service.listHistory({ actor: staff, cursor: "3:" + publishedRevisionId });
  expect(seen).toEqual([{ cursor: "3:" + publishedRevisionId, limit: 25 }]);
  expect((await service.getRevision({ actor: staff, revisionId: publishedRevisionId })).id).toBe(
    publishedRevisionId,
  );
});
