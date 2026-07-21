import {
  adminAdoptionInformationQuerySchema,
  adoptionFeeInputSchema,
  adoptionInformationIdSchema,
  estateInputSchema,
  type AdoptionFeeInput,
  type EstateInput,
} from "./schemas";
import type {
  AdminAdoptionInformationPage,
  AdminAdoptionInformationQuery,
  AdoptionFee,
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
  listPublic(): Promise<PublicAdoptionInformation>;
  listAdmin(input: AdminAdoptionInformationQuery): Promise<AdminAdoptionInformationPage>;
  upsertFee(input: AdoptionFeeInput): Promise<AdoptionFee>;
  upsertEstate(input: EstateInput): Promise<DogFriendlyEstate>;
  deleteEstate(id: string): Promise<void>;
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
      const fee = await repo.upsertFee(parsed);
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

    async upsertEstate({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = estateInputSchema.parse(input);
      const estate = await repo.upsertEstate(parsed);
      await audit({
        actor_user_id: actorUserId,
        action: parsed.id ? "dog_friendly_estate.update" : "dog_friendly_estate.create",
        entity: "dog_friendly_estate",
        entity_id: estate.id,
        detail: parsed,
      });
      await audit({
        actor_user_id: actorUserId,
        action: parsed.isPublished
          ? "dog_friendly_estate.publish"
          : "dog_friendly_estate.unpublish",
        entity: "dog_friendly_estate",
        entity_id: estate.id,
        detail: {},
      });
      return estate;
    },

    async deleteEstate({ actorUserId, estateId }: { actorUserId: string; estateId: string }) {
      const id = adoptionInformationIdSchema.parse(estateId);
      await repo.deleteEstate(id);
      await audit({
        actor_user_id: actorUserId,
        action: "dog_friendly_estate.delete",
        entity: "dog_friendly_estate",
        entity_id: id,
        detail: {},
      });
    },
  };
}
