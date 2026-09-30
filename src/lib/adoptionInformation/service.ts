import {
  adminAdoptionInformationQuerySchema,
  adoptionFeeInputSchema,
  updateFeeContentInputSchema,
  reorderFeesInputSchema,
  adoptionInformationIdSchema,
  adoptionRuleInputSchema,
  careTopicInputSchema,
  createEstateInputSchema,
  updateEstateInputSchema,
  setEstatePublicationInputSchema,
  type AdoptionFeeInput,
  type UpdateFeeContentInput,
  type ReorderFeesInput,
  type AdoptionRuleInput,
  type CareTopicInput,
  type CreateEstateInput,
  type UpdateEstateInput,
  type SetEstatePublicationInput,
} from "./schemas";
import type {
  AdminAdoptionInformationPage,
  AdminAdoptionInformationQuery,
  AdoptionFee,
  AdoptionRuleContent,
  CareTopic,
  DogFriendlyEstate,
  PublicAdoptionInformation,
} from "./types";

export class AdoptionInformationConflictError extends Error {
  name = "AdoptionInformationConflictError";
}

export type AdoptionInformationAuditLog = {
  actor_user_id: string;
  action:
    | "adoption_fee.create"
    | "adoption_fee.update"
    | "adoption_fee.reorder"
    | "adoption_fee.publish"
    | "adoption_fee.unpublish"
    | "dog_friendly_estate.create"
    | "dog_friendly_estate.update"
    | "dog_friendly_estate.publish"
    | "dog_friendly_estate.unpublish"
    | "dog_friendly_estate.delete";
  entity: "adoption_fee" | "dog_friendly_estate";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export interface AdoptionInformationRepository {
  usesAtomicAudit?: boolean;
  listPublic(): Promise<PublicAdoptionInformation>;
  listAdmin(input: AdminAdoptionInformationQuery): Promise<AdminAdoptionInformationPage>;
  upsertFee(input: AdoptionFeeInput, actorUserId?: string): Promise<AdoptionFee>;
  updateFeeContent(input: UpdateFeeContentInput, actorUserId: string): Promise<AdoptionFee>;
  reorderFees(input: ReorderFeesInput, actorUserId: string): Promise<AdoptionFee[]>;
  createEstate(input: CreateEstateInput, actorUserId: string): Promise<DogFriendlyEstate>;
  updateEstate(input: UpdateEstateInput, actorUserId: string): Promise<DogFriendlyEstate>;
  setEstatePublication(
    input: SetEstatePublicationInput,
    actorUserId: string,
  ): Promise<DogFriendlyEstate>;
  deleteEstate(id: string, actorUserId?: string): Promise<void>;
  upsertRule(input: AdoptionRuleInput, actorUserId: string): Promise<AdoptionRuleContent>;
  upsertCareTopic(input: CareTopicInput, actorUserId: string): Promise<CareTopic>;
  insertAuditLog(input: AdoptionInformationAuditLog): Promise<void>;
}

export function createAdoptionInformationService({
  repo,
  now = () => new Date(),
}: {
  repo: AdoptionInformationRepository;
  now?: () => Date;
}) {
  async function audit(input: Omit<AdoptionInformationAuditLog, "timestamp">) {
    await repo.insertAuditLog({ ...input, timestamp: now().toISOString() });
  }

  return {
    listPublic() {
      return repo.listPublic();
    },

    listAdmin(raw: unknown) {
      return repo.listAdmin(adminAdoptionInformationQuerySchema.parse(raw));
    },

    async upsertFee({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = adoptionFeeInputSchema.parse(input);
      if (parsed.id)
        throw new AdoptionInformationConflictError("Use the versioned fee content command");
      const fee = await repo.upsertFee(parsed, actorUserId);
      if (repo.usesAtomicAudit) return fee;
      await audit({
        actor_user_id: actorUserId,
        action: parsed.id ? "adoption_fee.update" : "adoption_fee.create",
        entity: "adoption_fee",
        entity_id: fee.id,
        detail: parsed,
      });
      await audit({
        actor_user_id: actorUserId,
        action: parsed.isPublished ? "adoption_fee.publish" : "adoption_fee.unpublish",
        entity: "adoption_fee",
        entity_id: fee.id,
        detail: {},
      });
      return fee;
    },

    async updateFeeContent({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = updateFeeContentInputSchema.parse(input);
      return repo.updateFeeContent(parsed, actorUserId);
    },

    async reorderFees({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = reorderFeesInputSchema.parse(input);
      return repo.reorderFees(parsed, actorUserId);
    },

    async createEstate({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = createEstateInputSchema.parse(input);
      return repo.createEstate(parsed, actorUserId);
    },

    async updateEstate({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = updateEstateInputSchema.parse(input);
      return repo.updateEstate(parsed, actorUserId);
    },

    async setEstatePublication({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = setEstatePublicationInputSchema.parse(input);
      return repo.setEstatePublication(parsed, actorUserId);
    },

    async deleteEstate({ actorUserId, estateId }: { actorUserId: string; estateId: string }) {
      const id = adoptionInformationIdSchema.parse(estateId);
      await repo.deleteEstate(id, actorUserId);
      if (repo.usesAtomicAudit) return;
      await audit({
        actor_user_id: actorUserId,
        action: "dog_friendly_estate.delete",
        entity: "dog_friendly_estate",
        entity_id: id,
        detail: {},
      });
    },

    // upsertRule/upsertCareTopic don't call audit() themselves — unlike
    // upsertFee above, their underlying RPCs
    // (upsert_adoption_rule_with_audit, upsert_care_topic_with_audit) already
    // insert their audit_log row atomically inside the same transaction as
    // the data change. A second, separate insertAuditLog call here would
    // duplicate that row and reintroduce the exact non-atomic-audit gap this
    // repo's CLAUDE.md warns against for new work.
    async upsertRule({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = adoptionRuleInputSchema.parse(input);
      return repo.upsertRule(parsed, actorUserId);
    },

    async upsertCareTopic({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = careTopicInputSchema.parse(input);
      return repo.upsertCareTopic(parsed, actorUserId);
    },
  };
}
