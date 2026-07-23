import { describe, expect, test } from "bun:test";

import type { KnowledgePost } from "../../../lib/knowledge/types";
import { createAdminKnowledgeHandlers } from "./knowledge";

const admin = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "staff@example.com",
  role: "staff" as const,
  status: "active" as const,
};
const knowledgePost: KnowledgePost = {
  id: "post-1",
  title: "Care",
  topic: "adoption",
  shortIntro: "Care guidance",
  sourceName: null,
  destination: { kind: "external", url: "https://example.test" },
  isPublished: true,
  sortOrder: 1,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

function request(url = "https://example.test/api/admin/knowledge", init: RequestInit = {}) {
  return new Request(url, { method: "GET", ...init });
}

function createService() {
  const calls: Array<{ name: string; input?: unknown }> = [];
  return {
    calls,
    async listAdmin(input: unknown) {
      calls.push({ name: "list", input });
      return { posts: [], total: 0, page: 1, pageSize: 25 };
    },
    async upsert(input: unknown) {
      calls.push({ name: "upsert", input });
      return knowledgePost;
    },
    async remove(input: unknown) {
      calls.push({ name: "remove", input });
    },
  };
}

describe("admin knowledge handlers", () => {
  test("requires staff/admin access before service work", async () => {
    const service = createService();
    const handlers = createAdminKnowledgeHandlers({
      requireKnowledgeAdmin: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service,
    });
    const response = await handlers.list({ request: request() });
    expect(response.status).toBe(403);
    expect(service.calls).toEqual([]);
  });

  test("lists, upserts, and deletes knowledge posts", async () => {
    const service = createService();
    const handlers = createAdminKnowledgeHandlers({
      requireKnowledgeAdmin: async () => admin,
      service,
    });
    expect(
      (
        await handlers.list({
          request: request("https://example.test/api/admin/knowledge?q=cat&pageSize=99"),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handlers.upsert({
          request: request(undefined, {
            method: "POST",
            body: JSON.stringify({ title: "Care", externalUrl: "https://example.test" }),
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handlers.remove({
          request: request(undefined, {
            method: "DELETE",
            body: JSON.stringify({ id: "11111111-2222-4333-8444-555555555555" }),
          }),
        })
      ).status,
    ).toBe(200);
    expect(service.calls.map((call) => call.name)).toEqual(["list", "upsert", "remove"]);
    expect(service.calls[1]?.input).toMatchObject({ actorUserId: "admin-1" });
  });
});
