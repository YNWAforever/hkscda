import { describe, expect, test } from "bun:test";

import { createKnowledgeService } from "./service";
import type { KnowledgePostInput, KnowledgeRepository } from "./types";

const input: KnowledgePostInput = {
  title: "Care guide",
  topic: "adoption",
  shortIntro: "A short public intro.",
  sourceName: "HKSCDA",
  destination: { kind: "external", url: "https://example.test/care" },
  isPublished: true,
  sortOrder: 1,
};

function createRepo(): KnowledgeRepository & { audit: unknown[]; removed: string[] } {
  const audit: unknown[] = [];
  const removed: string[] = [];
  return {
    audit,
    removed,
    async listPublished() {
      return [];
    },
    async listAdmin(query) {
      return { posts: [], total: 0, page: query.page, pageSize: query.pageSize };
    },
    async upsert(post) {
      return {
        id: post.id ?? "post-1",
        ...post,
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
      };
    },
    async remove(id) {
      removed.push(id);
    },
    async insertAuditLog(row) {
      audit.push(row);
    },
  };
}

describe("knowledge service", () => {
  test("validates admin upserts and writes audit entries", async () => {
    const repo = createRepo();
    const service = createKnowledgeService({
      repo,
      now: () => new Date("2026-07-22T01:02:03.000Z"),
    });

    await expect(service.upsert({ actorUserId: "admin-1", input })).resolves.toMatchObject({
      id: "post-1",
      title: "Care guide",
    });
    expect(repo.audit).toMatchObject([
      {
        actor_user_id: "admin-1",
        action: "knowledge_post.create",
        entity: "knowledge_post",
        entity_id: "post-1",
        timestamp: "2026-07-22T01:02:03.000Z",
      },
    ]);
  });

  test("audits deletions with parsed ids", async () => {
    const repo = createRepo();
    const service = createKnowledgeService({ repo });
    await service.remove({ actorUserId: "admin-1", id: "11111111-2222-4333-8444-555555555555" });
    expect(repo.removed).toEqual(["11111111-2222-4333-8444-555555555555"]);
    expect(repo.audit).toMatchObject([
      { action: "knowledge_post.delete", entity_id: "11111111-2222-4333-8444-555555555555" },
    ]);
  });
});
