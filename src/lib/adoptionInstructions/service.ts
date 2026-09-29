import { z } from "zod";

import { adoptionInstructionContentSchema } from "./schemas";
import { ADOPTION_INSTRUCTIONS_PAGE_KEY } from "./content";
import {
  AdoptionInstructionConflictError,
  AdoptionInstructionError,
  type AdoptionInstructionRepository,
} from "./repository.server";

export { AdoptionInstructionConflictError, AdoptionInstructionError };

export type AdoptionInstructionActor = { authUserId: string; role: "staff" | "admin" };
export type UpdateDraftInput = {
  actor: AdoptionInstructionActor;
  expectedVersion: number;
  content: unknown;
};
export type PublishInput = {
  actor: AdoptionInstructionActor;
  expectedVersion: number;
  idempotencyKey: string;
};
export type RestoreInput = { actor: AdoptionInstructionActor; revisionId: string };

const positiveVersionSchema = z.number().int().positive();
const idempotencyKeySchema = z.string().trim().min(16).max(200);
const revisionIdSchema = z.string().uuid();

function requireActor(actor: AdoptionInstructionActor) {
  if (
    !actor ||
    typeof actor.authUserId !== "string" ||
    !actor.authUserId.trim() ||
    (actor.role !== "staff" && actor.role !== "admin")
  ) {
    throw new AdoptionInstructionError("unauthorized", 401);
  }
  return actor;
}

function requirePublishingAdmin(actor: AdoptionInstructionActor) {
  requireActor(actor);
  if (actor.role !== "admin") throw new AdoptionInstructionError("forbidden", 403);
}

export function createAdoptionInstructionService({
  repository,
  now = () => new Date(),
}: {
  repository: AdoptionInstructionRepository;
  now?: () => Date;
}) {
  const isoNow = () => now().toISOString();

  return {
    async getAdminPage({ actor }: { actor: AdoptionInstructionActor }) {
      requireActor(actor);
      return repository.getAdminPage();
    },

    async listHistory({
      actor,
      cursor,
      limit = 25,
    }: {
      actor: AdoptionInstructionActor;
      cursor?: string | null;
      limit?: number;
    }) {
      requireActor(actor);
      const boundedLimit = z.number().int().min(1).max(100).parse(limit);
      return repository.listHistory({ cursor, limit: boundedLimit });
    },

    async getRevision({
      actor,
      revisionId,
    }: {
      actor: AdoptionInstructionActor;
      revisionId: string;
    }) {
      requireActor(actor);
      const revision = await repository.getRevision(revisionIdSchema.parse(revisionId));
      if (!revision || revision.pageKey !== ADOPTION_INSTRUCTIONS_PAGE_KEY)
        throw new AdoptionInstructionError("not_found", 404);
      return revision;
    },

    async ensureDraft({
      actor,
      expectedPageVersion,
    }: {
      actor: AdoptionInstructionActor;
      expectedPageVersion: number;
    }) {
      requireActor(actor);
      const page = await repository.getAdminPage();
      if (page.draft) return page.draft;
      return repository.ensureDraft({
        actorUserId: actor.authUserId,
        expectedPageVersion: positiveVersionSchema.parse(expectedPageVersion),
        now: isoNow(),
      });
    },

    async updateDraft({ actor, expectedVersion, content }: UpdateDraftInput) {
      requireActor(actor);
      const parsedContent = adoptionInstructionContentSchema.parse(content);
      const page = await repository.getAdminPage();
      if (!page.draft) throw new AdoptionInstructionError("not_found", 404);
      const parsedVersion = positiveVersionSchema.parse(expectedVersion);
      if (page.draft.version !== parsedVersion) throw new AdoptionInstructionConflictError();
      return repository.updateDraft({
        actorUserId: actor.authUserId,
        expectedVersion: parsedVersion,
        content: parsedContent,
        now: isoNow(),
      });
    },

    async preview({ actor }: { actor: AdoptionInstructionActor }) {
      requireActor(actor);
      const page = await repository.getAdminPage();
      if (!page.draft) throw new AdoptionInstructionError("not_found", 404);
      return page.draft;
    },

    async publish({ actor, expectedVersion, idempotencyKey }: PublishInput) {
      requirePublishingAdmin(actor);
      // The atomic RPC checks the cached request before looking for a draft.
      const parsedVersion = positiveVersionSchema.parse(expectedVersion);
      return repository.publish({
        actorUserId: actor.authUserId,
        expectedVersion: parsedVersion,
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
        now: isoNow(),
      });
    },

    async archiveDraft({
      actor,
      expectedVersion,
    }: {
      actor: AdoptionInstructionActor;
      expectedVersion: number;
    }) {
      requirePublishingAdmin(actor);
      return repository.archiveDraft({
        actorUserId: actor.authUserId,
        expectedVersion: positiveVersionSchema.parse(expectedVersion),
        now: isoNow(),
      });
    },

    async restore({ actor, revisionId }: RestoreInput) {
      requirePublishingAdmin(actor);
      const sourceRevisionId = revisionIdSchema.parse(revisionId);
      const [page, source] = await Promise.all([
        repository.getAdminPage(),
        repository.getRevision(sourceRevisionId),
      ]);
      if (!source || source.pageKey !== ADOPTION_INSTRUCTIONS_PAGE_KEY)
        throw new AdoptionInstructionError("not_found", 404);
      adoptionInstructionContentSchema.parse(source.content);
      return repository.restore({
        actorUserId: actor.authUserId,
        sourceRevisionId,
        expectedPageVersion: page.page.version,
        now: isoNow(),
      });
    },
  };
}
