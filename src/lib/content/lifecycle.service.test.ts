import { describe, expect, mock, test } from "bun:test";
import { createContentService, type ContentRepository } from "./service";
import type { ContentDetail } from "./types";
import { createContentLifecycleService } from "./lifecycle.service";
import type { ContentLifecycleRepository } from "./lifecycle.repository.server";
const actorUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";
const contentId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const revisionId = "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b";
const result = { contentId, version: 8, revisionId };
function fixture() {
  const mutate = mock(async () => result);
  const publish = mock(async () => result);
  const repository = {
    create: mock(async () => result),
    mutate,
    publish,
    restore: mock(async () => result),
    getRevision: mock(async () => ({ id: contentId, version: 1, snapshot: {} })),
    listRevisions: mock(async () => []),
  } as ContentLifecycleRepository;
  return { service: createContentLifecycleService(repository), mutate, publish };
}
describe("validated content lifecycle commands", () => {
  test("rejects missing expected version before touching the repository", async () => {
    const { service, mutate } = fixture();
    await expect(
      service.save({ actorUserId, contentId, input: { title: "草稿" } }),
    ).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
  });
  test("validates operation fields and carries the reviewed version", async () => {
    const { service, mutate } = fixture();
    await service.save({ actorUserId, contentId, input: { expectedVersion: 7, title: "草稿" } });
    expect(mutate).toHaveBeenCalledWith({
      actorUserId,
      contentId,
      expectedVersion: 7,
      operation: "save_content",
      values: { title: "草稿" },
    });
  });
  test("cannot publish through a save status field", async () => {
    const { service, mutate } = fixture();
    await expect(
      service.save({ actorUserId, contentId, input: { expectedVersion: 7, status: "published" } }),
    ).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
  });
  test("publishes exactly the selected revision", async () => {
    const { service, publish } = fixture();
    await service.publish({
      actorUserId,
      contentId,
      input: { expectedVersion: 7, revisionId, idempotencyKey: "publication-request-0001" },
    });
    expect(publish).toHaveBeenCalledWith({
      actorUserId,
      contentId,
      expectedVersion: 7,
      revisionId,
      idempotencyKey: "publication-request-0001",
    });
  });
});

test("production service dispatches authoring to the atomic lifecycle", async () => {
  const { service: lifecycle, mutate } = fixture();
  const detail = { id: contentId } as ContentDetail;
  const repo = {
    getAdminContent: async () => detail,
    updateContent: async () => {
      throw new Error("Legacy write used");
    },
  } as unknown as ContentRepository;
  const service = createContentService({ repo, lifecycle, publicBaseUrl: "https://example.test" });
  await service.updateContent({
    actorUserId,
    contentId,
    input: { expectedVersion: 7, title: "Draft" },
  });
  expect(mutate).toHaveBeenCalledTimes(1);
});
