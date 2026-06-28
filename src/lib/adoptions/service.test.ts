import { describe, expect, test } from "bun:test";

import {
  createAdoptionCoordinatorService,
  type AdoptionCoordinatorRepository,
  type CoordinatorOpsRepositoryMethods,
} from "./service";
import type { CoordinatorStatus, CoordinatorTask } from "./types";

const adminId = "11111111-2222-4333-8444-555555555555";
const caseId = "22222222-3333-4333-8444-555555555555";
const statusId = "33333333-4444-4333-8444-555555555555";
const matchStatusId = "44444444-5555-4333-8444-555555555555";
const followupStatusId = "55555555-6666-4333-8444-555555555555";
const finalOutcomeStatusId = "66666666-7777-4333-8444-555555555555";
const animalId = "77777777-8888-4333-8444-555555555555";
const matchId = "88888888-9999-4333-8444-555555555555";
const adopterProfileId = "99999999-aaaa-4333-8444-555555555555";

function manualCaseInput() {
  return {
    identity: {
      kind: "existing_adopter",
      adopterProfileId,
    },
    case: {
      initialStatusId: statusId,
      animalType: "cat",
      applicantName: "Ada",
      applicantPhone: "9123 4567",
      preferences: {},
    },
  };
}

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

function task(overrides: Partial<CoordinatorTask> = {}): CoordinatorTask {
  return {
    id: "followup-1",
    title: "Home visit",
    status: status({ id: followupStatusId, category: "followup", key: "scheduled" }),
    taskType: "followup",
    priority: "normal",
    dueAt: null,
    scheduledAt: null,
    completedAt: null,
    assignedTo: null,
    volunteer: null,
    contactChannel: null,
    outcome: null,
    nextStepAt: null,
    remarks: null,
    hasWindowNet: null,
    environment: null,
    score: null,
    createdAt: "2026-06-27T08:00:00.000Z",
    updatedAt: "2026-06-27T08:00:00.000Z",
    adoptionCase: {
      id: caseId,
      applicantName: "Ada",
      animalType: "cat",
    },
    adopterProfile: null,
    animal: null,
    ...overrides,
  };
}

function createRepo(
  overrides: Partial<AdoptionCoordinatorRepository & CoordinatorOpsRepositoryMethods> = {},
): AdoptionCoordinatorRepository &
  CoordinatorOpsRepositoryMethods & { calls: Array<{ name: string; payload?: unknown }> } {
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
    async listAdopters(input) {
      calls.push({ name: "listAdopters", payload: input });
      return { adopters: [], total: 0 };
    },
    async searchManualCaseIdentity(input) {
      calls.push({ name: "searchManualCaseIdentity", payload: input });
      return { candidates: [], total: 0 };
    },
    async createManualCase(input) {
      calls.push({ name: "createManualCase", payload: input });
      return {
        caseId,
        supporterId: "supporter-1",
        adopterProfileId,
        taskId: null,
      };
    },
    async listCoordinatorExportHistory(input) {
      calls.push({ name: "listCoordinatorExportHistory", payload: input });
      return { exports: [], total: 0 };
    },
    async getCoordinatorMonthlySummary(input) {
      calls.push({ name: "getCoordinatorMonthlySummary", payload: input });
      return {
        month: input.month,
        publicIntakeCases: 0,
        manualIntakeCases: 0,
        successfulAdoptions: 0,
        openCases: 0,
        overdueTasks: 0,
        exportsRun: 0,
      };
    },
    async getCoordinatorExportAuditRow(id) {
      calls.push({ name: "getCoordinatorExportAuditRow", payload: id });
      return null;
    },
    async listCaseExportRows(input) {
      calls.push({ name: "listCaseExportRows", payload: input });
      return [];
    },
    async listAdopterExportRows(input) {
      calls.push({ name: "listAdopterExportRows", payload: input });
      return [];
    },
    async listSuccessfulAdoptionExportRows(input) {
      calls.push({ name: "listSuccessfulAdoptionExportRows", payload: input });
      return [];
    },
    async listAnimalExportRows(input) {
      calls.push({ name: "listAnimalExportRows", payload: input });
      return [];
    },
    async listTaskExportRows(input) {
      calls.push({ name: "listTaskExportRows", payload: input });
      return [];
    },
    async getAdopterDetail(id) {
      calls.push({ name: "getAdopterDetail", payload: id });
      return id === adopterProfileId
        ? {
            id: adopterProfileId,
            supporterId: "supporter-1",
            displayName: "Ada",
            email: "ada@example.test",
            phone: "61234567",
            livingArea: "Kowloon",
            isBlacklisted: false,
            openCaseCount: 1,
            successfulAdoptionCount: 0,
            openTaskCount: 1,
            latestCaseAt: "2026-06-27T08:00:00.000Z",
            latestCase: null,
            nameEnglish: "Ada",
            nameChinese: null,
            gender: null,
            birthday: null,
            occupation: null,
            facebook: null,
            householdSize: null,
            monthlyHouseholdIncome: null,
            address: null,
            floorArea: null,
            blacklistReason: null,
            emailConsent: null,
            whatsappConsent: null,
            cases: [],
            successfulAdoptions: [],
            tasks: [],
          }
        : null;
    },
    async getCaseDetail(id) {
      calls.push({ name: "getCaseDetail", payload: id });
      return null;
    },
    async listTasks(input) {
      calls.push({ name: "listTasks", payload: input });
      return { tasks: [], total: 0 };
    },
    async getTask(id) {
      calls.push({ name: "getTask", payload: id });
      return null;
    },
    async createTask(input) {
      calls.push({ name: "createTask", payload: input });
      return { id: "followup-1" };
    },
    async updateTask(input) {
      calls.push({ name: "updateTask", payload: input });
      return { id: input.taskId };
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

function setup(
  overrides: Partial<AdoptionCoordinatorRepository & CoordinatorOpsRepositoryMethods> = {},
) {
  const repo = createRepo(overrides);
  return {
    repo,
    service: createAdoptionCoordinatorService({ repo }),
    calls: repo.calls,
  };
}

describe("createAdoptionCoordinatorService", () => {
  test("creates manual case after validating active case status", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "adoption_case", isActive: true });
      },
      async createManualCase(input) {
        repo.calls.push({ name: "createManualCase", payload: input });
        return {
          caseId: "66666666-7777-4333-8444-555555555555",
          supporterId: "22222222-3333-4333-8444-555555555555",
          adopterProfileId: "55555555-6666-4333-8444-555555555555",
          taskId: null,
        };
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    const result = await service.createManualCase({
      actorUserId: adminId,
      input: manualCaseInput(),
    });

    expect(result.caseId).toBe("66666666-7777-4333-8444-555555555555");
    expect(repo.calls.find((call) => call.name === "createManualCase")?.payload).toMatchObject({
      actorUserId: adminId,
      case: { source: "manual_intake" },
    });
  });

  test("rejects manual case creation with inactive or non-case status", async () => {
    const nonCaseRepo = createRepo({
      async getStatus(id) {
        nonCaseRepo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "followup", isActive: true });
      },
    });
    const inactiveRepo = createRepo({
      async getStatus(id) {
        inactiveRepo.calls.push({ name: "getStatus", payload: id });
        return status({ id, category: "adoption_case", isActive: false });
      },
    });

    await expect(
      createAdoptionCoordinatorService({ repo: nonCaseRepo }).createManualCase({
        actorUserId: adminId,
        input: manualCaseInput(),
      }),
    ).rejects.toThrow("Invalid case status");
    await expect(
      createAdoptionCoordinatorService({ repo: inactiveRepo }).createManualCase({
        actorUserId: adminId,
        input: manualCaseInput(),
      }),
    ).rejects.toThrow("Inactive case status");

    expect(nonCaseRepo.calls.map((call) => call.name)).toEqual(["getStatus"]);
    expect(inactiveRepo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("lists coordinator export history with normalized filters", async () => {
    const { service, calls } = setup();

    await expect(
      service.listCoordinatorExportHistory({
        month: "2026-06",
        kind: "cases",
        actor: " Ada ",
        page: "2",
      }),
    ).resolves.toEqual({ exports: [], total: 0 });

    expect(calls.at(-1)?.payload).toMatchObject({
      month: "2026-06",
      kind: "cases",
      actor: "Ada",
      page: 2,
    });
  });

  test("regenerates coordinator exports from audit metadata and audits regeneration", async () => {
    const auditLogId = "aaaaaaaa-bbbb-4333-8444-555555555555";
    const { service, calls } = setup({
      async getCoordinatorExportAuditRow(id) {
        calls.push({ name: "getCoordinatorExportAuditRow", payload: id });
        return {
          id,
          actorUserId: adminId,
          actorLabel: null,
          action: "coordinator_export.cases",
          kind: "cases",
          rowCount: 1,
          filters: { openOnly: true },
          sourceRoute: "/api/admin/adoptions/exports/cases.csv",
          timestamp: "2026-06-28T00:00:00.000Z",
        };
      },
      async listCaseExportRows(input) {
        calls.push({ name: "listCaseExportRows", payload: input });
        return [];
      },
    });

    const result = await service.regenerateCoordinatorExport({
      actorUserId: "99999999-aaaa-4333-8444-555555555555",
      auditLogId,
    });

    expect(result.filename).toBe("coordinator-cases.csv");
    expect(calls).toContainEqual(
      expect.objectContaining({
        name: "insertAuditLog",
        payload: expect.objectContaining({
          action: "coordinator_export.regenerate",
          entity: "coordinator_export",
          entity_id: auditLogId,
          detail: {
            kind: "cases",
            filters: { openOnly: true },
            rowCount: 0,
            sourceAuditLogId: auditLogId,
            sourceRoute: `/api/admin/adoptions/reports/exports/${auditLogId}/download`,
          },
        }),
      }),
    );
  });

  test("reports missing coordinator ops repository methods clearly", async () => {
    const { searchManualCaseIdentity, ...repoWithoutOps } = createRepo();

    expect(() =>
      createAdoptionCoordinatorService({ repo: repoWithoutOps }).searchManualCaseIdentity({
        q: "Ada",
      }),
    ).toThrow("Coordinator ops repository method unavailable: searchManualCaseIdentity");

    expect(searchManualCaseIdentity).toBeFunction();
  });

  test("preserves coordinator ops repository method receiver", async () => {
    const repo = createRepo({
      async searchManualCaseIdentity(
        this: { calls: Array<{ name: string; payload?: unknown }> },
        input,
      ) {
        this.calls.push({ name: "searchManualCaseIdentityWithThis", payload: input });
        return { candidates: [], total: this.calls.length };
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(service.searchManualCaseIdentity({ q: " Ada " })).resolves.toEqual({
      candidates: [],
      total: 1,
    });
    expect(repo.calls).toContainEqual({
      name: "searchManualCaseIdentityWithThis",
      payload: { q: "Ada", page: 1, pageSize: 10 },
    });
  });

  test("exports coordinator CSV and audits row count", async () => {
    const { service, calls } = setup();

    const result = await service.exportCoordinatorCsv({
      actorUserId: adminId,
      kind: "adopters",
      rawSearch: { q: "Ada" },
    });

    expect(result).toEqual({
      csv: "adopter_profile_id,supporter_id,display_name,email,phone,living_area,is_blacklisted,open_case_count,successful_adoption_count,open_task_count,latest_case_at",
      filename: "coordinator-adopters.csv",
      rowCount: 0,
    });
    expect(calls).toContainEqual({
      name: "insertAuditLog",
      payload: expect.objectContaining({
        action: "coordinator_export.adopters",
        entity: "coordinator_export",
        entity_id: "adopters",
        detail: {
          filters: {
            q: "Ada",
            blacklisted: "all",
            hasOpenCases: false,
            hasOpenTasks: false,
            page: 1,
            pageSize: 1000,
          },
          rowCount: 0,
        },
      }),
    });
  });

  test("exports paginated coordinator CSV kinds from the first capped page", async () => {
    const { service, calls } = setup();

    await service.exportCoordinatorCsv({
      actorUserId: adminId,
      kind: "cases",
      rawSearch: { q: "Milo", page: "4", pageSize: "5" },
    });
    await service.exportCoordinatorCsv({
      actorUserId: adminId,
      kind: "tasks",
      rawSearch: { q: "call", page: "3", pageSize: "10" },
    });

    expect(calls).toContainEqual({
      name: "listCaseExportRows",
      payload: {
        q: "Milo",
        openOnly: false,
        page: 1,
        pageSize: 1000,
      },
    });
    expect(calls).toContainEqual({
      name: "insertAuditLog",
      payload: expect.objectContaining({
        action: "coordinator_export.cases",
        detail: {
          filters: {
            q: "Milo",
            openOnly: false,
            page: 1,
            pageSize: 1000,
          },
          rowCount: 0,
        },
      }),
    });
    expect(calls).toContainEqual({
      name: "listTaskExportRows",
      payload: {
        q: "call",
        due: "all",
        openOnly: false,
        page: 1,
        pageSize: 1000,
      },
    });
    expect(calls).toContainEqual({
      name: "insertAuditLog",
      payload: expect.objectContaining({
        action: "coordinator_export.tasks",
        detail: {
          filters: {
            q: "call",
            due: "all",
            openOnly: false,
            page: 1,
            pageSize: 1000,
          },
          rowCount: 0,
        },
      }),
    });
  });

  test("exports global coordinator CSV kinds with capped audit filters", async () => {
    const { service, calls } = setup();

    await service.exportCoordinatorCsv({
      actorUserId: adminId,
      kind: "successful-adoptions",
      rawSearch: { page: "3", pageSize: "25" },
    });
    await service.exportCoordinatorCsv({
      actorUserId: adminId,
      kind: "animals",
      rawSearch: { page: "2", pageSize: "50" },
    });

    expect(calls).toContainEqual({
      name: "listSuccessfulAdoptionExportRows",
      payload: { page: 1, pageSize: 1000 },
    });
    expect(calls).toContainEqual({
      name: "listAnimalExportRows",
      payload: { page: 1, pageSize: 1000 },
    });
    expect(calls).toContainEqual({
      name: "insertAuditLog",
      payload: expect.objectContaining({
        action: "coordinator_export.successful-adoptions",
        detail: { filters: { page: 1, pageSize: 1000 }, rowCount: 0 },
      }),
    });
    expect(calls).toContainEqual({
      name: "insertAuditLog",
      payload: expect.objectContaining({
        action: "coordinator_export.animals",
        detail: { filters: { page: 1, pageSize: 1000 }, rowCount: 0 },
      }),
    });
  });

  test("lists adopters with normalized filters", async () => {
    const { service, calls } = setup();

    await service.listAdopters({
      q: " Ada ",
      blacklisted: "no",
      hasOpenCases: "true",
      hasOpenTasks: "",
      page: "2",
      pageSize: "50",
    });

    expect(calls).toContainEqual({
      name: "listAdopters",
      payload: {
        q: "Ada",
        blacklisted: "no",
        hasOpenCases: true,
        hasOpenTasks: false,
        page: 2,
        pageSize: 50,
      },
    });
  });

  test("returns adopter detail from repository", async () => {
    const { service } = setup();

    await expect(service.getAdopterDetail(adopterProfileId)).resolves.toMatchObject({
      id: adopterProfileId,
      displayName: "Ada",
    });
  });

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

  test("creates a coordinator task linked to case adopter and animal and audits it", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({
      repo,
      now: () => new Date("2026-06-27T10:00:00.000Z"),
    });

    await service.createTask({
      actorUserId: adminId,
      input: {
        title: "Post-adoption call",
        statusId: followupStatusId,
        adoptionCaseId: caseId,
        adopterProfileId,
        animalId,
        priority: "high",
        dueAt: "2026-06-28T10:00:00.000Z",
        contactChannel: "phone",
      },
    });

    expect(repo.calls.map((call) => call.name)).toEqual([
      "getStatus",
      "createTask",
      "insertAuditLog",
    ]);
    expect(repo.calls[1].payload).toMatchObject({
      title: "Post-adoption call",
      adoptionCaseId: caseId,
      adopterProfileId,
      animalId,
      priority: "high",
      createdBy: adminId,
    });
    expect(repo.calls[2].payload).toMatchObject({
      action: "coordinator_task.create",
      entity: "adoption_followup",
      actor_user_id: adminId,
    });
  });

  test("rejects coordinator tasks without linked entities before repository mutation", async () => {
    const repo = createRepo();
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.createTask({
        actorUserId: adminId,
        input: { title: "Unlinked", statusId: followupStatusId },
      }),
    ).rejects.toThrow();

    expect(repo.calls).toEqual([]);
  });

  test("rejects completed task status without completion details before repository mutation", async () => {
    const repo = createRepo({
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({
          id,
          category: "followup",
          key: "completed",
          isFinal: true,
          isClosing: true,
        });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.createTask({
        actorUserId: adminId,
        input: {
          title: "Complete home visit",
          statusId: followupStatusId,
          adoptionCaseId: caseId,
        },
      }),
    ).rejects.toThrow("Completed tasks require a completed date");

    expect(repo.calls.map((call) => call.name)).toEqual(["getStatus"]);
  });

  test("updates coordinator task and audits complete action", async () => {
    const repo = createRepo({
      async getTask(id) {
        repo.calls.push({ name: "getTask", payload: id });
        return task();
      },
      async getStatus(id) {
        repo.calls.push({ name: "getStatus", payload: id });
        return status({
          id,
          category: "followup",
          key: "completed",
          isFinal: true,
          isClosing: true,
        });
      },
      async updateTask(input) {
        repo.calls.push({ name: "updateTask", payload: input });
        return { id: "followup-1" };
      },
    });
    const service = createAdoptionCoordinatorService({
      repo,
      now: () => new Date("2026-06-27T10:00:00.000Z"),
    });

    await service.updateTask({
      actorUserId: adminId,
      taskId: "followup-1",
      input: {
        statusId: followupStatusId,
        completedAt: "2026-06-27T09:30:00.000Z",
        outcome: "Visit completed",
      },
    });

    expect(repo.calls.map((call) => call.name)).toEqual([
      "getTask",
      "getStatus",
      "updateTask",
      "insertAuditLog",
    ]);
    expect(repo.calls[3].payload).toMatchObject({
      action: "coordinator_task.complete",
      entity: "adoption_followup",
      entity_id: "followup-1",
    });
  });

  test("rejects task updates that remove the last linked entity before repository mutation", async () => {
    const repo = createRepo({
      async getTask(id) {
        repo.calls.push({ name: "getTask", payload: id });
        return task({
          adoptionCase: {
            id: caseId,
            applicantName: "Ada",
            animalType: "cat",
          },
          adopterProfile: null,
          animal: null,
        });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.updateTask({
        actorUserId: adminId,
        taskId: "followup-1",
        input: { adoptionCaseId: null },
      }),
    ).rejects.toThrow("Invalid coordinator task links");

    expect(repo.calls.map((call) => call.name)).toEqual(["getTask"]);
  });

  test("rejects task updates that invalidate existing completed task details before mutation", async () => {
    const repo = createRepo({
      async getTask(id) {
        repo.calls.push({ name: "getTask", payload: id });
        return task({
          status: status({
            id: followupStatusId,
            category: "followup",
            key: "completed",
            isFinal: true,
            isClosing: true,
          }),
          completedAt: "2026-06-27T09:30:00.000Z",
          outcome: "Visit completed",
        });
      },
    });
    const service = createAdoptionCoordinatorService({ repo });

    await expect(
      service.updateTask({
        actorUserId: adminId,
        taskId: "followup-1",
        input: { completedAt: null },
      }),
    ).rejects.toThrow("Completed tasks require a completed date");

    expect(repo.calls.map((call) => call.name)).toEqual(["getTask"]);
  });
});
