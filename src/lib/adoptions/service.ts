import type { z } from "zod";

import { buildCaseFromPublicApplication, type PublicApplicationInput } from "./caseFactory";
import { assertCanMutateStatus } from "./status";
import {
  caseSearchSchema,
  finalizeAdoptionSchema,
  followupInputSchema,
  matchInputSchema,
  statusInputSchema,
  statusTransitionSchema,
  statusUpdateSchema,
} from "./schemas";
import type { AdoptionCaseDetail, AdoptionCaseSummary, CoordinatorStatus } from "./types";

export type StatusInput = z.infer<typeof statusInputSchema>;
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;
export type CaseSearch = z.infer<typeof caseSearchSchema>;
export type MatchInput = z.infer<typeof matchInputSchema>;
export type FollowupInput = z.infer<typeof followupInputSchema>;
export type FinalizeAdoptionInput = z.infer<typeof finalizeAdoptionSchema>;
export type CaseFromPublicApplicationInput = ReturnType<typeof buildCaseFromPublicApplication> & {
  publicApplicationId: string;
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
  getCaseDetail(id: string): Promise<AdoptionCaseDetail | null>;
  createCaseFromPublicApplication(input: CaseFromPublicApplicationInput): Promise<{ id: string }>;
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

type CreateAdoptionCoordinatorServiceArgs = {
  repo: AdoptionCoordinatorRepository;
  now?: () => Date;
};

function timestamp(now: () => Date) {
  return now().toISOString();
}

export function createAdoptionCoordinatorService({
  repo,
  now = () => new Date(),
}: CreateAdoptionCoordinatorServiceArgs) {
  return {
    listStatuses(category?: string) {
      return repo.listStatuses(category);
    },

    getStatus(statusId: string) {
      return repo.getStatus(statusId);
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
      const input = followupInputSchema.parse(args.input);
      const status = await repo.getStatus(input.statusId);
      if (!status || status.category !== "followup") throw new Error("Invalid followup status");
      if (!status.isActive) throw new Error("Inactive followup status");

      return repo.createFollowup({
        ...input,
        adoptionCaseId: args.caseId,
        createdBy: args.actorUserId,
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
}
