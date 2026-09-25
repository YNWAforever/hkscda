// src/lib/governance/repository.server.test.ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseGovernanceRepository } from "./repository.server";

type FakeResult = { data?: unknown; error?: { message: string } | null };

function createBuilder(calls: unknown[], result: FakeResult) {
  const builder: Record<string, unknown> = {
    select(columns: string, options?: unknown) {
      calls.push({ name: "select", columns, options });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ name: "eq", column, value });
      return builder;
    },
    order(column: string, options?: unknown) {
      calls.push({ name: "order", column, options });
      return builder;
    },
    insert(payload: unknown) {
      calls.push({ name: "insert", payload });
      return builder;
    },
    update(payload: unknown) {
      calls.push({ name: "update", payload });
      return builder;
    },
    single() {
      calls.push({ name: "single" });
      return Promise.resolve(result);
    },
    then(resolve: (value: FakeResult) => void) {
      resolve(result);
    },
  };
  return builder;
}

function createClient(results: Record<string, FakeResult>) {
  const calls: unknown[] = [];
  const client = {
    calls,
    from(table: string) {
      calls.push({ name: "from", table });
      return createBuilder(calls, results[table] ?? { data: [], error: null });
    },
    rpc(name: string, args: unknown) {
      calls.push({ name: "rpc", functionName: name, args });
      return Promise.resolve(results.rpc ?? { data: row(), error: null });
    },
  };
  return client as unknown as SupabaseClient & { calls: unknown[] };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "陳大文",
  role_title: "主席",
  sort_order: 0,
  effective_date: "2026-08-01",
  is_active: true,
  created_at: "2026-08-29T00:00:00.000Z",
  updated_at: "2026-08-29T00:00:00.000Z",
  ...overrides,
});

describe("listPublicRoster", () => {
  test("projects only name, roleTitle, and sortOrder, and computes the latest updatedAt", async () => {
    const client = createClient({
      board_member: {
        data: [
          row({ id: "a", name: "甲", sort_order: 0, updated_at: "2026-08-10T00:00:00.000Z" }),
          row({ id: "b", name: "乙", sort_order: 1, updated_at: "2026-08-29T00:00:00.000Z" }),
        ],
        error: null,
      },
    });
    const repo = createSupabaseGovernanceRepository(client);

    const roster = await repo.listPublicRoster();

    expect(roster.members).toEqual([
      { name: "甲", roleTitle: "主席", sortOrder: 0 },
      { name: "乙", roleTitle: "主席", sortOrder: 1 },
    ]);
    expect(roster.lastUpdated).toBe("2026-08-29T00:00:00.000Z");
  });

  test("returns an empty roster with a null lastUpdated when there are no active members", async () => {
    const client = createClient({ board_member: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await expect(repo.listPublicRoster()).resolves.toEqual({ members: [], lastUpdated: null });
  });

  test("filters to is_active = true only", async () => {
    const client = createClient({ board_member: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.listPublicRoster();

    expect(client.calls).toContainEqual({ name: "eq", column: "is_active", value: true });
  });
});

describe("listAdmin", () => {
  test("returns full rows including inactive members, ordered by sortOrder", async () => {
    const client = createClient({
      board_member: { data: [row({ id: "a" }), row({ id: "b", is_active: false })], error: null },
    });
    const repo = createSupabaseGovernanceRepository(client);

    const members = await repo.listAdmin();

    expect(members).toHaveLength(2);
    expect(members[1].isActive).toBe(false);
  });
});

describe("atomic governance mutations", () => {
  test("creates a member through the audited RPC", async () => {
    const client = createClient({ rpc: { data: row(), error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    const member = await repo.upsert(
      { name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" },
      "auth-1",
    );

    expect(member.name).toBe("陳大文");
    expect(client.calls).toContainEqual({
      name: "rpc",
      functionName: "mutate_admin_content_with_audit",
      args: {
        p_actor_user_id: "auth-1",
        p_entity: "board_member",
        p_operation: "upsert",
        p_id: null,
        p_payload: {
          name: "陳大文",
          role_title: "主席",
          sort_order: 0,
          effective_date: "2026-08-01",
          updated_by: "auth-1",
          created_by: "auth-1",
        },
      },
    });
  });

  test("updates an existing member through the audited RPC", async () => {
    const client = createClient({ rpc: { data: row(), error: null } });
    const repo = createSupabaseGovernanceRepository(client);
    const id = "11111111-1111-4111-8111-111111111111";

    await repo.upsert(
      { id, name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" },
      "auth-2",
    );

    expect(client.calls).toContainEqual({
      name: "rpc",
      functionName: "mutate_admin_content_with_audit",
      args: {
        p_actor_user_id: "auth-2",
        p_entity: "board_member",
        p_operation: "upsert",
        p_id: id,
        p_payload: {
          id,
          name: "陳大文",
          role_title: "主席",
          sort_order: 0,
          effective_date: "2026-08-01",
          updated_by: "auth-2",
        },
      },
    });
  });

  test("deactivates a member through the audited RPC", async () => {
    const client = createClient({ rpc: { data: null, error: null } });
    const repo = createSupabaseGovernanceRepository(client);
    const id = "11111111-1111-4111-8111-111111111111";

    await repo.deactivate(id, "auth-1");

    expect(client.calls).toContainEqual({
      name: "rpc",
      functionName: "mutate_admin_content_with_audit",
      args: {
        p_actor_user_id: "auth-1",
        p_entity: "board_member",
        p_operation: "deactivate",
        p_id: id,
        p_payload: {},
      },
    });
  });
});

describe("insertAuditLog", () => {
  test("writes to the shared audit_log table", async () => {
    const client = createClient({ audit_log: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.insertAuditLog({
      actor_user_id: "admin-1",
      action: "board_member.create",
      entity: "board_member",
      entity_id: "11111111-1111-4111-8111-111111111111",
      detail: {},
      timestamp: "2026-08-29T00:00:00.000Z",
    });

    expect(client.calls).toContainEqual({ name: "from", table: "audit_log" });
  });
});
