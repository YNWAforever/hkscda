import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
  paymentPublicConfigTransitionSchema,
} from "./schemas";
import {
  PaymentPublicConfigError,
  type PaymentPublicConfigAdminQuery,
  type PaymentPublicConfigDraftInput,
  type PaymentPublicConfigRepository,
} from "./repository.server";
import type { PaymentPublicConfig } from "./types";

export { PaymentPublicConfigError };
export type {
  PaginatedPaymentPublicConfig,
  PaymentPublicConfigAdminQuery,
  PaymentPublicConfigDraftInput,
  PaymentPublicConfigMutationInput,
  PaymentPublicConfigPublishResult,
} from "./repository.server";

export type PaymentPublicConfigActor = {
  adminUserId: string;
  authUserId: string;
  role: "staff" | "treasurer" | "admin";
};

function requireActor(actor: PaymentPublicConfigActor) {
  if (
    !actor ||
    typeof actor.adminUserId !== "string" ||
    !actor.adminUserId.trim() ||
    typeof actor.authUserId !== "string" ||
    !actor.authUserId.trim() ||
    (actor.role !== "staff" && actor.role !== "treasurer" && actor.role !== "admin")
  ) {
    throw new PaymentPublicConfigError("unauthorized", 401);
  }
  return actor;
}

function requirePublisher(actor: PaymentPublicConfigActor) {
  requireActor(actor);
  if (actor.role !== "treasurer" && actor.role !== "admin") {
    throw new PaymentPublicConfigError(
      "forbidden",
      403,
      "Treasurer or admin approval is required.",
    );
  }
}

function assertVersion(config: PaymentPublicConfig, expectedVersion: number) {
  if (config.version !== expectedVersion) {
    throw new PaymentPublicConfigError("conflict", 409);
  }
}

function assertState(
  config: PaymentPublicConfig,
  expected: "draft" | "in_review",
  message: string,
) {
  if (config.state !== expected) {
    throw new PaymentPublicConfigError("conflict", 409, message);
  }
}

export function createPaymentPublicConfigService(repository: PaymentPublicConfigRepository) {
  async function getConfig(actor: PaymentPublicConfigActor, rawId: string) {
    requireActor(actor);
    const id = paymentPublicConfigIdSchema.parse(rawId);
    const config = await repository.getById(id);
    if (!config) throw new PaymentPublicConfigError("not_found", 404);
    return config;
  }

  return {
    async list({
      actor,
      query,
    }: {
      actor: PaymentPublicConfigActor;
      query: PaymentPublicConfigAdminQuery;
    }) {
      requireActor(actor);
      return repository.list(query);
    },

    async get({ actor, id }: { actor: PaymentPublicConfigActor; id: string }) {
      return getConfig(actor, id);
    },

    async createDraft({
      actor,
      input,
    }: {
      actor: PaymentPublicConfigActor;
      input: PaymentPublicConfigDraftInput;
    }) {
      requireActor(actor);
      const parsed = paymentPublicConfigDraftInputSchema.parse(input);
      return repository.create(parsed, actor.authUserId);
    },

    async updateDraft({
      actor,
      id: rawId,
      input,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      input: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const parsed = paymentPublicConfigMutationSchema.parse(input);
      const config = await getConfig(actor, id);
      assertVersion(config, parsed.expectedVersion);
      assertState(config, "draft", "Only draft config rows can be edited.");
      return repository.update(id, parsed, actor.authUserId);
    },

    async submit({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "draft", "Only draft config rows can be submitted.");
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
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "in_review", "Only in-review config rows can be withdrawn.");
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
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requirePublisher(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "in_review", "Only in-review config rows can be returned.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "return_to_draft",
        actorUserId: actor.authUserId,
      });
    },

    async publish({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
      idempotencyKey: rawIdempotencyKey,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
      idempotencyKey: unknown;
    }) {
      requirePublisher(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion, idempotencyKey } = paymentPublicConfigPublishSchema.parse({
        expectedVersion: rawExpectedVersion,
        idempotencyKey: rawIdempotencyKey,
      });
      return repository.publish({
        id,
        expectedVersion,
        actorUserId: actor.authUserId,
        idempotencyKey,
      });
    },
  };
}
