import { describe, expect, test } from "bun:test";

import { createSupabaseAdoptionCoordinatorRepository } from "./repository.server";
import { createAdoptionCoordinatorService } from "./service";

const actor = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const statusRow = {
  id,
  category: "followup",
  key: "scheduled",
  label_zh: "安排中",
  label_en: "Scheduled",
  sort_order: 0,
  color: "blue",
  is_active: true,
  is_system: false,
  is_closing: false,
  is_final: false,
};

describe("adoption coordinator atomic audit mutations", () => {
  test("status, task, and match writes each use one RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      from(table: string): never {
        throw new Error(`Unexpected separate write to ${table}`);
      },
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return { data: args.p_entity === "coordinator_status" ? statusRow : { id }, error: null };
      },
    };
    const repo = createSupabaseAdoptionCoordinatorRepository(client as never);
    await repo.createStatus(
      {
        category: "followup",
        key: "scheduled",
        labelZh: "安排中",
        labelEn: "Scheduled",
        sortOrder: 0,
        color: "blue",
        isActive: true,
        isClosing: false,
        isFinal: false,
      },
      actor,
    );
    await repo.updateStatus(id, { labelEn: "Upcoming" }, actor);
    await repo.deleteStatus(id, actor);
    await repo.createTask({
      adoptionCaseId: id,
      title: "Call",
      statusId: id,
      taskType: "followup",
      priority: "normal",
      createdBy: actor,
    } as never);
    await repo.updateTask({ taskId: id, title: "Visit", updatedBy: actor } as never);
    await repo.createMatch({
      adoptionCaseId: id,
      animalId: id,
      statusId: id,
      isApproved: false,
      createdBy: actor,
    } as never);
    expect(calls.map((call) => [call.name, call.args.p_entity, call.args.p_operation])).toEqual([
      ["mutate_adoption_coordinator_with_audit", "coordinator_status", "create"],
      ["mutate_adoption_coordinator_with_audit", "coordinator_status", "update"],
      ["mutate_adoption_coordinator_with_audit", "coordinator_status", "delete"],
      ["mutate_adoption_coordinator_with_audit", "adoption_followup", "create"],
      ["mutate_adoption_coordinator_with_audit", "adoption_followup", "update"],
      ["mutate_adoption_coordinator_with_audit", "animal_match", "create"],
    ]);
    expect(calls.every((call) => call.args.p_actor_user_id === actor)).toBe(true);
  });

  test("service does not add a second audit for an atomic status create", async () => {
    const repo = {
      usesAtomicAudit: true,
      createStatus: async () => ({
        id,
        category: "followup",
        key: "scheduled",
        labelZh: "安排中",
        labelEn: "Scheduled",
        sortOrder: 0,
        color: "blue",
        isActive: true,
        isSystem: false,
        isClosing: false,
        isFinal: false,
      }),
      insertAuditLog: async (): Promise<void> => {
        throw new Error("Separate audit write");
      },
    };
    const service = createAdoptionCoordinatorService({ repo: repo as never });
    const result = await service.createStatus({
      actorUserId: actor,
      input: { category: "followup", key: "scheduled", labelZh: "安排中", labelEn: "Scheduled" },
    });
    expect(result.id).toBe(id);
  });
});
