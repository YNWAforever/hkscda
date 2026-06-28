import { z } from "zod";

import { buildCaseFromPublicApplication, type PublicApplicationInput } from "./caseFactory";
import { assertCanMutateStatus } from "./status";
import {
  buildCoordinatorAdopterCsv,
  buildCoordinatorAnimalCsv,
  buildCoordinatorCaseCsv,
  buildCoordinatorSuccessfulAdoptionCsv,
  buildCoordinatorTaskCsv,
} from "./csv";
import {
  adopterSearchSchema,
  caseSearchSchema,
  coordinatorMonthlySummarySearchSchema,
  coordinatorExportKindSchema,
  coordinatorReportHistorySearchSchema,
  coordinatorTaskInputSchema,
  coordinatorTaskUpdateSchema,
  finalizeAdoptionSchema,
  followupInputSchema,
  matchInputSchema,
  manualCaseIntakeSchema,
  statusInputSchema,
  statusTransitionSchema,
  statusUpdateSchema,
  taskListSearchSchema,
} from "./schemas";
import { buildTaskAuditAction, validateTaskCompletion } from "./tasks";
import type {
  AdoptionCaseDetail,
  AdoptionCaseSummary,
  AdopterDetail,
  AdopterSummary,
  CoordinatorAdopterExportRow,
  CoordinatorAnimalExportRow,
  CoordinatorExportAuditRow,
  CoordinatorCaseExportRow,
  CoordinatorExportResult,
  CoordinatorMonthlySummary,
  CoordinatorStatus,
  CoordinatorSuccessfulAdoptionExportRow,
  CoordinatorTask,
  CoordinatorTaskExportRow,
  ManualCaseIdentityCandidate,
  ManualCaseIntakeResult,
} from "./types";

export type StatusInput = z.infer<typeof statusInputSchema>;
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;
export type CaseSearch = z.infer<typeof caseSearchSchema>;
export type AdopterSearch = z.infer<typeof adopterSearchSchema>;
export type MatchInput = z.infer<typeof matchInputSchema>;
export type FollowupInput = z.infer<typeof followupInputSchema>;
export type FinalizeAdoptionInput = z.infer<typeof finalizeAdoptionSchema>;
export type TaskListSearch = z.infer<typeof taskListSearchSchema>;
export type CoordinatorTaskInput = z.infer<typeof coordinatorTaskInputSchema>;
export type CoordinatorTaskUpdate = z.infer<typeof coordinatorTaskUpdateSchema>;
export type ManualCaseIntakeInput = z.infer<typeof manualCaseIntakeSchema>;
export type CoordinatorReportHistorySearch = z.infer<typeof coordinatorReportHistorySearchSchema>;
export type CoordinatorMonthlySummarySearch = z.infer<typeof coordinatorMonthlySummarySearchSchema>;
export type CoordinatorExportPage = { page: number; pageSize: number };
export type CaseFromPublicApplicationInput = ReturnType<typeof buildCaseFromPublicApplication> & {
  publicApplicationId: string;
};

type ManualCaseRepositoryInput = ManualCaseIntakeInput & {
  actorUserId: string;
  case: ManualCaseIntakeInput["case"] & { source: "manual_intake" };
};

export type AuditLogInsert = {
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  timestamp?: string;
  detail: Record<string, unknown>;
};

export type AdoptionCoordinatorRepository = {
  listStatuses(category?: string): Promise<CoordinatorStatus[]>;
  getStatus(id: string): Promise<CoordinatorStatus | null>;
  createStatus(input: StatusInput): Promise<CoordinatorStatus>;
  updateStatus(id: string, input: StatusUpdate): Promise<CoordinatorStatus>;
  deleteStatus(id: string): Promise<void>;
  listCases(input: CaseSearch): Promise<{ cases: AdoptionCaseSummary[]; total: number }>;
  listCaseExportRows(input: CaseSearch): Promise<CoordinatorCaseExportRow[]>;
  getCaseDetail(id: string): Promise<AdoptionCaseDetail | null>;
  listAdopters(input: AdopterSearch): Promise<{ adopters: AdopterSummary[]; total: number }>;
  listAdopterExportRows(input: AdopterSearch): Promise<CoordinatorAdopterExportRow[]>;
  getAdopterDetail(id: string): Promise<AdopterDetail | null>;
  createCaseFromPublicApplication(input: CaseFromPublicApplicationInput): Promise<{ id: string }>;
  listTasks(input: TaskListSearch): Promise<{ tasks: CoordinatorTask[]; total: number }>;
  listSuccessfulAdoptionExportRows(
    input: CoordinatorExportPage,
  ): Promise<CoordinatorSuccessfulAdoptionExportRow[]>;
  listAnimalExportRows(input: CoordinatorExportPage): Promise<CoordinatorAnimalExportRow[]>;
  listTaskExportRows(input: TaskListSearch): Promise<CoordinatorTaskExportRow[]>;
  getTask(id: string): Promise<CoordinatorTask | null>;
  createTask(
    input: CoordinatorTaskInput & {
      createdBy: string;
    },
  ): Promise<{ id: string }>;
  updateTask(
    input: CoordinatorTaskUpdate & {
      taskId: string;
      updatedBy: string;
    },
  ): Promise<{ id: string }>;
  changeCaseStatus(input: {
    caseId: string;
    statusId: string;
    closedAt: string | null;
    actorUserId: string;
    note: string | null;
  }): Promise<void>;
  insertAuditLog(input: AuditLogInsert): Promise<void>;
  createMatch(
    input: MatchInput & {
      adoptionCaseId: string;
      createdBy: string;
      isApproved: boolean;
    },
  ): Promise<{ id: string }>;
  createFollowup(
    input: FollowupInput & {
      adoptionCaseId: string;
      createdBy: string;
    },
  ): Promise<{ id: string }>;
  finalizeAdoption(
    input: FinalizeAdoptionInput & {
      adoptionCaseId: string;
      approvedBy: string;
    },
  ): Promise<{ id: string }>;
};

export type CoordinatorOpsRepositoryMethods = {
  searchManualCaseIdentity(input: {
    q?: string;
    page: number;
    pageSize: number;
  }): Promise<{ candidates: ManualCaseIdentityCandidate[]; total: number }>;
  createManualCase(input: ManualCaseRepositoryInput): Promise<ManualCaseIntakeResult>;
  listCoordinatorExportHistory(
    input: CoordinatorReportHistorySearch,
  ): Promise<{ exports: CoordinatorExportAuditRow[]; total: number }>;
  getCoordinatorMonthlySummary(
    input: CoordinatorMonthlySummarySearch,
  ): Promise<CoordinatorMonthlySummary>;
  getCoordinatorExportAuditRow(id: string): Promise<CoordinatorExportAuditRow | null>;
};

type AdoptionCoordinatorServiceRepository = AdoptionCoordinatorRepository &
  Partial<CoordinatorOpsRepositoryMethods>;

type CreateAdoptionCoordinatorServiceArgs = {
  repo: AdoptionCoordinatorServiceRepository;
  now?: () => Date;
};

function timestamp(now: () => Date) {
  return now().toISOString();
}

function coordinatorExportPage(): CoordinatorExportPage {
  return { page: 1, pageSize: 1000 };
}

function requireCoordinatorOpsMethod<K extends keyof CoordinatorOpsRepositoryMethods>(
  repo: AdoptionCoordinatorServiceRepository,
  methodName: K,
): CoordinatorOpsRepositoryMethods[K] {
  const method = repo[methodName];
  if (typeof method !== "function") {
    throw new Error(`Coordinator ops repository method unavailable: ${methodName}`);
  }
  return method.bind(repo) as CoordinatorOpsRepositoryMethods[K];
}

function hasEffectiveTaskLink(current: CoordinatorTask, input: CoordinatorTaskUpdate) {
  const adoptionCaseId =
    input.adoptionCaseId !== undefined ? input.adoptionCaseId : current.adoptionCase?.id;
  const adopterProfileId =
    input.adopterProfileId !== undefined ? input.adopterProfileId : current.adopterProfile?.id;
  const animalId = input.animalId !== undefined ? input.animalId : current.animal?.id;

  return Boolean(adoptionCaseId || adopterProfileId || animalId);
}

function effectiveTaskCompletion(current: CoordinatorTask, input: CoordinatorTaskUpdate) {
  return {
    completedAt: input.completedAt !== undefined ? input.completedAt : current.completedAt,
    outcome: input.outcome !== undefined ? input.outcome : current.outcome,
    remarks: input.remarks !== undefined ? input.remarks : current.remarks,
  };
}

export function createAdoptionCoordinatorService({
  repo,
  now = () => new Date(),
}: CreateAdoptionCoordinatorServiceArgs) {
  const service = {
    listStatuses(category?: string) {
      return repo.listStatuses(category);
    },

    getStatus(statusId: string) {
      return repo.getStatus(statusId);
    },

    searchManualCaseIdentity(rawSearch: unknown) {
      const input = z
        .object({
          q: z.string().trim().optional(),
          page: z.coerce.number().int().min(1).catch(1),
          pageSize: z.coerce.number().int().min(1).max(25).catch(10),
        })
        .parse(rawSearch);
      const searchManualCaseIdentity = requireCoordinatorOpsMethod(
        repo,
        "searchManualCaseIdentity",
      );
      return searchManualCaseIdentity(input);
    },

    async createStatus(args: { actorUserId: string | null; input: unknown }) {
      const input = statusInputSchema.parse(args.input);
      const status = await repo.createStatus(input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.create",
        entity: "coordinator_status",
        entity_id: status.id,
        timestamp: timestamp(now),
        detail: { category: status.category, key: status.key },
      });
      return status;
    },

    async updateStatus(args: { actorUserId: string | null; statusId: string; input: unknown }) {
      const current = await repo.getStatus(args.statusId);
      if (!current) throw new Error("Status not found");

      const input = statusUpdateSchema.parse(args.input);
      assertCanMutateStatus(current, {
        nextKey: input.key,
        nextCategory: input.category,
        nextLabelZh: input.labelZh,
        nextLabelEn: input.labelEn,
      });

      const status = await repo.updateStatus(args.statusId, input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.update",
        entity: "coordinator_status",
        entity_id: args.statusId,
        timestamp: timestamp(now),
        detail: input,
      });
      return status;
    },

    async deleteStatus(args: { actorUserId: string | null; statusId: string }) {
      const current = await repo.getStatus(args.statusId);
      if (!current) throw new Error("Status not found");
      assertCanMutateStatus(current, { delete: true });

      await repo.deleteStatus(args.statusId);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_status.delete",
        entity: "coordinator_status",
        entity_id: args.statusId,
        timestamp: timestamp(now),
        detail: { category: current.category, key: current.key },
      });
    },

    listCases(rawSearch: unknown) {
      return repo.listCases(caseSearchSchema.parse(rawSearch));
    },

    getCaseDetail(caseId: string) {
      return repo.getCaseDetail(caseId);
    },

    listAdopters(rawSearch: unknown) {
      return repo.listAdopters(adopterSearchSchema.parse(rawSearch));
    },

    getAdopterDetail(adopterProfileId: string) {
      return repo.getAdopterDetail(adopterProfileId);
    },

    async createManualCase(args: { actorUserId: string; input: unknown }) {
      const input = manualCaseIntakeSchema.parse(args.input);
      const status = await repo.getStatus(input.case.initialStatusId);
      if (!status || status.category !== "adoption_case") throw new Error("Invalid case status");
      if (!status.isActive) throw new Error("Inactive case status");

      if (input.initialTask) {
        const taskStatus = await repo.getStatus(input.initialTask.statusId);
        if (!taskStatus || taskStatus.category !== "followup") {
          throw new Error("Invalid followup status");
        }
        if (!taskStatus.isActive) throw new Error("Inactive followup status");
        validateTaskCompletion({
          status: taskStatus,
          completedAt: null,
          outcome: null,
          remarks: input.initialTask.remarks ?? null,
        });
      }

      const createManualCase = requireCoordinatorOpsMethod(repo, "createManualCase");
      return createManualCase({
        ...input,
        actorUserId: args.actorUserId,
        case: { ...input.case, source: "manual_intake" },
      });
    },

    listCoordinatorExportHistory(rawSearch: unknown) {
      const listCoordinatorExportHistory = requireCoordinatorOpsMethod(
        repo,
        "listCoordinatorExportHistory",
      );
      return listCoordinatorExportHistory(coordinatorReportHistorySearchSchema.parse(rawSearch));
    },

    getCoordinatorMonthlySummary(rawSearch: unknown) {
      const getCoordinatorMonthlySummary = requireCoordinatorOpsMethod(
        repo,
        "getCoordinatorMonthlySummary",
      );
      return getCoordinatorMonthlySummary(coordinatorMonthlySummarySearchSchema.parse(rawSearch));
    },

    listTasks(rawSearch: unknown) {
      return repo.listTasks(taskListSearchSchema.parse(rawSearch));
    },

    async exportCoordinatorCsv(args: {
      actorUserId: string | null;
      kind: unknown;
      rawSearch: unknown;
    }): Promise<CoordinatorExportResult> {
      const kind = coordinatorExportKindSchema.parse(args.kind);
      let csv = "";
      let rowCount = 0;
      let filters: Record<string, unknown> = {};

      if (kind === "cases") {
        const parsed = caseSearchSchema.parse(args.rawSearch);
        filters = { ...parsed, ...coordinatorExportPage() };
        const rows = await repo.listCaseExportRows(filters as CaseSearch);
        csv = buildCoordinatorCaseCsv(rows);
        rowCount = rows.length;
      } else if (kind === "adopters") {
        const parsed = adopterSearchSchema.parse(args.rawSearch);
        filters = { ...parsed, ...coordinatorExportPage() };
        const rows = await repo.listAdopterExportRows(filters as AdopterSearch);
        csv = buildCoordinatorAdopterCsv(rows);
        rowCount = rows.length;
      } else if (kind === "successful-adoptions") {
        const page = coordinatorExportPage();
        filters = page;
        const rows = await repo.listSuccessfulAdoptionExportRows(page);
        csv = buildCoordinatorSuccessfulAdoptionCsv(rows);
        rowCount = rows.length;
      } else if (kind === "animals") {
        const page = coordinatorExportPage();
        filters = page;
        const rows = await repo.listAnimalExportRows(page);
        csv = buildCoordinatorAnimalCsv(rows);
        rowCount = rows.length;
      } else {
        const parsed = taskListSearchSchema.parse(args.rawSearch);
        filters = { ...parsed, ...coordinatorExportPage() };
        const rows = await repo.listTaskExportRows(filters as TaskListSearch);
        csv = buildCoordinatorTaskCsv(rows);
        rowCount = rows.length;
      }

      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: `coordinator_export.${kind}`,
        entity: "coordinator_export",
        entity_id: kind,
        timestamp: timestamp(now),
        detail: { filters, rowCount },
      });

      return { csv, rowCount, filename: `coordinator-${kind}.csv` };
    },

    async regenerateCoordinatorExport(args: {
      actorUserId: string | null;
      auditLogId: string;
    }): Promise<CoordinatorExportResult> {
      const getCoordinatorExportAuditRow = requireCoordinatorOpsMethod(
        repo,
        "getCoordinatorExportAuditRow",
      );
      const audit = await getCoordinatorExportAuditRow(args.auditLogId);
      if (!audit) throw new Error("Export audit not found");

      const result = await service.exportCoordinatorCsv({
        actorUserId: args.actorUserId,
        kind: audit.kind,
        rawSearch: audit.filters,
      });

      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "coordinator_export.regenerate",
        entity: "coordinator_export",
        entity_id: args.auditLogId,
        timestamp: timestamp(now),
        detail: {
          kind: audit.kind,
          filters: audit.filters,
          rowCount: result.rowCount,
          sourceAuditLogId: args.auditLogId,
          sourceRoute: `/api/admin/adoptions/reports/exports/${args.auditLogId}/download`,
        },
      });

      return result;
    },

    getTask(taskId: string) {
      return repo.getTask(taskId);
    },

    createCaseFromPublicApplication(args: {
      publicApplicationId: string;
      input: PublicApplicationInput;
    }) {
      return repo.createCaseFromPublicApplication({
        ...buildCaseFromPublicApplication({
          ...args.input,
          id: args.publicApplicationId,
        }),
        publicApplicationId: args.publicApplicationId,
      });
    },

    async createTask(args: { actorUserId: string; input: unknown }) {
      const input = coordinatorTaskInputSchema.parse(args.input);
      const status = await repo.getStatus(input.statusId);
      if (!status || status.category !== "followup") throw new Error("Invalid followup status");
      if (!status.isActive) throw new Error("Inactive followup status");

      validateTaskCompletion({
        status,
        completedAt: input.completedAt ?? null,
        outcome: input.outcome ?? null,
        remarks: input.remarks ?? null,
      });

      const task = await repo.createTask({
        ...input,
        createdBy: args.actorUserId,
      });

      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: buildTaskAuditAction({ created: true, status }),
        entity: "adoption_followup",
        entity_id: task.id,
        timestamp: timestamp(now),
        detail: {
          adoptionCaseId: input.adoptionCaseId ?? null,
          adopterProfileId: input.adopterProfileId ?? null,
          animalId: input.animalId ?? null,
          statusId: input.statusId,
          priority: input.priority,
          dueAt: input.dueAt ?? null,
        },
      });

      return task;
    },

    async updateTask(args: { actorUserId: string; taskId: string; input: unknown }) {
      const input = coordinatorTaskUpdateSchema.parse(args.input);
      const current = await repo.getTask(args.taskId);
      if (!current) throw new Error("Task not found");

      let statusForAudit: CoordinatorStatus | null = null;
      let effectiveStatus = current.status;
      if (input.statusId) {
        statusForAudit = await repo.getStatus(input.statusId);
        if (!statusForAudit || statusForAudit.category !== "followup") {
          throw new Error("Invalid followup status");
        }
        if (!statusForAudit.isActive) throw new Error("Inactive followup status");
        effectiveStatus = statusForAudit;
      }

      if (!hasEffectiveTaskLink(current, input)) {
        throw new Error("Invalid coordinator task links");
      }

      validateTaskCompletion({
        status: effectiveStatus,
        ...effectiveTaskCompletion(current, input),
      });

      const task = await repo.updateTask({
        ...input,
        taskId: args.taskId,
        updatedBy: args.actorUserId,
      });

      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: statusForAudit
          ? buildTaskAuditAction({ created: false, status: statusForAudit })
          : "coordinator_task.update",
        entity: "adoption_followup",
        entity_id: task.id,
        timestamp: timestamp(now),
        detail: input,
      });

      return task;
    },

    async changeCaseStatus(args: { actorUserId: string; caseId: string; input: unknown }) {
      const input = statusTransitionSchema.parse(args.input);
      const status = await repo.getStatus(input.statusId);
      if (!status || status.category !== "adoption_case") throw new Error("Invalid case status");
      if (!status.isActive) throw new Error("Inactive case status");

      await repo.changeCaseStatus({
        caseId: args.caseId,
        statusId: input.statusId,
        closedAt: status.isClosing ? timestamp(now) : null,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });
    },

    async createMatch(args: { actorUserId: string; caseId: string; input: unknown }) {
      const input = matchInputSchema.parse(args.input);
      const status = await repo.getStatus(input.statusId);
      if (!status || status.category !== "match") throw new Error("Invalid match status");
      if (!status.isActive) throw new Error("Inactive match status");

      return repo.createMatch({
        ...input,
        adoptionCaseId: args.caseId,
        createdBy: args.actorUserId,
        isApproved: status.key === "approved",
      });
    },

    async createFollowup(args: { actorUserId: string; caseId: string; input: unknown }) {
      return service.createTask({
        actorUserId: args.actorUserId,
        input: {
          ...(args.input as Record<string, unknown>),
          adoptionCaseId: args.caseId,
        },
      });
    },

    async finalizeAdoption(args: { actorUserId: string; caseId: string; input: unknown }) {
      const input = finalizeAdoptionSchema.parse(args.input);
      const status = await repo.getStatus(input.outcomeStatusId);
      if (!status || status.category !== "final_outcome") {
        throw new Error("Invalid adoption outcome status");
      }
      if (!status.isActive) throw new Error("Inactive adoption outcome status");
      if (!status.isFinal) throw new Error("Invalid adoption outcome status");
      if (status.key !== "adopted") {
        throw new Error("Invalid successful adoption outcome status");
      }

      return repo.finalizeAdoption({
        ...input,
        adoptionCaseId: args.caseId,
        approvedBy: args.actorUserId,
      });
    },
  };

  return service;
}
