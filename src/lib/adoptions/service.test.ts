import { describe, expect, test } from "bun:test";

import { createAdoptionCoordinatorService, type AdoptionCoordinatorRepository } from "./service";
import type { CoordinatorStatus } from "./types";

const adminId = "11111111-2222-4333-8444-555555555555";
const caseId = "22222222-3333-4333-8444-555555555555";
const statusId = "33333333-4444-4333-8444-555555555555";
const matchStatusId = "44444444-5555-4333-8444-555555555555";
const followupStatusId = "55555555-6666-4333-8444-555555555555";
const finalOutcomeStatusId = "66666666-7777-4333-8444-555555555555";
const animalId = "77777777-8888-4333-8444-555555555555";
const matchId = "88888888-9999-4333-8444-555555555555";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: statusId,
    category: "adoption_case",
    key: "new",
    labelZh: "新申請",
    labelEn: "New",
    sortOrder: 10,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

function createRepo(
  overrides: Partial<AdoptionCoordinatorRepository> = {},
): AdoptionCoordinatorRepository & { calls: Array<{ name: string; payload?: unknown }> } {
  const calls: Array<{ name: string; payload?: unknown }> = [];

  return {
    calls,
    async listStatuses(category) {
      calls.push({ name: "listStatuses", payload: category });
      return [status()];
    },
    async getStatus(id) {
      calls.push({ name: "getStatus", payload: id });
      if (id === matchStatusId) return status({ id, category: "match", key: "approved" });
      if (id === followupStatusId) return status({ id, category: "followup", key: "scheduled" });
      if (id === finalOutcomeStatusId) {
        return status({ id, category: "final_outcome", key: "adopted", isFinal: true });
      }
      return status({ id });
    },
    async createStatus(input) {
      calls.push({ name: "createStatus", payload: input });
      return status({ ...input, id: "55555555-6666-4333-8444-555555555555", isSystem: false });
    },
    async updateStatus(id, input) {
      calls.push({ name: "updateStatus", payload: { id, input } });
      return status({ id, ...input });
    },
    async deleteStatus(id) {
      calls.push({ name: "deleteStatus", payload: id });
    },
    async listCases(input) {
      calls.push({ name: "listCases", payload: input });
      return { cases: [], total: 0 };
    },
    async getCaseDetail(id) {
      calls.push({ name: "getCaseDetail", payload: id });
      return null;
    },
    async changeCaseStatus(input) {
      calls.push({ name: "changeCaseStatus", payload: input });
    },
    async insertAuditLog(input) {
      calls.push({ name: "insertAuditLog", payload: input });
    },
    async createMatch(input) {
      calls.push({ name: "createMatch", payload: input });
      return { id: "match-1" };
    },
    async createFollowup(input) {
      calls.push({ name: "createFollowup", payload: input });
      return { id: "followup-1" };
    },
    async createCaseFromPublicApplication(input) {
      calls.push({ name: "createCaseFromPublicApplication", payload: input });
      return { id: caseId };
    },
    async finalizeAdoption(input) {
      calls.push({ name: "finalizeAdoption", payload: input });
      return { id: "success-1" };
    },
    ...overrides,
  };
}

describe("createAdoptionCoordinatorService", () => {
  test("creates coordinator cases from normalized public applications", async () => {
    const publicApplicationId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.createCaseFromPublicApplication({
        publicApplicationId,
        input: {
          animal_id: animalId,
          animal_name: "Mochi",
          animal_type: "cat",
          applicant_name: " Ada ",
          phone: " 9123 4567 ",
          email: "ADA@EXAMPLE.COM",
          address: "  HK Island  ",
          housing_type: "私人樓宇",
          family_size: 3,
          existing_pets: "   ",
          reason: " I can provide a safe home. ",
        },
      }),
    ).resolves.toEqual({ id: caseId });

    expect(repo.calls).toEqual([
      {
        name: "createCaseFromPublicApplication",
        payload: {
          publicApplicationId,
          requestedAnimalId: animalId,
          animalType: "cat",
          applicantName: "Ada",
          applicantPhone: "9123 4567",
          applicantEmail: "ada@example.com",
          applicantAddress: "HK Island",
          housingType: "私人樓宇",
          familySize: 3,
          existingPets: null,
          reason: "I can provide a safe home.",
          preferences: { animalName: "Mochi" },
        },
      },
    ]);
  });

  test("prevents deleting system statuses before repository mutation", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(service.deleteStatus({ actorUserId: adminId, statusId })).rejects.toThrow(
      "System statuses cannot be deleted",
    );

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("changes case status through one atomic repository method", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({
      repo,
      now: () => new Date("2026-06-26T08:30:00.000Z"),
    });

    await service.changeCaseStatus({
      actorUserId: adminId,
      caseId,
      input: { statusId, note: "Phone screening completed" },
    });

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus", "changeCaseStatus"]);
    expect(repo.calls[1].payload).toEqual({
      caseId,
      statusId,
      closedAt: null,
      actorUserId: adminId,
      note: "Phone screening completed",
    });
  });

  test("rejects changing a system status category before repository mutation", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.updateStatus({
        actorUserId: adminId,
        statusId,
        input: { category: "match" },
      }),
    ).rejects.toThrow("System status categories cannot be changed");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects changing a case to a non-case status before repository mutation", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.changeCaseStatus({
        actorUserId: adminId,
        caseId,
        input: { statusId: matchStatusId },
      }),
    ).rejects.toThrow("Invalid case status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects inactive case statuses before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, isActive: false });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.changeCaseStatus({
        actorUserId: adminId,
        caseId,
        input: { statusId },
      }),
    ).rejects.toThrow("Inactive case status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects inactive match statuses before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "match", key: "approved", isActive: false });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.createMatch({
        actorUserId: adminId,
        caseId,
        input: { animalId, statusId: matchStatusId },
      }),
    ).rejects.toThrow("Inactive match status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects inactive followup statuses before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "followup", key: "scheduled", isActive: false });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.createFollowup({
        actorUserId: adminId,
        caseId,
        input: { title: "Home visit", statusId: followupStatusId },
      }),
    ).rejects.toThrow("Inactive followup status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects finalization with non-final-outcome statuses before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "match", key: "approved" });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.finalizeAdoption({
        actorUserId: adminId,
        caseId,
        input: {
          matchId,
          outcomeStatusId: finalOutcomeStatusId,
          caseNumber: "AC-2026-001",
          approvalDate: "2026-06-26",
        },
      }),
    ).rejects.toThrow("Invalid adoption outcome status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects finalization with inactive final outcomes before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "final_outcome", key: "adopted", isActive: false });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.finalizeAdoption({
        actorUserId: adminId,
        caseId,
        input: {
          matchId,
          outcomeStatusId: finalOutcomeStatusId,
          caseNumber: "AC-2026-001",
          approvalDate: "2026-06-26",
        },
      }),
    ).rejects.toThrow("Inactive adoption outcome status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects finalization with non-final final outcomes before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "final_outcome", key: "adopted", isFinal: false });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.finalizeAdoption({
        actorUserId: adminId,
        caseId,
        input: {
          matchId,
          outcomeStatusId: finalOutcomeStatusId,
          caseNumber: "AC-2026-001",
          approvalDate: "2026-06-26",
        },
      }),
    ).rejects.toThrow("Invalid adoption outcome status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("rejects finalization with non-adopted final outcomes before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "final_outcome", key: "withdrawn", isFinal: true });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.finalizeAdoption({
        actorUserId: adminId,
        caseId,
        input: {
          matchId,
          outcomeStatusId: finalOutcomeStatusId,
          caseNumber: "AC-2026-001",
          approvalDate: "2026-06-26",
        },
      }),
    ).rejects.toThrow("Invalid successful adoption outcome status");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });
});
