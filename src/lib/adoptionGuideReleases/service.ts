import {
  adoptionGuideDraftInputSchema,
  adoptionGuideMutationSchema,
  adoptionGuidePublishSchema,
  adoptionGuideReleaseIdSchema,
  adoptionGuideTransitionSchema,
} from "./schemas";
import { evaluateAdoptionGuideReadiness } from "./readiness";
import {
  AdoptionGuideReleaseError,
  type AdoptionGuideAdminQuery,
  type AdoptionGuideDraftInput,
  type AdoptionGuideReleaseRepository,
} from "./repository.server";
import type {
  AdoptionGuideAssetVerification,
  AdoptionGuidePreview,
  AdoptionGuideReadiness,
  AdoptionGuideRelease,
} from "./types";

export { AdoptionGuideReleaseError };
export type {
  AdoptionGuideAdminQuery,
  AdoptionGuideDraftInput,
  AdoptionGuideMutationInput,
  AdoptionGuidePublishResult,
  PaginatedAdoptionGuideReleases,
} from "./repository.server";

export type AdoptionGuideActor = {
  adminUserId: string;
  authUserId: string;
  role: "staff" | "admin";
};

function requireActor(actor: AdoptionGuideActor) {
  if (
    !actor ||
    typeof actor.adminUserId !== "string" ||
    !actor.adminUserId.trim() ||
    typeof actor.authUserId !== "string" ||
    !actor.authUserId.trim() ||
    (actor.role !== "staff" && actor.role !== "admin")
  ) {
    throw new AdoptionGuideReleaseError("unauthorized", 401);
  }
  return actor;
}

function requireAdmin(actor: AdoptionGuideActor) {
  requireActor(actor);
  if (actor.role !== "admin") {
    throw new AdoptionGuideReleaseError("forbidden", 403, "Admin approval is required.");
  }
}

function assertVersion(release: AdoptionGuideRelease, expectedVersion: number) {
  if (release.version !== expectedVersion) {
    throw new AdoptionGuideReleaseError("conflict", 409);
  }
}

function assertState(
  release: AdoptionGuideRelease,
  expected: "draft" | "in_review",
  message: string,
) {
  if (release.state !== expected) {
    throw new AdoptionGuideReleaseError("conflict", 409, message);
  }
}

function assertReady(readiness: AdoptionGuideReadiness) {
  if (!readiness.ready) {
    throw new AdoptionGuideReleaseError(
      "invalid",
      422,
      "Complete the required adoption guide content before continuing.",
      readiness.issues,
    );
  }
}

function selectedAsset(
  verification: AdoptionGuideAssetVerification | null,
  releaseAssetId: string | null,
) {
  return verification?.asset.id === releaseAssetId && verification.objectVerified
    ? verification.asset
    : null;
}

export function createAdoptionGuideReleaseService(repository: AdoptionGuideReleaseRepository) {
  async function getRelease(actor: AdoptionGuideActor, rawId: string) {
    requireActor(actor);
    const id = adoptionGuideReleaseIdSchema.parse(rawId);
    const release = await repository.getById(id);
    if (!release) throw new AdoptionGuideReleaseError("not_found", 404);
    return release;
  }

  async function readinessFor(release: AdoptionGuideRelease) {
    const assets = await repository.getAssets(release.zhHkAssetId, release.enAssetId);
    return {
      assets,
      readiness: evaluateAdoptionGuideReadiness(release, assets),
    };
  }

  return {
    async list({ actor, query }: { actor: AdoptionGuideActor; query: AdoptionGuideAdminQuery }) {
      requireActor(actor);
      return repository.list(query);
    },

    async get({ actor, id }: { actor: AdoptionGuideActor; id: string }) {
      return getRelease(actor, id);
    },

    async createDraft({
      actor,
      input,
    }: {
      actor: AdoptionGuideActor;
      input: AdoptionGuideDraftInput;
    }) {
      requireActor(actor);
      const parsed = adoptionGuideDraftInputSchema.parse(input);
      return repository.create(parsed, actor.authUserId);
    },

    async updateDraft({
      actor,
      id: rawId,
      input,
    }: {
      actor: AdoptionGuideActor;
      id: string;
      input: unknown;
    }) {
      requireActor(actor);
      const id = adoptionGuideReleaseIdSchema.parse(rawId);
      const parsed = adoptionGuideMutationSchema.parse(input);
      const release = await getRelease(actor, id);
      assertVersion(release, parsed.expectedVersion);
      assertState(release, "draft", "Only draft adoption guide releases can be edited.");
      return repository.update(id, parsed, actor.authUserId);
    },

    async submit({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: AdoptionGuideActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = adoptionGuideReleaseIdSchema.parse(rawId);
      const { expectedVersion } = adoptionGuideTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const release = await getRelease(actor, id);
      assertVersion(release, expectedVersion);
      assertState(release, "draft", "Only draft adoption guide releases can be submitted.");
      const { readiness } = await readinessFor(release);
      assertReady(readiness);
      return repository.transition({
        id,
        expectedVersion,
        operation: "submit",
        actorUserId: actor.authUserId,
      });
    },

    async withdraw({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: AdoptionGuideActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = adoptionGuideReleaseIdSchema.parse(rawId);
      const { expectedVersion } = adoptionGuideTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const release = await getRelease(actor, id);
      assertVersion(release, expectedVersion);
      assertState(release, "in_review", "Only in-review adoption guide releases can be withdrawn.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "withdraw",
        actorUserId: actor.authUserId,
      });
    },

    async returnToDraft({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: AdoptionGuideActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireAdmin(actor);
      const id = adoptionGuideReleaseIdSchema.parse(rawId);
      const { expectedVersion } = adoptionGuideTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const release = await getRelease(actor, id);
      assertVersion(release, expectedVersion);
      assertState(release, "in_review", "Only in-review adoption guide releases can be returned.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "return_to_draft",
        actorUserId: actor.authUserId,
      });
    },

    async preview({
      actor,
      id: rawId,
    }: {
      actor: AdoptionGuideActor;
      id: string;
    }): Promise<AdoptionGuidePreview> {
      const release = await getRelease(actor, rawId);
      const { assets, readiness } = await readinessFor(release);
      const zhHk = selectedAsset(assets.zhHk, release.zhHkAssetId);
      const en = selectedAsset(assets.en, release.enAssetId);
      const [zhHkUrl, enUrl] = await Promise.all([
        zhHk ? repository.previewAssetUrl(zhHk) : null,
        en ? repository.previewAssetUrl(en) : null,
      ]);

      return {
        release,
        readiness,
        adoptionPanel: {
          heading: release.knowledgeTitle || "Adoption guide",
          zhHkUrl,
          enUrl,
        },
        knowledgeCard: {
          title: release.knowledgeTitle,
          topic: release.knowledgeTopic,
          shortIntro: release.knowledgeShortIntro,
          sourceName: release.knowledgeSourceName,
          zhHkUrl,
          enUrl,
        },
      };
    },

    async publish({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
      idempotencyKey: rawIdempotencyKey,
    }: {
      actor: AdoptionGuideActor;
      id: string;
      expectedVersion: unknown;
      idempotencyKey: unknown;
    }) {
      requireAdmin(actor);
      const id = adoptionGuideReleaseIdSchema.parse(rawId);
      const { expectedVersion, idempotencyKey } = adoptionGuidePublishSchema.parse({
        expectedVersion: rawExpectedVersion,
        idempotencyKey: rawIdempotencyKey,
      });
      const release = await getRelease(actor, id);
      if (release.state === "in_review" && release.version === expectedVersion) {
        const { readiness } = await readinessFor(release);
        assertReady(readiness);
      }

      return repository.publish({
        id,
        expectedVersion,
        actorUserId: actor.authUserId,
        idempotencyKey,
      });
    },
  };
}
