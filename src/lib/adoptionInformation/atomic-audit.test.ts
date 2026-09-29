import { describe, expect, test } from "bun:test";

import { createAdoptionInformationService } from "./service";
import { createSupabaseAdoptionInformationRepository } from "./repository.server";
import { createGovernanceService } from "../governance/service";
import { createSupabaseGovernanceRepository } from "../governance/repository.server";
import { createKnowledgeService } from "../knowledge/service";
import { createSupabaseKnowledgeRepository } from "../knowledge/repository.server";

const actor = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";

function rpcClient(result: unknown, error: unknown = null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string): never {
      throw new Error(`Unexpected separate write to ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: result, error };
    },
  };
  return { client, calls };
}

describe("admin content atomic audit RPCs", () => {
  test("adoption fee publication uses one mutation and audit RPC", async () => {
    const { client, calls } = rpcClient({
      id,
      animal_type: "dog",
      item_name: "Mongrel",
      price_hkd: "0",
      sort_order: 1,
      is_published: true,
      version: 1,
    });
    const service = createAdoptionInformationService({
      repo: createSupabaseAdoptionInformationRepository(client as never),
    });
    await service.upsertFee({
      actorUserId: actor,
      input: {
        animalType: "dog",
        itemName: "Mongrel",
        priceHkd: "0",
        sortOrder: 1,
        isPublished: true,
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "mutate_admin_content_with_audit",
      args: { p_actor_user_id: actor, p_entity: "adoption_fee", p_operation: "upsert", p_id: null },
    });
  });

  test("estate deletion uses one RPC and propagates a missing-row failure", async () => {
    const { client, calls } = rpcClient(null, { code: "P0002", message: "Estate not found" });
    const service = createAdoptionInformationService({
      repo: createSupabaseAdoptionInformationRepository(client as never),
    });
    await expect(service.deleteEstate({ actorUserId: actor, estateId: id })).rejects.toBeTruthy();
    expect(calls).toEqual([
      {
        name: "mutate_admin_content_with_audit",
        args: {
          p_actor_user_id: actor,
          p_entity: "dog_friendly_estate",
          p_operation: "delete",
          p_id: id,
          p_payload: {},
        },
      },
    ]);
  });

  test("governance upsert and deactivate each use one RPC", async () => {
    const { client, calls } = rpcClient({
      id,
      name: "Chair",
      role_title: "Chair",
      sort_order: 0,
      effective_date: "2026-08-01",
      is_active: true,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    });
    const service = createGovernanceService({
      repo: createSupabaseGovernanceRepository(client as never),
    });
    await service.upsert({
      actorUserId: actor,
      input: { name: "Chair", roleTitle: "Chair", effectiveDate: "2026-08-01" },
    });
    await service.deactivate({ actorUserId: actor, id });
    expect(calls.map((call) => [call.name, call.args.p_entity, call.args.p_operation])).toEqual([
      ["mutate_admin_content_with_audit", "board_member", "upsert"],
      ["mutate_admin_content_with_audit", "board_member", "deactivate"],
    ]);
  });

  test("knowledge upsert and deletion each use one RPC", async () => {
    const { client, calls } = rpcClient({
      id,
      title: "Care",
      topic: "adoption",
      short_intro: "Guide",
      external_url: "https://example.test/care",
      document_asset_id: null,
      zh_hk_document_asset_id: null,
      en_document_asset_id: null,
      source_name: null,
      is_published: true,
      sort_order: 0,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    });
    const service = createKnowledgeService({
      repo: createSupabaseKnowledgeRepository(client as never),
    });
    await service.upsert({
      actorUserId: actor,
      input: {
        title: "Care",
        topic: "adoption",
        shortIntro: "Guide",
        sourceName: null,
        destination: { kind: "external", url: "https://example.test/care" },
        isPublished: true,
        sortOrder: 0,
      },
    });
    await service.remove({ actorUserId: actor, id });
    expect(calls.map((call) => [call.name, call.args.p_entity, call.args.p_operation])).toEqual([
      ["mutate_admin_content_with_audit", "knowledge_post", "upsert"],
      ["mutate_admin_content_with_audit", "knowledge_post", "delete"],
    ]);
  });
});
