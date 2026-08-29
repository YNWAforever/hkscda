// src/lib/governance/service.test.ts
import { describe, expect, test } from "bun:test";
import { createGovernanceService } from "./service";
import type { BoardMember, GovernanceAuditLog, GovernanceRepository } from "./types";

function fakeMember(overrides: Partial<BoardMember> = {}): BoardMember {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "陳大文",
    roleTitle: "主席",
    sortOrder: 0,
    effectiveDate: "2026-08-01",
    isActive: true,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeRepo(overrides: Partial<GovernanceRepository> = {}): {
  repo: GovernanceRepository;
  auditCalls: GovernanceAuditLog[];
  upsertCalls: Array<{ input: unknown; actorUserId: string }>;
} {
  const auditCalls: GovernanceAuditLog[] = [];
  const upsertCalls: Array<{ input: unknown; actorUserId: string }> = [];
  const repo: GovernanceRepository = {
    listPublicRoster: async () => ({ members: [], lastUpdated: null }),
    listAdmin: async () => [],
    upsert: async (input, actorUserId) => {
      upsertCalls.push({ input, actorUserId });
      return fakeMember();
    },
    deactivate: async () => {},
    insertAuditLog: async (input) => {
      auditCalls.push(input);
    },
    ...overrides,
  };
  return { repo, auditCalls, upsertCalls };
}

describe("createGovernanceService", () => {
  test("upsert without an id creates a member, passes actorUserId to the repository, and audits board_member.create", async () => {
    const { repo, auditCalls, upsertCalls } = createFakeRepo();
    const service = createGovernanceService({
      repo,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
    });

    const member = await service.upsert({
      actorUserId: "admin-1",
      input: { name: "陳大文", roleTitle: "主席", effectiveDate: "2026-08-01" },
    });

    expect(member.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(upsertCalls).toEqual([
      {
        input: { name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" },
        actorUserId: "admin-1",
      },
    ]);
    expect(auditCalls).toEqual([
      {
        actor_user_id: "admin-1",
        action: "board_member.create",
        entity: "board_member",
        entity_id: "11111111-1111-4111-8111-111111111111",
        detail: { name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" },
        timestamp: "2026-08-29T12:00:00.000Z",
      },
    ]);
  });

  test("upsert with an id updates a member and audits board_member.update", async () => {
    const { repo, auditCalls, upsertCalls } = createFakeRepo();
    const service = createGovernanceService({
      repo,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
    });

    await service.upsert({
      actorUserId: "admin-1",
      input: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "副主席",
        sortOrder: 1,
        effectiveDate: "2026-08-01",
      },
    });

    expect(upsertCalls[0].actorUserId).toBe("admin-1");
    expect(auditCalls[0].action).toBe("board_member.update");
  });

  test("deactivate removes a member from the active roster and audits board_member.deactivate", async () => {
    const deactivateCalls: string[] = [];
    const { repo, auditCalls } = createFakeRepo({
      deactivate: async (id) => {
        deactivateCalls.push(id);
      },
    });
    const service = createGovernanceService({
      repo,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
    });

    await service.deactivate({
      actorUserId: "admin-1",
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(deactivateCalls).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(auditCalls).toEqual([
      {
        actor_user_id: "admin-1",
        action: "board_member.deactivate",
        entity: "board_member",
        entity_id: "11111111-1111-4111-8111-111111111111",
        detail: {},
        timestamp: "2026-08-29T12:00:00.000Z",
      },
    ]);
  });

  test("upsert rejects invalid input before ever touching the repository", async () => {
    const { repo, auditCalls, upsertCalls } = createFakeRepo();
    const service = createGovernanceService({ repo });

    await expect(
      service.upsert({
        actorUserId: "admin-1",
        input: { name: "", roleTitle: "主席", effectiveDate: "2026-08-01" },
      }),
    ).rejects.toThrow();
    expect(auditCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  test("listPublicRoster and listAdmin delegate straight to the repository", async () => {
    const { repo } = createFakeRepo({
      listPublicRoster: async () => ({
        members: [{ name: "陳大文", roleTitle: "主席", sortOrder: 0 }],
        lastUpdated: "2026-08-29T00:00:00.000Z",
      }),
      listAdmin: async () => [fakeMember()],
    });
    const service = createGovernanceService({ repo });

    await expect(service.listPublicRoster()).resolves.toEqual({
      members: [{ name: "陳大文", roleTitle: "主席", sortOrder: 0 }],
      lastUpdated: "2026-08-29T00:00:00.000Z",
    });
    await expect(service.listAdmin()).resolves.toEqual([fakeMember()]);
  });
});
