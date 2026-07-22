import { describe, expect, test } from "bun:test";

import { createSupabaseKnowledgeRepository } from "./repository.server";

const row = {
  id: "post-1",
  title: "Care guide",
  topic: "adoption",
  short_intro: "A short public intro.",
  external_url: "https://example.test/care",
  document_asset_id: null,
  source_name: "HKSCDA",
  is_published: true,
  sort_order: 1,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
  document_assets: null,
};

function createBuilder(calls: unknown[], data: unknown[] = [row], count = data.length) {
  const builder: Record<string, unknown> = {
    select(columns: string, options?: unknown) { calls.push({ name: "select", columns, options }); return builder; },
    eq(column: string, value: unknown) { calls.push({ name: "eq", column, value }); return builder; },
    or(filter: string) { calls.push({ name: "or", filter }); return builder; },
    order(column: string, options?: unknown) { calls.push({ name: "order", column, options }); return builder; },
    range(from: number, to: number) { calls.push({ name: "range", from, to }); return Promise.resolve({ data, error: null, count }); },
    upsert(payload: unknown) { calls.push({ name: "upsert", payload }); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
    delete() { calls.push({ name: "delete" }); return { eq: async (column: string, value: unknown) => ({ column, value, error: null }) }; },
    insert(payload: unknown) { calls.push({ name: "insert", payload }); return Promise.resolve({ error: null }); },
  };
  return builder;
}

function createClient(data?: unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    from(table: string) { calls.push({ name: "from", table }); return createBuilder(calls, data); },
  };
}

describe("Supabase knowledge repository", () => {
  test("lists published posts with SQL filter, stable sort, and mapper defense", async () => {
    const client = createClient([row, { ...row, id: "draft", is_published: false }, { ...row, id: "unsafe", external_url: "http://bad.test" }]);
    const repo = createSupabaseKnowledgeRepository(client as never);

    await expect(repo.listPublished()).resolves.toEqual([{ id: "post-1", title: "Care guide", topic: "adoption", shortIntro: "A short public intro.", sourceName: "HKSCDA", destination: { kind: "external", url: "https://example.test/care" }, isPublished: true, sortOrder: 1, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" }]);
    expect(client.calls).toContainEqual({ name: "eq", column: "is_published", value: true });
    expect(client.calls).toContainEqual({ name: "order", column: "sort_order", options: { ascending: true } });
    expect(client.calls).toContainEqual({ name: "order", column: "created_at", options: { ascending: false } });
  });

  test("caps admin pages and escapes search filters", async () => {
    const client = createClient();
    const repo = createSupabaseKnowledgeRepository(client as never);
    await repo.listAdmin({ q: 'cat_%"', page: 1, pageSize: 50, status: "all" });
    expect(client.calls).toContainEqual({ name: "range", from: 0, to: 49 });
    const orCall = client.calls.find((call: any) => call.name === "or") as { filter: string } | undefined;
    expect(orCall?.filter).toContain('cat\\_\\%\\\"');
  });

  test("upserts document destinations and writes audit rows", async () => {
    const client = createClient();
    const repo = createSupabaseKnowledgeRepository(client as never);
    await repo.upsert({ title: "Doc", topic: "adoption", shortIntro: "Intro", sourceName: null, destination: { kind: "document", assetId: "11111111-2222-4333-8444-555555555555" }, isPublished: false, sortOrder: 3 });
    await repo.insertAuditLog({ actor_user_id: "admin-1", action: "knowledge_post.create", entity: "knowledge_post", entity_id: "post-1", detail: {}, timestamp: "2026-07-22T00:00:00.000Z" });
    expect(client.calls).toContainEqual({ name: "upsert", payload: { title: "Doc", topic: "adoption", short_intro: "Intro", source_name: null, external_url: null, document_asset_id: "11111111-2222-4333-8444-555555555555", is_published: false, sort_order: 3 } });
    expect(client.calls).toContainEqual({ name: "insert", payload: { actor_user_id: "admin-1", action: "knowledge_post.create", entity: "knowledge_post", entity_id: "post-1", detail: {}, timestamp: "2026-07-22T00:00:00.000Z" } });
  });
});
