import { describe, expect, test } from "bun:test";

import { createAdoptionInformationService, type AdoptionInformationRepository } from "./service";

function setup() {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const fee = {
    id: "11111111-1111-4111-8111-111111111111",
    animalType: "dog" as const,
    itemName: "Mongrel 唐狗",
    priceHkd: "0",
    sortOrder: 1,
    isPublished: true,
  };
  const estate = {
    id: "22222222-2222-4222-8222-222222222222",
    estateName: "Harbour View",
    district: "Sai Kung",
    notes: null,
    sortOrder: 0,
    isPublished: false,
  };
  const rule = {
    id: "33333333-3333-4333-8333-333333333333",
    content: { "zh-HK": "領養規則", en: "Adoption rule" },
    sortOrder: 0,
    isPublished: true,
  };
  const careTopic = {
    id: "44444444-4444-4444-8444-444444444444",
    animalType: "dog" as const,
    label: { "zh-HK": "餵食", en: "Feeding" },
    content: { "zh-HK": "餵食指引", en: "Feeding guidance" },
    sortOrder: 0,
    isPublished: true,
  };
  const repo: AdoptionInformationRepository = {
    async listPublic() {
      calls.push({ name: "listPublic" });
      return { fees: [fee], estates: [], rules: [rule], careTopics: [careTopic] };
    },
    async listAdmin(input) {
      calls.push({ name: "listAdmin", payload: input });
      return {
        resource: input.resource,
        items: [],
        total: 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    },
    async upsertFee(input) {
      calls.push({ name: "upsertFee", payload: input });
      return { ...fee, ...input, id: input.id ?? fee.id };
    },
    async upsertEstate(input) {
      calls.push({ name: "upsertEstate", payload: input });
      return { ...estate, ...input, id: input.id ?? estate.id };
    },
    async deleteEstate(id) {
      calls.push({ name: "deleteEstate", payload: id });
    },
    async upsertRule(input, actorUserId) {
      calls.push({ name: "upsertRule", payload: { input, actorUserId } });
      return { ...rule, ...input, id: input.id ?? rule.id };
    },
    async upsertCareTopic(input, actorUserId) {
      calls.push({ name: "upsertCareTopic", payload: { input, actorUserId } });
      return { ...careTopic, ...input, id: input.id ?? careTopic.id };
    },
    async insertAuditLog(input) {
      calls.push({ name: "audit", payload: input });
    },
  };
  return { calls, service: createAdoptionInformationService({ repo }) };
}

describe("adoption information service", () => {
  test("normalizes bounded admin searches and preserves empty estates", async () => {
    const { calls, service } = setup();
    await expect(service.listPublic()).resolves.toMatchObject({ estates: [] });
    await service.listAdmin({ resource: "estates", q: "  Sai Kung ", pageSize: 999 });
    expect(calls.at(-1)).toEqual({
      name: "listAdmin",
      payload: { resource: "estates", q: "Sai Kung", animalType: undefined, page: 1, pageSize: 50 },
    });
  });

  test("audits fee publication and estate deletion", async () => {
    const { calls, service } = setup();
    await service.upsertFee({
      actorUserId: "actor-1",
      input: {
        animalType: "dog",
        itemName: " Mongrel 唐狗 ",
        priceHkd: "0",
        sortOrder: 1,
        isPublished: true,
      },
    });
    await service.deleteEstate({
      actorUserId: "actor-1",
      estateId: "22222222-2222-4222-8222-222222222222",
    });
    expect(
      calls
        .filter((call) => call.name === "audit")
        .map((call) => (call.payload as { action: string }).action),
    ).toEqual(["adoption_fee.create", "adoption_fee.publish", "dog_friendly_estate.delete"]);
  });

  test("upsertRule validates input and delegates to the repository without auditing", async () => {
    const { calls, service } = setup();
    const result = await service.upsertRule({
      actorUserId: "actor-1",
      input: {
        content: { "zh-HK": "領養規則", en: "Adoption rule" },
        sortOrder: 0,
        isPublished: true,
      },
    });
    expect(calls).toEqual([
      {
        name: "upsertRule",
        payload: {
          input: {
            content: { "zh-HK": "領養規則", en: "Adoption rule" },
            sortOrder: 0,
            isPublished: true,
          },
          actorUserId: "actor-1",
        },
      },
    ]);
    expect(result).toMatchObject({
      content: { "zh-HK": "領養規則", en: "Adoption rule" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(calls.some((call) => call.name === "audit")).toBe(false);
  });

  test("upsertRule throws on invalid input without calling the repository", async () => {
    const { calls, service } = setup();
    await expect(
      service.upsertRule({
        actorUserId: "actor-1",
        input: {
          content: { "zh-HK": "a".repeat(501), en: "Adoption rule" },
          sortOrder: 0,
          isPublished: true,
        },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("upsertCareTopic validates input and delegates to the repository without auditing", async () => {
    const { calls, service } = setup();
    const result = await service.upsertCareTopic({
      actorUserId: "actor-1",
      input: {
        animalType: "dog",
        label: { "zh-HK": "餵食", en: "Feeding" },
        content: { "zh-HK": "餵食指引", en: "Feeding guidance" },
        sortOrder: 0,
        isPublished: true,
      },
    });
    expect(calls).toEqual([
      {
        name: "upsertCareTopic",
        payload: {
          input: {
            animalType: "dog",
            label: { "zh-HK": "餵食", en: "Feeding" },
            content: { "zh-HK": "餵食指引", en: "Feeding guidance" },
            sortOrder: 0,
            isPublished: true,
          },
          actorUserId: "actor-1",
        },
      },
    ]);
    expect(result).toMatchObject({
      animalType: "dog",
      label: { "zh-HK": "餵食", en: "Feeding" },
      content: { "zh-HK": "餵食指引", en: "Feeding guidance" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(calls.some((call) => call.name === "audit")).toBe(false);
  });

  test("upsertCareTopic throws on invalid input without calling the repository", async () => {
    const { calls, service } = setup();
    await expect(
      service.upsertCareTopic({
        actorUserId: "actor-1",
        input: {
          animalType: "dog",
          label: { "zh-HK": "餵食", en: "Feeding" },
          content: { "zh-HK": "a".repeat(1001), en: "Feeding guidance" },
          sortOrder: 0,
          isPublished: true,
        },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
