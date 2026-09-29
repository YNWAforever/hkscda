import { describe, expect, test } from "bun:test";

import { createAdoptionInformationService, type AdoptionInformationRepository } from "./service";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";

function setup() {
  const calls: Array<{ command: string; input: unknown }> = [];
  const rows = new Map<
    string,
    {
      id: string;
      estateName: string;
      district: string;
      notes: string | null;
      sortOrder: number;
      isPublished: boolean;
      version: number;
    }
  >();
  const repo = {
    usesAtomicAudit: true,
    async createEstate(
      input: {
        id: string;
        estateName: string;
        district: string;
        notes: string | null;
        sortOrder: number;
      },
      actor: string,
    ) {
      calls.push({ command: "create", input: { ...input, actor } });
      const prior = rows.get(input.id);
      if (prior) return prior;
      const row = { ...input, isPublished: false, version: 1 };
      rows.set(input.id, row);
      return row;
    },
    async updateEstate(
      input: {
        id: string;
        expectedVersion: number;
        fields: { estateName: string; district: string; notes: string | null; sortOrder: number };
      },
      actor: string,
    ) {
      calls.push({ command: "update", input: { ...input, actor } });
      const prior = rows.get(input.id)!;
      if (prior.version !== input.expectedVersion) throw new Error("stale");
      const row = { ...prior, ...input.fields, version: prior.version + 1 };
      rows.set(input.id, row);
      return row;
    },
    async setEstatePublication(
      input: { id: string; expectedVersion: number; isPublished: boolean },
      actor: string,
    ) {
      calls.push({ command: "publication", input: { ...input, actor } });
      const prior = rows.get(input.id)!;
      if (prior.version !== input.expectedVersion) throw new Error("stale");
      const row = { ...prior, isPublished: input.isPublished, version: prior.version + 1 };
      rows.set(input.id, row);
      return row;
    },
  } as unknown as AdoptionInformationRepository;
  return { service: createAdoptionInformationService({ repo }), calls, rows };
}

describe("versioned estate commands", () => {
  test("separate create identities persist two unpublished estates and retry is idempotent", async () => {
    const { service, rows, calls } = setup();
    const fields = { estateName: "甲屋苑", district: "九龍", notes: null, sortOrder: 0 };
    const first = await service.createEstate({ actorUserId, input: { id, ...fields } });
    const retry = await service.createEstate({ actorUserId, input: { id, ...fields } });
    const second = await service.createEstate({
      actorUserId,
      input: { id: secondId, ...fields, estateName: "乙屋苑" },
    });
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ id, isPublished: false, version: 1 });
    expect(second).toMatchObject({ id: secondId, isPublished: false, version: 1 });
    expect(rows.size).toBe(2);
    expect(calls.map((call) => call.command)).toEqual(["create", "create", "create"]);
  });

  test("content update omits publication and preserves canonical published state", async () => {
    const { service, calls } = setup();
    const created = await service.createEstate({
      actorUserId,
      input: { id, estateName: "甲屋苑", district: "九龍", notes: null, sortOrder: 0 },
    });
    const published = await service.setEstatePublication({
      actorUserId,
      input: { id, expectedVersion: created.version, isPublished: true },
    });
    const edited = await service.updateEstate({
      actorUserId,
      input: {
        id,
        expectedVersion: published.version,
        fields: { estateName: "甲新名", district: "九龍", notes: null, sortOrder: 0 },
      },
    });
    expect(edited).toMatchObject({ estateName: "甲新名", isPublished: true, version: 3 });
    expect(calls[2]?.input).not.toHaveProperty("isPublished");
    const unpublished = await service.setEstatePublication({
      actorUserId,
      input: { id, expectedVersion: edited.version, isPublished: false },
    });
    expect(unpublished).toMatchObject({ isPublished: false, version: 4 });
  });

  test("rejects content commands that smuggle publication or omit expected version", async () => {
    const { service, calls } = setup();
    await expect(
      service.updateEstate({
        actorUserId,
        input: {
          id,
          expectedVersion: 1,
          fields: {
            estateName: "甲",
            district: "九龍",
            notes: null,
            sortOrder: 0,
            isPublished: true,
          },
        },
      }),
    ).rejects.toThrow();
    await expect(
      service.setEstatePublication({ actorUserId, input: { id, isPublished: true } }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
