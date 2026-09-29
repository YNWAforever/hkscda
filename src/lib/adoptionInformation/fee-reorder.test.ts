import { describe, expect, test } from "bun:test";
import { createAdoptionInformationService, type AdoptionInformationRepository } from "./service";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";

describe("atomic adoption fee commands", () => {
  test("reorder sends IDs and expected versions through one audited repository command", async () => {
    const calls: unknown[] = [];
    const repo = {
      usesAtomicAudit: true,
      async reorderFees(input: unknown, actor: string) {
        calls.push({ input, actor });
        return [
          {
            id: firstId,
            animalType: "dog",
            itemName: "A",
            priceHkd: "100",
            sortOrder: 1,
            isPublished: true,
            version: 2,
          },
          {
            id: secondId,
            animalType: "dog",
            itemName: "B",
            priceHkd: "200",
            sortOrder: 0,
            isPublished: true,
            version: 2,
          },
        ];
      },
      async insertAuditLog() {
        throw new Error("audit must be inside RPC");
      },
    } as unknown as AdoptionInformationRepository;
    const service = createAdoptionInformationService({ repo });
    const input = { firstId, secondId, expectedVersions: { first: 1, second: 1 } };
    const rows = await service.reorderFees({ actorUserId, input });
    expect(rows.map((row) => row.sortOrder)).toEqual([1, 0]);
    expect(calls).toEqual([{ input, actor: actorUserId }]);
  });

  test("rejects same ID, malformed versions and unexpected sort positions before writing", async () => {
    const calls: unknown[] = [];
    const repo = {
      async reorderFees(input: unknown) {
        calls.push(input);
        return [];
      },
    } as unknown as AdoptionInformationRepository;
    const service = createAdoptionInformationService({ repo });
    await expect(
      service.reorderFees({
        actorUserId,
        input: { firstId, secondId: firstId, expectedVersions: { first: 1, second: 1 } },
      }),
    ).rejects.toThrow();
    await expect(
      service.reorderFees({
        actorUserId,
        input: { firstId, secondId, expectedVersions: { first: 0, second: 1 } },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("fee content save has a version and cannot smuggle order or publication", async () => {
    const calls: unknown[] = [];
    const repo = {
      usesAtomicAudit: true,
      async updateFeeContent(input: unknown, actor: string) {
        calls.push({ input, actor });
        return {
          id: firstId,
          animalType: "dog",
          itemName: "Edited",
          priceHkd: "100",
          sortOrder: 0,
          isPublished: true,
          version: 2,
        };
      },
    } as unknown as AdoptionInformationRepository;
    const service = createAdoptionInformationService({ repo });
    const input = { id: firstId, expectedVersion: 1, itemName: "Edited", priceHkd: "100" };
    const result = await service.updateFeeContent({ actorUserId, input });
    expect(result.sortOrder).toBe(0);
    expect(calls).toEqual([{ input, actor: actorUserId }]);
    await expect(
      service.updateFeeContent({
        actorUserId,
        input: { ...input, sortOrder: 99, isPublished: false },
      }),
    ).rejects.toThrow();
  });
  test("legacy fee upsert cannot write a stale sort order or publication", async () => {
    let calls = 0;
    const repo = {
      async upsertFee() {
        calls++;
        throw new Error("legacy update reached repository");
      },
    } as unknown as AdoptionInformationRepository;
    const service = createAdoptionInformationService({ repo });
    await expect(
      service.upsertFee({
        actorUserId,
        input: {
          id: firstId,
          animalType: "dog",
          itemName: "Old",
          priceHkd: "HK$1",
          sortOrder: 99,
          isPublished: false,
        },
      }),
    ).rejects.toThrow("versioned fee content command");
    expect(calls).toBe(0);
  });
});
